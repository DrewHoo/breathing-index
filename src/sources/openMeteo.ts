import type { Exposure } from '../engine/types'
import { type PollenDay, fetchPollen } from './googlePollen'
import { calendarPollen, monthOf } from './pollenCalendar'

export interface Hour {
  time: string
  exposure: Exposure
  /** raw instantaneous values for display, keyed like exposure variables */
  raw: Record<string, number>
  /** official composite indices, for scoreboard receipts only */
  official: { usAqi: number | null; eaqi: number | null }
  /**
   * In-season plant names per pollen type, for the pollen rows' sub-labels
   * ("ragweed · nettle"). Optional because series cached by earlier versions
   * are re-read from localStorage and predate the field.
   */
  pollenPlants?: Partial<Record<string, string[]>>
  /**
   * Exposure keys whose values are estimates rather than readings — the
   * calendar pollen types, on hours the measured feed does not cover. Copied
   * onto diary entries, where it stops the engine confirming a bound from a
   * guess.
   */
  estimated?: string[]
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
}

/**
 * Open-Meteo's air-quality endpoint serves the CAMS model, not monitors. The
 * name is on every entry logged against it, because a bound learned here does
 * not transfer to a station feed reading the same air differently.
 */
export const EXPOSURE_SOURCE = 'cams'

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

/**
 * Fetch air quality + weather and derive per-hour exposure vectors using the
 * per-variable windows from docs/trigger-model.md (o3/no2/pm: max8h;
 * heat/cold: instantaneous; humidity: mean72h; pollen: its local day's index,
 * daily being all any pollen source resolves). CAMS model data — can miss
 * hyper-local smoke. Pollen rides a separate pipe (googlePollen.ts via the
 * relay, today forward) with the season calendar behind it for the past tail
 * and for outages — a fallback hour is estimated-tagged, never silently
 * interchangeable with a measured one.
 */
export async function fetchExposureSeries(lat: number, lon: number): Promise<ExposureSeries> {
  const common = `latitude=${lat}&longitude=${lon}&past_days=3&forecast_days=2&timezone=auto`
  const [airRes, weatherRes, pollenDays] = await Promise.all([
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${common}&hourly=${AIR_VARS}`),
    fetch(`https://api.open-meteo.com/v1/forecast?${common}&hourly=${WEATHER_VARS}`),
    fetchPollen(lat, lon),
  ])
  if (!airRes.ok || !weatherRes.ok) {
    throw new Error(`Open-Meteo fetch failed (${airRes.status}/${weatherRes.status})`)
  }
  const air = (await airRes.json()) as { hourly: HourlyBlock; utc_offset_seconds: number }
  const weather = (await weatherRes.json()) as { hourly: HourlyBlock }

  const times = air.hourly.time
  const weatherTimeIndex = new Map(weather.hourly.time.map((t, i) => [t, i]))

  const pm25 = series(air.hourly, 'pm2_5')
  const pm10 = series(air.hourly, 'pm10')
  const o3 = series(air.hourly, 'ozone')
  const no2 = series(air.hourly, 'nitrogen_dioxide')
  const so2 = series(air.hourly, 'sulphur_dioxide')
  const co = series(air.hourly, 'carbon_monoxide')
  const usAqi = series(air.hourly, 'us_aqi')
  const eaqi = series(air.hourly, 'european_aqi')
  const temp = series(weather.hourly, 'temperature_2m')
  const rh = series(weather.hourly, 'relative_humidity_2m')
  const dew = series(weather.hourly, 'dew_point_2m')

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
    put('no2', windowMax(no2, i, 8))
    put('heat_stress', heatStress)
    put('cold_dry_stress', coldDryStress)
    put('humidity', windowMean(rh, wi, 72))
    // Pollen resolves by local day, not hour, so the day's index stands in for
    // every hour of it — no running window, the same number smeared through a
    // max is just the same number. The null discipline holds: a type the
    // source omitted is absent from the vector, not zero.
    const { day: pollenDay, estimated: pollenEstimated } = pollenForHour(pollenDays, lat, lon, time)
    const pollenRaw: Exposure = {}
    const pollenPlants: Partial<Record<string, string[]>> = {}
    for (const [variable, reading] of Object.entries(pollenDay)) {
      put(variable, reading.value)
      pollenRaw[variable] = reading.value
      if (reading.plants.length > 0) pollenPlants[variable] = reading.plants
    }
    return {
      time,
      ...(Object.keys(pollenPlants).length > 0 ? { pollenPlants } : {}),
      ...(pollenEstimated && Object.keys(pollenDay).length > 0
        ? { estimated: Object.keys(pollenDay) }
        : {}),
      exposure,
      raw: {
        ...pollenRaw,
        pm25: pm25[i] ?? 0,
        pm10: pm10[i] ?? 0,
        o3: o3[i] ?? 0,
        no2: no2[i] ?? 0,
        so2: so2[i] ?? 0,
        co: co[i] ?? 0,
        heat_stress: heatStress ?? 0,
        cold_dry_stress: coldDryStress ?? 0,
        humidity: rh[wi] ?? 0,
        temp: t ?? 0,
      },
      official: { usAqi: usAqi[i] ?? null, eaqi: eaqi[i] ?? null },
    }
  })

  const currentIndex = findCurrentIndex(times, air.utc_offset_seconds)

  return {
    hours,
    currentIndex,
    fetchedAt: new Date().toISOString(),
    utcOffsetSeconds: air.utc_offset_seconds,
    source: EXPOSURE_SOURCE,
  }
}
