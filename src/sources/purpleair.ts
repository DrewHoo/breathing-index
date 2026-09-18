/**
 * Hyperlocal PM2.5 through the relay (specs/37-purpleair.md): the EPA-
 * corrected median of the nearest outdoor PurpleAir sensors, one derived
 * number per grid cell. The relay owns the key, the sensor directory and the
 * correction; this module sees a reading or nothing. A comparison in v1 —
 * it never enters the exposure vector and the engine never reads it.
 */
import { RELAY_BASE, coarse } from './relay'

export interface PurpleAirReading {
  /** corrected µg/m³ — the median across the cell's sensors */
  pm25: number
  sensors: number
  nearestKm: number | null
  /** the payload's own timestamp — the freshness signal, never the fetch's */
  time: string | null
}

/** The relay's derived shape, or null for anything else — including the
 * `pm25: null, sensors: 0` body a sensorless cell answers with, which is
 * honest absence and renders as nothing. */
export function parsePurpleAir(body: unknown): PurpleAirReading | null {
  if (typeof body !== 'object' || body === null) return null
  const r = body as Record<string, unknown>
  if (typeof r.pm25 !== 'number' || !Number.isFinite(r.pm25)) return null
  if (typeof r.sensors !== 'number' || r.sensors < 1) return null
  return {
    pm25: r.pm25,
    sensors: r.sensors,
    nearestKm: typeof r.nearestKm === 'number' && Number.isFinite(r.nearestKm) ? r.nearestKm : null,
    time: typeof r.time === 'string' ? r.time : null,
  }
}

/**
 * Null on every failure path — network, a 403 from a relay with no key, an
 * odd body — because a sensor network may never take the screen down, or
 * delay it: the caller treats this like fetchSmoke and fetchMold.
 */
export async function fetchPurpleAir(lat: number, lon: number): Promise<PurpleAirReading | null> {
  try {
    const res = await fetch(`${RELAY_BASE}/v1/purpleair?lat=${coarse(lat)}&lon=${coarse(lon)}`)
    if (!res.ok) return null
    const body: unknown = await res.json()
    return parsePurpleAir(body)
  } catch {
    return null
  }
}
