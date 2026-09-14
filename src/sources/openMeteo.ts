import type { Exposure } from '../engine/types'
import {
  coversExposureVector,
  fetchAirNow,
  inAirNowCoverage,
  type AirNowObservations,
  type AirNowVariable,
  type MonitorSeries,
} from './airnow'
import { type PollenDay, fetchPollen } from './googlePollen'
import { calendarPollen, monthOf } from './pollenCalendar'

/** The display order of the three pollen rows. */
export const POLLEN_TYPE_ORDER = ['tree', 'grass', 'weed'] as const

export interface Hour {
  time: string
  exposure: Exposure
  /** raw instantaneous values for display, keyed like exposure variables */
  raw: Record<string, number>
  /** official composite indices, for scoreboard receipts only */
  official: { usAqi: number | null; eaqi: number | null }
  /**
   * The three pollen rows' display: per type, Google's own type index as the
   * headline and the per-plant readings ("birch 4 · oak 2") as the sub-label
   * — every number the engine can cite, visible on the row. Optional because
   * series cached by earlier versions are re-read from localStorage and
   * predate the field.
   */
  pollenDisplay?: PollenDay['types']
  /**
   * Exposure keys whose values are estimates rather than readings — the
   * calendar pollen types, on hours the measured feed does not cover. Copied
   * onto diary entries, where it stops the engine confirming a bound from a
   * guess.
   */
  estimated?: string[]
  /**
   * Set on the hours of a measured series whose air is still a model forecast.
   * AirNow has no hourly forecast — it publishes a daily category and nothing
   * that would draw a curve — and the home screen's "walk before 10 am" needs
   * one, so the hours after now on an `airnow` series come from CAMS and say
   * so. Nothing is ever logged against them: a diary entry captures the
   * current hour, which on such a series is always measured. The seam this
   * marks is drawn in specs/27-one-ozone.md.
   */
  forecastSource?: 'cams'
}

export interface ExposureSeries {
  hours: Hour[]
  currentIndex: number
  /**
   * When this object was parsed — debug metadata only. It is not a freshness
   * signal: a service-worker cache hit is parsed now and carries hours-old air.
   * Everything the UI says about age comes from the hours themselves (see
   * ui/freshness.ts).
   */
  fetchedAt: string
  utcOffsetSeconds: number
  /** which source these numbers are: learned bounds are scoped to it */
  source: string
  /**
   * Variable -> the monitor that produced it, when a monitor did. The air
   * table names the station on the row rather than in a caption somewhere
   * else, because "PM2.5 · New Haven monitor" is the whole difference between
   * a measurement and a model cell.
   */
  siteNames?: Partial<Record<string, string>>
}

/**
 * Open-Meteo's air-quality endpoint serves the CAMS model, not monitors. The
 * name is on every entry logged against it, because a bound learned here does
 * not transfer to a station feed reading the same air differently.
 */
export const EXPOSURE_SOURCE = 'cams'

/**
 * The station source. It is a separate name from `cams` because that is what
 * scopes learned bounds: CAMS global carries a warm-season positive ozone bias
 * in the eastern US — 166 µg/m³ in Hamden on 2026-08-07 against a New Haven
 * monitor implying about 82 — so a threshold learned on one feed is not a
 * threshold on the other (docs/trigger-model.md).
 */
export const AIRNOW_SOURCE = 'airnow'

const AIR_VARS =
  'pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,us_aqi,european_aqi'
const WEATHER_VARS = 'temperature_2m,relative_humidity_2m,dew_point_2m'

interface HourlyBlock {
  time: string[]
  [key: string]: (number | null)[] | string[]
}

const series = (block: HourlyBlock, key: string): (number | null)[] =>
  (block[key] as (number | null)[] | undefined) ?? []

/**
 * API times ("2026-08-07T13:00") are local to the location, with the offset
 * carried separately; this is the instant such an hour begins.
 */
