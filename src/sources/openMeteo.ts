import type { Exposure } from '../engine/types'
import {
  POLLEN_VARIABLES,
  calendarPollen,
  dominantPollen,
  monthOf,
  pollenRegion,
  type PollenVariable,
} from './pollenCalendar'

/** What the single pollen row shows for an hour — see `Hour.pollen`. */
export interface PollenSummary {
  /** the species the row names, null when nothing is in season */
  variable: PollenVariable | null
  value: number
  /** a calendar estimate for the region rather than a reading */
  estimated: boolean
}

export interface Hour {
  time: string
  exposure: Exposure
  /** raw instantaneous values for display, keyed like exposure variables */
  raw: Record<string, number>
  /** official composite indices, for scoreboard receipts only */
  official: { usAqi: number | null; eaqi: number | null }
  /**
   * The dominant pollen species for the one "Pollen" row, or null where no
   * source covers this place at all. Optional because series cached by earlier
   * versions are re-read from localStorage and predate the field.
   */
  pollen?: PollenSummary | null
  /**
   * Exposure keys whose values are estimates rather than readings — the
   * calendar species, where no measured pollen exists. Copied onto diary
   * entries, where it stops the engine confirming a bound from a guess.
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
}

/**
 * The pollen fields are CAMS *Europe* only: outside that domain Open-Meteo
 * answers with a full column of nulls rather than an error (verified: real
 * values for Amsterdam, nulls for Hamden — SPEC.md's source table), which is
 * how `fetchExposureSeries` knows to fall back to the calendar.
 */
const POLLEN_VARS = 'grass_pollen,birch_pollen,ragweed_pollen'
const AIR_VARS =
  `pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,us_aqi,european_aqi,${POLLEN_VARS}`
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

function windowMax(values: (number | null)[], i: number, span: number): number {
  let max = 0
  for (let j = Math.max(0, i - span + 1); j <= i; j++) {
    const v = values[j]
    if (v != null && v > max) max = v
  }
  return max
}

function windowMean(values: (number | null)[], i: number, span: number): number {
  let sum = 0
  let n = 0
  for (let j = Math.max(0, i - span + 1); j <= i; j++) {
    const v = values[j]
    if (v != null) {
      sum += v
      n++
    }
  }
  return n === 0 ? 0 : sum / n
}

/**
 * One row's worth of pollen. `covered: false` means no source reaches this
 * place — no row rather than a zero, since "no data" is not "no pollen".
 */
export function summarizePollen(
  exposure: Exposure,
  estimated: boolean,
  covered: boolean,
): PollenSummary | null {
  if (!covered) return null
  const dominant = dominantPollen(exposure)
  if (!dominant || dominant.value === 0) return { variable: null, value: 0, estimated }
  return { ...dominant, estimated }
}

/**
 * Fetch air quality + weather and derive per-hour exposure vectors using the
 * per-variable windows from docs/trigger-model.md (o3/no2/pm/pollen: max8h;
 * heat/cold: instantaneous; humidity: mean72h). CAMS model data — can miss
 * hyper-local smoke, and carries no pollen outside Europe (calendar there).
 */
export async function fetchExposureSeries(lat: number, lon: number): Promise<ExposureSeries> {
  const common = `latitude=${lat}&longitude=${lon}&past_days=3&forecast_days=2&timezone=auto`
  const [airRes, weatherRes] = await Promise.all([
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${common}&hourly=${AIR_VARS}`),
    fetch(`https://api.open-meteo.com/v1/forecast?${common}&hourly=${WEATHER_VARS}`),
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

  // Pollen: measured where CAMS covers the place, calendar where it does not,
  // nothing where neither has anything to say. One number appearing under one
  // name either way — see pollenCalendar.ts for what the estimate claims.
  const pollenSeries = POLLEN_VARIABLES.map((v) => [v, series(air.hourly, v)] as const)
  const measuredPollen = pollenSeries.some(([, values]) => values.some((v) => v != null))
  const covered = measuredPollen || pollenRegion(lat, lon) !== null

  const hours: Hour[] = times.map((time, i) => {
    const wi = weatherTimeIndex.get(time) ?? i
    const t = temp[wi] ?? null
    const d = dew[wi] ?? null
    const heatStress = t != null ? Math.max(0, t - 25) : 0
    const coldDryStress = t != null && t < 10 && d != null && d < 2 ? 10 - t : 0
    // Pollen acts within hours, so it takes the same max(now, max8h) window as
    // the acute pollutants. A calendar month is flat across that window.
    const pollen: Exposure = measuredPollen
      ? Object.fromEntries(pollenSeries.map(([v, values]) => [v, windowMax(values, i, 8)]))
      : calendarPollen(lat, lon, monthOf(time))
    const pollenRaw: Exposure = measuredPollen
      ? Object.fromEntries(pollenSeries.map(([v, values]) => [v, values[i] ?? 0]))
      : pollen
    return {
      time,
      pollen: summarizePollen(pollen, !measuredPollen, covered),
      ...(!measuredPollen && Object.keys(pollen).length > 0
        ? { estimated: Object.keys(pollen) }
        : {}),
      exposure: {
        ...pollen,
        pm25: windowMax(pm25, i, 8),
        pm10: windowMax(pm10, i, 8),
        o3: windowMax(o3, i, 8),
        no2: windowMax(no2, i, 8),
        so2: windowMax(so2, i, 8),
        co: windowMax(co, i, 8),
        heat_stress: heatStress,
        cold_dry_stress: coldDryStress,
        humidity: windowMean(rh, wi, 72),
      },
      raw: {
        ...pollenRaw,
        pm25: pm25[i] ?? 0,
        pm10: pm10[i] ?? 0,
        o3: o3[i] ?? 0,
        no2: no2[i] ?? 0,
        so2: so2[i] ?? 0,
        co: co[i] ?? 0,
        heat_stress: heatStress,
        cold_dry_stress: coldDryStress,
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
  }
}
