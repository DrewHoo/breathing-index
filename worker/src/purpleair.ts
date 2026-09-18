/**
 * The pure half of `/v1/purpleair` (specs/37-purpleair.md): sensor selection,
 * the EPA correction, and the reduction to the one derived number the relay
 * is allowed to serve. The fetch half lives in index.ts with the other
 * routes; this file stays Workers-type-free so the root tsconfig can include
 * it and vitest can cover it, the way geo.ts is covered.
 *
 * License context (research/purpleair-license.md): PurpleAir's terms bar
 * serving their data in raw form to third parties. Every export here reduces
 * raw rows to a derived value; none returns a row.
 */

/**
 * PurpleAir's /v1/sensors answers columnar: a `fields` list naming the
 * columns and `data` rows in that order. Columns are looked up by name rather
 * than by request order — `sensor_index` arrives whether asked for or not,
 * and the order is the server's to choose.
 */
export interface SensorsPayload {
  fields: string[]
  data: (number | string | null)[][]
  /** epoch seconds — the payload's own clock, the freshness signal */
  data_time_stamp?: number
}

export function parseSensorsPayload(body: unknown): SensorsPayload | null {
  if (typeof body !== 'object' || body === null) return null
  const r = body as Record<string, unknown>
  if (!Array.isArray(r.fields) || !r.fields.every((f) => typeof f === 'string')) return null
  if (!Array.isArray(r.data) || !r.data.every((row) => Array.isArray(row))) return null
  return {
    fields: r.fields,
    data: r.data as (number | string | null)[][],
    data_time_stamp: typeof r.data_time_stamp === 'number' ? r.data_time_stamp : undefined,
  }
}

const column = (payload: SensorsPayload, name: string): number => payload.fields.indexOf(name)

const num = (row: (number | string | null)[], i: number): number | null => {
  if (i < 0) return null
  const v = row[i]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Kilometres, flat-earth — fine inside the ±0.15° discovery box, and the same
 * approximation the client's airnow.ts uses inside its half-degree box. */
const distanceKm = (aLat: number, aLon: number, bLat: number, bLon: number): number => {
  const dLat = (aLat - bLat) * 111
  const dLon = (aLon - bLon) * 111 * Math.cos((aLat * Math.PI) / 180)
  return Math.hypot(dLat, dLon)
}

/** One directory entry: a sensor id and its distance from the cell centre.
 * The id never leaves the relay — the directory lives only in KV. */
export interface CellSensor {
  i: number
  km: number
}

/** How many sensors a cell reads. Five is enough for a median that shrugs off
 * one bad unit and few enough that the hourly query stays ~15–25 points. */
export const SENSORS_PER_CELL = 5

/** Below this channel-agreement score PurpleAir itself doubts the unit. */
const MIN_CONFIDENCE = 70

/**
 * The nearest usable outdoor sensors from a discovery payload: confidence
 * ≥ 70, real coordinates, sorted by distance, capped at SENSORS_PER_CELL.
 * (`location_type=0` on the request already excluded indoor units; the
 * confidence floor is enforced here because `max_age` and `location_type`
 * are the only filters the API applies server-side.)
 */
export function pickSensors(payload: SensorsPayload, cellLat: number, cellLon: number): CellSensor[] {
  const iIndex = column(payload, 'sensor_index')
  const latIndex = column(payload, 'latitude')
  const lonIndex = column(payload, 'longitude')
  const confIndex = column(payload, 'confidence')
  const picked: CellSensor[] = []
  for (const row of payload.data) {
    const i = num(row, iIndex)
    const lat = num(row, latIndex)
    const lon = num(row, lonIndex)
    const conf = num(row, confIndex)
    if (i === null || lat === null || lon === null) continue
    if (conf === null || conf < MIN_CONFIDENCE) continue
    picked.push({ i, km: Math.round(distanceKm(cellLat, cellLon, lat, lon) * 10) / 10 })
  }
  picked.sort((a, b) => a.km - b.km)
  return picked.slice(0, SENSORS_PER_CELL)
}

/**
 * EPA's correction for PurpleAir PM2.5 (Barkjohn et al. 2021, with the
 * high-concentration extension the Fire and Smoke Map uses). Inputs are the
 * sensor's own cf_1 value and its own humidity reading — the fit was made
 * against sensor RH, which reads low of ambient, so ambient RH would
 * over-correct. Clamped at zero: the linear branch goes negative in very
 * clean, very humid air, and a negative concentration is a fit artifact.
 */
export function correctedPm25(cf1: number, rh: number): number {
  const corrected =
    cf1 <= 343 ? 0.52 * cf1 - 0.086 * rh + 5.75 : 0.46 * cf1 + 3.93e-4 * cf1 * cf1 + 2.97
  return Math.max(0, corrected)
}

/** The derived reading the route serves. `pm25: null, sensors: 0` is a cell
 * with nothing usable — absent, never zero (the house rule). */
export interface CellReading {
  pm25: number | null
  sensors: number
  nearestKm: number | null
  /** ISO, from the payload's data_time_stamp — never the serve time */
  time: string | null
}

/**
 * Correct each sensor, take the median. A sensor missing cf_1 or humidity is
 * skipped rather than defaulted: the correction was fit to sensor RH, and a
 * guessed RH is a guessed correction. Median over mean so one unit sitting
 * next to a grill doesn't become the neighbourhood's air.
 */
export function cellReading(payload: SensorsPayload, nearestKm: number | null): CellReading {
  const cf1Index = column(payload, 'pm2.5_cf_1')
  const rhIndex = column(payload, 'humidity')
  const corrected: number[] = []
  for (const row of payload.data) {
    const cf1 = num(row, cf1Index)
    const rh = num(row, rhIndex)
    if (cf1 === null || rh === null) continue
    corrected.push(correctedPm25(cf1, rh))
  }
  const time =
    payload.data_time_stamp !== undefined
      ? new Date(payload.data_time_stamp * 1000).toISOString()
      : null
  if (corrected.length === 0) return { pm25: null, sensors: 0, nearestKm: null, time }
  corrected.sort((a, b) => a - b)
  const mid = corrected.length >> 1
  const median =
    corrected.length % 2 === 1 ? corrected[mid]! : (corrected[mid - 1]! + corrected[mid]!) / 2
  return {
    pm25: Math.round(median * 10) / 10,
    sensors: corrected.length,
    nearestKm,
    time,
  }
}
