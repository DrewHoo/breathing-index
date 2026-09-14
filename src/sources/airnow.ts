/**
 * Measured stations via AirNow's bounding-box "Observations by Monitoring
 * Site" service, reached through the relay (worker/), which holds the key,
 * draws the box around a coarse grid cell and caches by it.
 *
 * Until September 2026 this file read AirNow's reporting-area endpoints, which
 * publish AQI *points* and nothing else — which is why the measured strip had
 * to walk points back to micrograms through `aqi.ts`, and why a station number
 * could never reach the inference engine. Those endpoints retire 2026-09-30.
 * Their replacement, `aq/data/`, returns one row per monitor per hour carrying
 * the raw concentration alongside the point, so AirNow becomes an exposure
 * source the engine can learn against (specs/21-airnow-migration.md).
 *
 * Two things about those rows decide most of the code below. `RawConcentration`
 * is −999 when the hour's raw reading has not posted yet, which is the normal
 * state of the newest hour: AirNow publishes the NowCast first and the raw
 * hourly behind it. And `Value` is that NowCast — a weighted multi-hour
 * average — so it is the wrong number to run our own windows over, however
 * much more often it is present.
 */
import { RELAY_BASE, coarse } from './relay'

/** The AirNow parameters this app has rows for, under the app's own names. */
export type AirNowVariable = 'pm25' | 'o3' | 'pm10'

/** AirNow's `Parameter` spellings, mapped to the app's variable names. */
const VARIABLES: Record<string, AirNowVariable> = {
  'PM2.5': 'pm25',
  PM10: 'pm10',
  OZONE: 'o3',
  O3: 'o3',
}

/**
 * Back the other way, for the measured strip: `aqi.ts` bridges AQI points to
 * concentrations by AirNow's own parameter names, so a chip has to be able to
 * say which name it came from.
 */
export const AIRNOW_PARAMETER: Record<AirNowVariable, string> = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  o3: 'OZONE',
}

/**
 * µg/m³ per ppb at the EPA's 25 °C / 1013 hPa — the same constant `aqi.ts` and
 * `scripts/derive-breakpoints.mjs` use. AirNow reports ozone in PPB and both
 * particle sizes in UG/M3; the app's vector is metric throughout, so ozone is
 * converted here and nothing downstream has to know a unit changed hands.
 */
const UG_M3_PER_PPB_O3 = 1.96

/** AirNow writes −999 where a concentration is missing; monitors legitimately
 * report small negatives near zero, so the floor sits between the two. */
const MISSING = -900

/** One row of `aq/data/`, narrowed to the fields this app reads. */
export interface AirNowRow {
  Latitude: number
  Longitude: number
  /** always UTC, hour resolution: "2026-09-13T22:00" */
  UTC: string
  Parameter: string
  Unit: string
  /** the NowCast — a multi-hour weighted average, never a raw hourly reading */
  Value: number
  RawConcentration: number
  AQI: number
  Category: number
  SiteName: string
}

/**
 * One row of the surviving reporting-area forecast service. Its fields are
 * camelCase where the retired lat/long forecast's were PascalCase, so this
 * shape is the tell that the relay is on the new endpoint.
 */
export interface AirNowForecastRow {
  reportingArea?: string
  dateValid?: string
  actionDay?: boolean
}

/** The relay's /v1/airnow payload: site observations plus today's forecast. */
export interface AirNowPayload {
  observations?: AirNowRow[]
  forecast?: AirNowForecastRow[]
}

/** One parameter's hourly series from the nearest monitor that reports it. */
export interface MonitorSeries {
  siteName: string
  /** UTC hour key -> concentration in µg/m³ */
  byHour: Map<string, number>
  /** the newest hour with an AQI point, which is all the strip's chips need */
  latestAqi: { hour: string; aqi: number; category: string } | null
  /** true when this monitor reported at all inside the trailing 24 hours */
  recent: boolean
}

export interface AirNowObservations {
  monitors: Partial<Record<AirNowVariable, MonitorSeries>>
  actionDay: boolean
  /** the forecast's reporting area ("New Haven"), or the nearest site's name */
  reportingArea: string
  /** the newest observation hour in the payload, UTC — the window's anchor */
  newestHour: string | null
}

/** AQI category names, indexed by AirNow's `Category` number. */
const CATEGORIES = [
  '',
  'Good',
  'Moderate',
  'Unhealthy for Sensitive Groups',
  'Unhealthy',
  'Very Unhealthy',
  'Hazardous',
]

