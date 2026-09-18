/**
 * Reference monitors where AirNow ends (specs/38-openaq.md): the relay's
 * `/v1/openaq` serves the nearest stations' latest concentrations in the
 * provider's own units, and this module converts them to µg/m³ and reduces
 * to one named station — one instrument the whole way across, on spec 27's
 * argument. A comparison in v1: never the exposure vector, never the engine.
 *
 * Only fetched outside AirNow coverage. Inside it, OpenAQ's US provider is
 * AirNow's own data re-served, and the app already has the original.
 */
import { RELAY_BASE, coarse } from './relay'

/**
 * µg/m³ per ppb at the EPA's 25 °C / 1013 hPa — the same constants
 * airnow.ts uses, because a Paris ozone number and a New Haven one must not
 * disagree by conversion. OpenAQ serves gases in whichever unit the provider
 * publishes: the EEA sends µg/m³, AirNow-via-OpenAQ sends ppm
 * (research/openaq-v3.md, Units).
 */
const UG_M3_PER_PPB: Partial<Record<string, number>> = { o3: 1.96, so2: 2.62 }

/** A variable the strip can chip, in µg/m³, or null for a unit that makes
 * no sense — a particle count in ppm is a broken row, not a conversion. */
export function toUgM3(variable: string, value: number, units: string): number | null {
  if (units === 'µg/m³' || units === 'ug/m3') return value
  const perPpb = UG_M3_PER_PPB[variable]
  if (perPpb === undefined) return null
  if (units === 'ppb') return value * perPpb
  if (units === 'ppm') return value * 1000 * perPpb
  return null
}

export interface OpenAqReading {
  station: string
  /** the license's attribution when it names one, else the provider */
  attribution: string | null
  license: string | null
  km: number | null
  /** the newest value's own hour — the freshness signal, never the fetch's */
  time: string | null
  /** µg/m³ per variable, from this one station */
  values: Partial<Record<'pm25' | 'pm10' | 'o3' | 'so2', number>>
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const KNOWN = new Set(['pm25', 'pm10', 'o3', 'so2'])

/** OpenAQ's own placeholder for EEA rows. As a byline it names nobody, so
 * the provider ("EEA") is the more honest credit. */
const PLACEHOLDER_ATTRIBUTION = 'Unknown Governmental Organization'

/**
 * The fullest nearby station: most usable values, nearest on ties (the
 * relay sorted by distance, so first-with-most wins ties). Verified against
 * a live Paris cell, where the nearest station carries only ozone and the
 * one 800 m further carries both particle sizes — one instrument is the
 * rule (specs/27-one-ozone.md), so it should be the instrument that
 * measures the most.
 */
export function parseOpenAq(body: unknown): OpenAqReading | null {
  if (!isRecord(body) || !Array.isArray(body.stations)) return null
  let best: OpenAqReading | null = null
  for (const raw of body.stations) {
    if (!isRecord(raw) || typeof raw.name !== 'string' || !Array.isArray(raw.values)) continue
    const values: OpenAqReading['values'] = {}
    let time: string | null = null
    for (const v of raw.values) {
      if (!isRecord(v)) continue
      if (typeof v.variable !== 'string' || !KNOWN.has(v.variable)) continue
      if (typeof v.value !== 'number' || typeof v.units !== 'string') continue
      const ugm3 = toUgM3(v.variable, v.value, v.units)
      if (ugm3 === null) continue
      values[v.variable as keyof OpenAqReading['values']] = ugm3
      if (typeof v.utc === 'string' && (time === null || v.utc > time)) time = v.utc
    }
    const count = Object.keys(values).length
    if (count === 0 || (best && count <= Object.keys(best.values).length)) continue
    const attribution = typeof raw.attribution === 'string' ? raw.attribution : null
    best = {
      station: raw.name,
      attribution:
        (attribution === PLACEHOLDER_ATTRIBUTION ? null : attribution) ??
        (typeof raw.provider === 'string' ? raw.provider : null),
      license: typeof raw.license === 'string' ? raw.license : null,
      km: typeof raw.km === 'number' && Number.isFinite(raw.km) ? raw.km : null,
      time,
      values,
    }
  }
  return best
}

/** Null on every failure path — a monitor network abroad may never take the
 * screen down, the fetchSmoke rule. */
export async function fetchOpenAq(lat: number, lon: number): Promise<OpenAqReading | null> {
  try {
    const res = await fetch(`${RELAY_BASE}/v1/openaq?lat=${coarse(lat)}&lon=${coarse(lon)}`)
    if (!res.ok) return null
    const body: unknown = await res.json()
    return parseOpenAq(body)
  } catch {
    return null
  }
}