export function hourInstant(time: string, utcOffsetSeconds: number): number {
  return Date.parse(`${time.slice(0, 16)}:00Z`) - utcOffsetSeconds * 1000
}

/** API times are local to the location; find the hour containing "now". */
export function findCurrentIndex(times: string[], utcOffsetSeconds: number): number {
  const nowKey = `${new Date(Date.now() + utcOffsetSeconds * 1000).toISOString().slice(0, 14)}00`
  const index = times.findIndex((t) => t >= nowKey)
  return index === -1 ? times.length - 1 : index
}

/**
 * Window features return null, not 0, when the window holds no data. A gap in
 * the feed is not a clean reading: recorded as 0 it would drop the variable
 * below its background floor and quietly disqualify the real trigger from
 * candidacy. Absent, it simply proves nothing either way.
 */
function windowMax(values: (number | null)[], i: number, span: number): number | null {
  let max: number | null = null
  for (let j = Math.max(0, i - span + 1); j <= i; j++) {
    const v = values[j]
    if (v != null && (max === null || v > max)) max = v
  }
  return max
}

function windowMean(values: (number | null)[], i: number, span: number): number | null {
  let sum = 0
  let n = 0
  for (let j = Math.max(0, i - span + 1); j <= i; j++) {
    const v = values[j]
    if (v != null) {
      sum += v
      n++
    }
  }
  return n === 0 ? null : sum / n
}

/**
 * The UTC hour key ("2026-09-13T22:00") for one of Open-Meteo's local hour
 * strings — the join between the two feeds. Open-Meteo serves times local to
 * the location with the offset carried separately; AirNow serves UTC. Keeping
 * the series on Open-Meteo's local grid is deliberate: freshness, the current
 * hour and the by-hour curve all read local time strings, and they keep
 * working unchanged whichever source filled the numbers in.
 */
function utcHourKey(time: string, utcOffsetSeconds: number): string {
  return new Date(hourInstant(time, utcOffsetSeconds)).toISOString().slice(0, 16)
}

/**
 * One monitor's readings laid onto the series' hour grid, with the model
 * carrying the hours after now.
 *
 * Past hours the monitor did not report are left absent rather than filled:
 * AirNow publishes the NowCast before the raw hourly, so the current hour's
 * raw concentration is routinely missing, and a gap written as 0 would drop
 * the variable below its background floor and quietly disqualify the real
 * trigger from suspicion (docs/trigger-model.md). The 8-hour window spans the
 * gap on its own.
 *
 * Forecast hours come from CAMS, which means the window features for the first
 * few hours after now mix a measured past with a modelled future. That is the
 * honest reading of "what will the last eight hours have held by 3 pm", and no
 * bound is ever learned from it — only the current hour is ever logged.
 */
function monitorColumn(
  monitor: MonitorSeries | undefined,
  times: string[],
  utcOffsetSeconds: number,
  modelled: (number | null)[],
  currentIndex: number,
): (number | null)[] {
  if (!monitor) return times.map(() => null)
  return times.map((time, i) =>
    i > currentIndex
      ? (modelled[i] ?? null)
      : (monitor.byHour.get(utcHourKey(time, utcOffsetSeconds)) ?? null),
  )
}

/**
 * The pollen half of an hour: which types, at what index, named by which
 * plants, and whether the numbers were measured or a calendar's claim. See
 * specs/18-measured-pollen.md for why a day, not an hour, is the resolution.
 */
export function pollenForHour(
  measured: Map<string, PollenDay> | null,
  lat: number,
  lon: number,
  time: string,
): { day: PollenDay; estimated: boolean } {
  const fromGoogle = measured?.get(time.slice(0, 10))
  if (fromGoogle) return { day: fromGoogle, estimated: false }
  return { day: calendarPollen(lat, lon, monthOf(time)), estimated: true }
}

/** What the caller wants consulted beyond the model feeds. */
export interface ExposureOptions {
  /**
   * Ask AirNow's monitors too, and run the series off them when they cover the
   * vector. Off by default so a history backfill and a test both stay on the
   * model; the home screen passes the user's Settings toggle.
   */
  airnow?: boolean
}