/**
 * AirNow measures the United States and a handful of embassies, so asking for
 * a bounding box over Amsterdam spends a request to be told nothing.
 *
 * A bounding box rather than a country code on purpose: the only geocode this
 * app performs returns a formatted label ("Hamden, CT"), not a country, and
 * reshaping it — or adding a second lookup — to answer a question a rectangle
 * answers would buy accuracy nobody spends. The failure mode of the rectangle
 * is a wasted relay call over Tijuana or Windsor, after which the payload is
 * empty and the series falls back to the model exactly as it would have.
 */
export function inAirNowCoverage(lat: number, lon: number): boolean {
  const box = (s: number, w: number, n: number, e: number): boolean =>
    lat >= s && lat <= n && lon >= w && lon <= e
  return (
    box(24, -125, 50, -66) || // contiguous 48
    box(51, -170, 72, -129) || // Alaska
    box(18, -161, 23, -154) || // Hawaii
    box(17, -68, 19, -64) // Puerto Rico and the US Virgin Islands
  )
}

/** Kilometres between two points, flat-earth — fine inside a half-degree box. */
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (aLat - bLat) * 111
  const dLon = (aLon - bLon) * 111 * Math.cos((aLat * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

/** The concentration a row carries, in µg/m³, or null when it carries none. */
function concentration(row: AirNowRow): number | null {
  if (!Number.isFinite(row.RawConcentration) || row.RawConcentration <= MISSING) return null
  return row.Unit.toUpperCase() === 'PPB'
    ? row.RawConcentration * UG_M3_PER_PPB_O3
    : row.RawConcentration
}

/**
 * The hour key `count` hours earlier. Keys are UTC and fixed-width, so "inside
 * the last day" is a string comparison against this one once it is computed.
 */
function hoursBefore(hour: string, count: number): string {
  return new Date(Date.parse(`${hour}:00Z`) - count * 3_600_000).toISOString().slice(0, 16)
}

interface Candidate {
  siteName: string
  distanceKm: number
  rows: AirNowRow[]
}

/**
 * The nearest monitor reporting this parameter — with "reported lately" ahead
 * of "is closest" in the ordering, because a site three kilometres away that
 * went quiet yesterday is not a better answer than a live one at fifteen. A
 * monitor is only a candidate once it has produced at least one concentration
 * inside the window, so a site returning nothing but −999 never shadows a
 * working one.
 */
function nearestMonitor(candidates: Candidate[], since: string): MonitorSeries | undefined {
  const ranked = candidates
    .map((c) => {
      const byHour = new Map<string, number>()
      let latestAqi: MonitorSeries['latestAqi'] = null
      for (const row of c.rows) {
        const value = concentration(row)
        if (value !== null) byHour.set(row.UTC, value)
        // AQI −1 is the API's "no data": a chip showing it would be a reading
        // nobody took. The raw concentration has its own sentinel, −999, and
        // small negative readings near zero are instrument noise, not absence.
        if (row.AQI >= 0 && (latestAqi === null || row.UTC > latestAqi.hour)) {
          latestAqi = {
            hour: row.UTC,
            aqi: row.AQI,
            category: CATEGORIES[row.Category] ?? '',
          }
        }
      }
      const newest = [...byHour.keys()].sort().pop()
      return {
        siteName: c.siteName,
        byHour,
        latestAqi,
        recent: newest !== undefined && newest >= since,
        distanceKm: c.distanceKm,
      }
    })
    .filter((m) => m.byHour.size > 0)
    .sort((a, b) => Number(b.recent) - Number(a.recent) || a.distanceKm - b.distanceKm)
  const best = ranked[0]
  if (!best) return undefined
  const { distanceKm: _distance, ...series } = best
  return series
}

/**
 * The payload as hourly concentrations from the nearest monitor per parameter.
 * Null when AirNow had nothing at all to say — no rows and no Action Day.
 */
export function parseAirNow(
  payload: AirNowPayload,
  lat: number,
  lon: number,
): AirNowObservations | null {
  // AirNow answers "no forecast issued for this reporting area" with HTTP 200
  // and a `{WebServiceError: [...]}` object rather than an empty list, so
  // neither half of the payload can be assumed to be an array — Anchorage in
  // September is the case that found this.
  const rows = Array.isArray(payload.observations) ? payload.observations : []
  const forecast = Array.isArray(payload.forecast) ? payload.forecast : []
  const actionDay = forecast.some((f) => f.actionDay === true)
  const newestHour = rows.reduce<string | null>(
    (newest, row) =>
      typeof row?.UTC === 'string' && (newest === null || row.UTC > newest) ? row.UTC : newest,
    null,
  )
  if (rows.length === 0 && !actionDay) return null

  // 24 hours back from the newest hour the payload holds, not from the clock:
  // a relay cache hit is an hour old by design and must not read as a network
  // that went dark.
  const since = newestHour === null ? '' : hoursBefore(newestHour, 23)

  const grouped = new Map<AirNowVariable, Map<string, Candidate>>()
  for (const row of rows) {
    // A relay still on the retired endpoints answers with rows shaped nothing
    // like these (`ParameterName`, no `UTC`). Skipping them rather than
    // reading through them means a client deployed ahead of its worker shows
    // the model quietly, instead of throwing inside the measured strip.
    if (typeof row?.Parameter !== 'string' || typeof row.UTC !== 'string') continue
    const variable = VARIABLES[row.Parameter.toUpperCase()]
    if (!variable) continue
    let sites = grouped.get(variable)
    if (!sites) grouped.set(variable, (sites = new Map()))
    let site = sites.get(row.SiteName)
    if (!site) {
      site = {
        siteName: row.SiteName,
        distanceKm: distanceKm(lat, lon, row.Latitude, row.Longitude),
        rows: [],
      }
      sites.set(row.SiteName, site)
    }
    site.rows.push(row)
  }

  const monitors: Partial<Record<AirNowVariable, MonitorSeries>> = {}
  for (const [variable, sites] of grouped) {
    const monitor = nearestMonitor([...sites.values()], since)
    if (monitor) monitors[variable] = monitor
  }

  const nearestSite = monitors.pm25?.siteName ?? monitors.o3?.siteName ?? monitors.pm10?.siteName
  return {
    monitors,
    actionDay,
    reportingArea: forecast.find((f) => f.reportingArea)?.reportingArea ?? nearestSite ?? '',
    newestHour,
  }
}

/**
 * Whether these monitors can carry an exposure series on their own.
 *
 * The bar is pm2.5 *and* ozone inside the trailing 24 hours, the two variables
 * the engine reasons about that AirNow measures. NO₂ is deliberately not on
 * the list: AirNow's network barely reports it, and under the null discipline
 * an absent variable is unknown rather than clean, so a series without it says
 * nothing about it instead of claiming zero. specs/24-vector-diet.md drops NO₂
 * from the vector outright for reasons that have nothing to do with AirNow.
 */
export function coversExposureVector(observations: AirNowObservations): boolean {
  return observations.monitors.pm25?.recent === true && observations.monitors.o3?.recent === true
}

/* --- the measured strip, which still speaks AQI points --- */

export interface AirNowReading {
  parameter: string
  aqi: number
  category: string
  isPrimary: boolean
}

export interface AirNowReport {
  reportingArea: string
  /** the newest observed hour, UTC ("2026-09-13T22:00"), or '' if none */
  time: string
  observations: AirNowReading[]
  actionDay: boolean
}

/**
 * The strip's view of the same payload: one AQI point per parameter, from each
 * monitor's newest hour. isPrimary is derived as the highest AQI present — the
 * API does not mark a primary pollutant, and highest is exactly what AirNow's
 * own displays mean by the word. An Action Day with no observations still
 * reports (empty chips, real banner).
 */
export function airNowReport(observations: AirNowObservations): AirNowReport | null {
  const readings = (Object.keys(AIRNOW_PARAMETER) as AirNowVariable[]).flatMap((variable) => {
    const latest = observations.monitors[variable]?.latestAqi
    return latest ? [{ variable, ...latest }] : []
  })
  if (readings.length === 0 && !observations.actionDay) return null
  const top = Math.max(...readings.map((r) => r.aqi))
  const newest = readings.reduce<string>((a, r) => (r.hour > a ? r.hour : a), '')
  return {
    reportingArea: observations.reportingArea,
    time: newest,
    observations: readings.map((r) => ({
      parameter: AIRNOW_PARAMETER[r.variable],
      aqi: r.aqi,
      category: r.category,
      isPrimary: r.aqi === top,
    })),
    actionDay: observations.actionDay,
  }
}

/**
 * One in-flight request per grid cell, shared by both callers: the exposure
 * series wants the concentrations and the measured strip wants the points, out
 * of the same payload, and `aq/data/` is capped at 500 requests per hour per
 * key. The relay's KV would absorb a duplicate anyway; this keeps the browser
 * from making it in the first place.
 */
const inFlight = new Map<string, Promise<AirNowObservations | null>>()

export async function fetchAirNow(lat: number, lon: number): Promise<AirNowObservations | null> {
  const key = `${coarse(lat)},${coarse(lon)}`
  const pending = inFlight.get(key)
  if (pending) return pending
  const request = (async () => {
    const res = await fetch(`${RELAY_BASE}/v1/airnow?lat=${coarse(lat)}&lon=${coarse(lon)}`)
    if (!res.ok) return null
    return parseAirNow((await res.json()) as AirNowPayload, lat, lon)
  })()
  inFlight.set(key, request)
  // Held only for the duration of the request: the relay owns the hour of
  // caching, and a page left open overnight must not keep yesterday's air.
  void request.catch(() => null).finally(() => inFlight.delete(key))
  return request
}
