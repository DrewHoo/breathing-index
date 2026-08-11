/**
 * Measured stations via the official AirNow API, reached through the relay
 * (worker/), which holds the key and caches by grid cell. Returns per-pollutant
 * *AQI points* (not concentrations), so it feeds the measured-vs-model
 * comparison display, never the inference engine.
 */
import { RELAY_BASE, coarse } from './relay'

export interface AirNowReading {
  parameter: string
  aqi: number
  category: string
  isPrimary: boolean
}

export interface AirNowReport {
  reportingArea: string
  time: string
  observations: AirNowReading[]
  actionDay: boolean
  fetchedAt: string
}

/** Official-API rows, narrowed to the fields this app reads. */
interface RawObservation {
  HourObserved: number
  ReportingArea: string
  ParameterName: string
  AQI: number
  Category: { Name: string }
}

interface RawForecast {
  ReportingArea?: string
  ActionDay?: boolean
}

/** The relay's /v1/airnow payload: observations plus today's forecast rows. */
export interface AirNowPayload {
  observations?: RawObservation[]
  forecast?: RawForecast[]
}

/**
 * Null when there is nothing to show. isPrimary is derived as the highest AQI
 * present — the official API does not mark a primary pollutant, and highest
 * is exactly what AirNow's own displays mean by the word. An Action Day with
 * no observations still reports (empty chips, real banner); AQI −1 rows are
 * the API's "no data" and are dropped, not shown as readings.
 */
export function parseAirNow(payload: AirNowPayload): AirNowReport | null {
  const rows = (payload.observations ?? []).filter((r) => r.AQI >= 0)
  const actionDay = (payload.forecast ?? []).some((r) => r.ActionDay === true)
  if (rows.length === 0 && !actionDay) return null
  const top = Math.max(...rows.map((r) => r.AQI))
  return {
    reportingArea: rows[0]?.ReportingArea ?? payload.forecast?.[0]?.ReportingArea ?? '',
    time: rows.length > 0 ? `${rows[0]!.HourObserved}:00` : '',
    observations: rows.map((r) => ({
      parameter: r.ParameterName,
      aqi: r.AQI,
      category: r.Category.Name,
      isPrimary: r.AQI === top,
    })),
    actionDay,
    fetchedAt: new Date().toISOString(),
  }
}

export async function fetchAirNow(lat: number, lon: number): Promise<AirNowReport | null> {
  const res = await fetch(`${RELAY_BASE}/v1/airnow?lat=${coarse(lat)}&lon=${coarse(lon)}`)
  if (!res.ok) return null
  return parseAirNow((await res.json()) as AirNowPayload)
}