/**
 * Fetch air quality + weather and derive per-hour exposure vectors using the
 * per-variable windows from docs/trigger-model.md (o3/no2/pm: max8h;
 * heat/cold: instantaneous; humidity: mean72h; pollen: its local day's index,
 * daily being all any pollen source resolves). Pollen rides a separate pipe
 * (googlePollen.ts via the relay, today forward) with the season calendar
 * behind it for the past tail and for outages — a fallback hour is
 * estimated-tagged, never silently interchangeable with a measured one.
 *
 * Two feeds can fill the pollutant columns. CAMS model data is the default and
 * the worldwide one; it can miss hyper-local smoke, and over the US it is a
 * 45 km cell. When AirNow is on, the place is inside AirNow's coverage, and
 * the nearest monitors reported both pm2.5 and ozone in the trailing day, the
 * measured columns replace the modelled ones and the whole series is labelled
 * `airnow` — one source per series, because that is what learned bounds are
 * scoped to. Anything short of that and the series is `cams` exactly as
 * before. The window features are computed the same way either way: the
 * source decides what goes into the columns, never what is done with them.
 */
export async function fetchExposureSeries(
  lat: number,
  lon: number,
  options: ExposureOptions = {},
): Promise<ExposureSeries> {
  const common = `latitude=${lat}&longitude=${lon}&past_days=3&forecast_days=2&timezone=auto`
  const wantsMonitors = options.airnow === true && inAirNowCoverage(lat, lon)
  const [airRes, weatherRes, pollenDays, monitors] = await Promise.all([
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${common}&hourly=${AIR_VARS}`),
    fetch(`https://api.open-meteo.com/v1/forecast?${common}&hourly=${WEATHER_VARS}`),
    fetchPollen(lat, lon),
    // A station outage must not take the whole screen down: without monitors
    // this is the series it has always been.
    wantsMonitors
      ? fetchAirNow(lat, lon).catch((): AirNowObservations | null => null)
      : Promise.resolve(null),
  ])
  if (!airRes.ok || !weatherRes.ok) {
    throw new Error(`Open-Meteo fetch failed (${airRes.status}/${weatherRes.status})`)
  }
  const air = (await airRes.json()) as { hourly: HourlyBlock; utc_offset_seconds: number }
  const weather = (await weatherRes.json()) as { hourly: HourlyBlock }

  const times = air.hourly.time
  const weatherTimeIndex = new Map(weather.hourly.time.map((t, i) => [t, i]))
  const currentIndex = findCurrentIndex(times, air.utc_offset_seconds)

  const modelled = {
    pm25: series(air.hourly, 'pm2_5'),
    pm10: series(air.hourly, 'pm10'),
    o3: series(air.hourly, 'ozone'),
  }
  const no2 = series(air.hourly, 'nitrogen_dioxide')
  const so2 = series(air.hourly, 'sulphur_dioxide')
  const co = series(air.hourly, 'carbon_monoxide')
  const usAqi = series(air.hourly, 'us_aqi')
  const eaqi = series(air.hourly, 'european_aqi')
  const temp = series(weather.hourly, 'temperature_2m')
  const rh = series(weather.hourly, 'relative_humidity_2m')
  const dew = series(weather.hourly, 'dew_point_2m')

  const measured = monitors !== null && coversExposureVector(monitors) ? monitors : null
  // Everything the monitors do not measure leaves the series with them. NO₂ is
  // the one that matters: AirNow rarely reports it, and under the null
  // discipline an absent variable is unknown, not clean — a CAMS number
  // smuggled into a station series would be a bound learned against the wrong
  // instrument. SO₂ and CO are display-only leftovers and go for company.
  const modelOnly = (column: (number | null)[]): (number | null)[] =>
    measured ? times.map(() => null) : column
  const column = (variable: AirNowVariable): (number | null)[] =>
    measured
      ? monitorColumn(
          measured.monitors[variable],
          times,
          air.utc_offset_seconds,
          modelled[variable],
          currentIndex,
        )
      : modelled[variable]

  const pm25 = column('pm25')
  const pm10 = column('pm10')
  const o3 = column('o3')
  const no2Column = modelOnly(no2)
  const so2Column = modelOnly(so2)
  const coColumn = modelOnly(co)

  const hours: Hour[] = times.map((time, i) => {
    const wi = weatherTimeIndex.get(time) ?? i
    const t = temp[wi] ?? null
    const d = dew[wi] ?? null
    const heatStress = t != null ? Math.max(0, t - 25) : null
    const coldDryStress = t == null ? null : t < 10 && d != null && d < 2 ? 10 - t : 0
    // The engine may only reason about variables the app can show the user, so
    // so2 and co stay out of the exposure vector until the air table has rows
    // for them: an evidence line must never cite a number nobody can check.
    const exposure: Exposure = {}
    const put = (variable: string, x: number | null): void => {
      if (x !== null) exposure[variable] = x
    }
    put('pm25', windowMax(pm25, i, 8))
    put('pm10', windowMax(pm10, i, 8))
    put('o3', windowMax(o3, i, 8))
    put('no2', windowMax(no2Column, i, 8))
    put('heat_stress', heatStress)
    put('cold_dry_stress', coldDryStress)
    put('humidity', windowMean(rh, wi, 72))
    // Pollen resolves by local day, not hour, so the day's index stands in for
    // every hour of it — no running window, the same number smeared through a
    // max is just the same number. Plants, not types, enter the vector: only
    // plant-level numbers can ever answer "birch and not oak". The null
    // discipline holds: a plant the source omitted is absent, not zero.
    const { day: pollenDay, estimated: pollenEstimated } = pollenForHour(pollenDays, lat, lon, time)
    for (const [variable, value] of Object.entries(pollenDay.exposure)) put(variable, value)

    // The raw row follows the same rule as the vector: a variable this hour
    // has no reading for is missing from it, never zero. The air table skips
    // the row rather than printing a nought nobody measured.
    const raw: Record<string, number> = { ...pollenDay.exposure }
    const putRaw = (variable: string, x: number | null): void => {
      if (x !== null) raw[variable] = x
    }
    putRaw('pm25', pm25[i] ?? null)
    putRaw('pm10', pm10[i] ?? null)
    putRaw('o3', o3[i] ?? null)
    putRaw('no2', no2Column[i] ?? null)
    putRaw('so2', so2Column[i] ?? null)
    putRaw('co', coColumn[i] ?? null)
    putRaw('heat_stress', heatStress)
    putRaw('cold_dry_stress', coldDryStress)
    putRaw('humidity', rh[wi] ?? null)
    putRaw('temp', t)
    return {
      time,
      ...(Object.keys(pollenDay.types).length > 0 ? { pollenDisplay: pollenDay.types } : {}),
      ...(pollenEstimated && Object.keys(pollenDay.exposure).length > 0
        ? { estimated: Object.keys(pollenDay.exposure) }
        : {}),
      ...(measured && i > currentIndex ? { forecastSource: 'cams' as const } : {}),
      exposure,
      raw,
      official: { usAqi: usAqi[i] ?? null, eaqi: eaqi[i] ?? null },
    }
  })

  return {
    hours,
    currentIndex,
    fetchedAt: new Date().toISOString(),
    utcOffsetSeconds: air.utc_offset_seconds,
    source: measured ? AIRNOW_SOURCE : EXPOSURE_SOURCE,
    ...(measured ? { siteNames: siteNamesOf(measured) } : {}),
  }
}

/** Which monitor each measured variable's numbers came from. */
function siteNamesOf(observations: AirNowObservations): Partial<Record<string, string>> {
  const names: Partial<Record<string, string>> = {}
  for (const [variable, monitor] of Object.entries(observations.monitors)) {
    if (monitor) names[variable] = monitor.siteName
  }
  return names
}
