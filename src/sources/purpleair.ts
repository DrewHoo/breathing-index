/**
 * Hyperlocal PM2.5 through the relay (specs/37-purpleair.md): the EPA-
 * corrected median of the nearest outdoor PurpleAir sensors, one derived
 * number per grid cell. The relay owns the key, the sensor directory and the
 * correction; this module sees a reading or nothing. A comparison in v1 —
 * it never enters the exposure vector and the engine never reads it.
 */
import * as v from 'valibot'
import { RELAY_BASE, coarse } from './relay'

export interface PurpleAirReading {
  /** corrected µg/m³ — the median across the cell's sensors */
  pm25: number
  sensors: number
  nearestKm: number | null
  /** the payload's own timestamp — the freshness signal, never the fetch's */
  time: string | null
}

/**
 * The reading's two load-bearing fields must hold or the whole reading is
 * refused — which is also what rejects the `pm25: null, sensors: 0` body a
 * sensorless cell answers with: honest absence, rendered as nothing. The
 * metadata fields fall back to null instead, because a broken distance
 * must not cost the number beside it.
 */
const ReadingSchema = v.object({
  pm25: v.pipe(v.number(), v.finite()),
  sensors: v.pipe(v.number(), v.minValue(1)),
  nearestKm: v.fallback(v.nullish(v.pipe(v.number(), v.finite()), null), null),
  time: v.fallback(v.nullish(v.string(), null), null),
})

/** The relay's derived shape, or null for anything else. */
export function parsePurpleAir(body: unknown): PurpleAirReading | null {
  const parsed = v.safeParse(ReadingSchema, body)
  return parsed.success ? parsed.output : null
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
