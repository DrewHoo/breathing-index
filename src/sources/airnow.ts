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
import * as v from 'valibot'
import { RELAY_BASE, coarse } from './relay'

/** The AirNow parameters this app has rows for, under the app's own names. */
export type AirNowVariable = 'pm25' | 'o3' | 'pm10' | 'so2'

/** AirNow's `Parameter` spellings, mapped to the app's variable names. */
const VARIABLES: Record<string, AirNowVariable> = {
  'PM2.5': 'pm25',
  PM10: 'pm10',
  OZONE: 'o3',
  O3: 'o3',
  SO2: 'so2',
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
  so2: 'SO2',
}

/**
 * µg/m³ per ppb at the EPA's 25 °C / 1013 hPa — the same constant `aqi.ts` and
 * `scripts/derive-breakpoints.mjs` use. AirNow reports ozone in PPB and both
 * particle sizes in UG/M3; the app's vector is metric throughout, so ozone is
 * converted here and nothing downstream has to know a unit changed hands.
 */
const UG_M3_PER_PPB_O3 = 1.96

/**
 * The same conversion for SO₂ at the same reference conditions — a different
 * number because it is a different molecule (64.06 g/mol against ozone's
 * 48.00), and one place where reusing the ozone constant would be wrong by a
 * third. AirNow reports SO₂ in PPB like ozone, so the same rule applies: the
 * unit changes hands here and the vector stays metric throughout
 * (specs/29-sulfur-dioxide.md).
 */
const UG_M3_PER_PPB_SO2 = 2.62

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

/**
 * The wire schema behind that type. Parameter and UTC are load-bearing — a
 * row without them is a retired-endpoint shape and nulls out, the same skip
 * `parseAirNow` still performs. Everything else falls back to the value the
 * parser already treats as absence: −999 is AirNow's own missing-concentration
 * sentinel, −1 is its "no AQI", and an unlabelled Unit reads as µg/m³ the
 * way both particle rows do. Non-array halves ({WebServiceError: […]},
 * the Anchorage case) fall back to empty.
 */
const RowSchema = v.object({
  Parameter: v.string(),
  UTC: v.string(),
  Latitude: v.fallback(v.number(), Number.NaN),
  Longitude: v.fallback(v.number(), Number.NaN),
  Unit: v.fallback(v.string(), ''),
  Value: v.fallback(v.number(), -999),
  RawConcentration: v.fallback(v.number(), -999),
  AQI: v.fallback(v.number(), -1),
  Category: v.fallback(v.number(), 0),
  SiteName: v.fallback(v.string(), ''),
})

const ForecastRowSchema = v.object({
  reportingArea: v.fallback(v.optional(v.string()), undefined),
  dateValid: v.fallback(v.optional(v.string()), undefined),
  actionDay: v.fallback(v.optional(v.boolean()), undefined),
})

const PayloadSchema = v.object({
  observations: v.fallback(v.optional(v.array(v.fallback(v.nullable(RowSchema), null)), []), []),
  forecast: v.fallback(v.optional(v.array(v.fallback(v.nullable(ForecastRowSchema), null)), []), []),
})

/** The typed payload, or null for a body that isn't even an object. */
export function parseAirNowPayload(body: unknown): AirNowPayload | null {
  const parsed = v.safeParse(PayloadSchema, body)
  if (!parsed.success) return null
  return {
    observations: parsed.output.observations.filter((row) => row !== null),
    forecast: parsed.output.forecast.filter((row) => row !== null),
  }
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
  if (row.Unit.toUpperCase() !== 'PPB') return row.RawConcentration
  // Which gas it is decides the factor, so the row's own parameter name picks
  // it: both particle sizes arrive in UG/M3 and never reach this line, and the
  // two gases the app reads are the two that do.
  const ppb = VARIABLES[row.Parameter.toUpperCase()] === 'so2' ? UG_M3_PER_PPB_SO2 : UG_M3_PER_PPB_O3
  return row.RawConcentration * ppb
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
 * The bar is pm2.5 *and* ozone inside the trailing 24 hours — which, since
 * specs/24-vector-diet.md, is every pollutant the engine reasons about at all.
 * NO₂ used to be the interesting omission here, on the grounds that AirNow's
 * network barely reports it and an absent variable is unknown rather than
 * clean; that spec then dropped it from the vector outright, for reasons of
 * its own, so there is nothing left to omit. PM10 is not on the list either,
 * for the opposite reason: monitors do report it and the air table shows it,
 * but it is display-only, so a station series missing it is still carrying a
 * complete vector.
 *
 * SO₂ is off the list for a third reason (specs/29-sulfur-dioxide.md). It is
 * in the vector, and the bar still does not name it: the nearest monitor
 * reporting SO₂ is a lucky extra, not a condition. Where one does, the station
 * series carries it; where none does, the variable is simply absent and the
 * table says so in as many words, because filling it from CAMS would be a
 * model number smuggled into a station series.
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
  // SO₂ is measured (specs/29-sulfur-dioxide.md) and still has no chip: the
  // strip's chips are AQI points walked back to concentrations through
  // `aqi.ts`, whose breakpoint tables cover the three pollutants it calls
  // `Bridgeable`, and SO₂ is not one of them. A chip with no bridge behind it
  // would be a point with no number a person could check — and adding the
  // table would mean transcribing a fourth AQI breakpoint set to serve a
  // pollutant that is at background on nearly every day. The exposure vector
  // takes SO₂ by the raw concentration, which needs no bridge at all.
  const readings = (Object.keys(AIRNOW_PARAMETER) as AirNowVariable[])
    .filter((variable) => variable !== 'so2')
    .flatMap((variable) => {
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
    const payload = parseAirNowPayload(await res.json())
    return payload === null ? null : parseAirNow(payload, lat, lon)
  })()
  inFlight.set(key, request)
  // Held only for the duration of the request: the relay owns the hour of
  // caching, and a page left open overnight must not keep yesterday's air.
  void request.catch(() => null).finally(() => inFlight.delete(key))
  return request
}
