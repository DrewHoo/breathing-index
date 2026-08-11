/**
 * Measured pollen via the Google Pollen API, reached through the relay
 * (worker/), which holds the key, caps the spend, and caches by grid cell.
 *
 * Google reports a Universal Pollen Index (integer 0–5) per pollen type per
 * local day — an index, not a count. Spec 11 removed index vocabulary from the
 * air table, but pollen is the different case (specs/18-measured-pollen.md):
 * no consumer source publishes a concentration a user could independently
 * check, so 0–5 with its category word is the honest ceiling of what can be
 * shown. A type Google omits `indexInfo` for is absent here, not zero — "no
 * data" and "measured none" stay different claims.
 */
import { RELAY_BASE, coarse } from './relay'

export const POLLEN_TYPES = ['pollen_tree', 'pollen_grass', 'pollen_weed'] as const
export type PollenType = (typeof POLLEN_TYPES)[number]

const TYPE_CODES: Record<string, PollenType> = {
  TREE: 'pollen_tree',
  GRASS: 'pollen_grass',
  WEED: 'pollen_weed',
}

export interface PollenDayReading {
  /** Universal Pollen Index, 0–5 */
  value: number
  /** in-season plants Google names for this type — the row's sub-label */
  plants: string[]
}

/** One local date's readings, keyed like the exposure vector. */
export type PollenDay = Partial<Record<PollenType, PollenDayReading>>

interface RawTypeInfo {
  code?: string
  indexInfo?: { value?: number }
}

interface RawPlantInfo {
  displayName?: string
  inSeason?: boolean
  plantDescription?: { type?: string }
}

interface RawDay {
  date?: { year?: number; month?: number; day?: number }
  pollenTypeInfo?: RawTypeInfo[]
  plantInfo?: RawPlantInfo[]
}

export interface PollenPayload {
  dailyInfo?: RawDay[]
}

/** "2026-08-11" — the prefix of the exposure series' local hour keys. */
function dateKey(date: RawDay['date']): string | null {
  if (!date?.year || !date.month || !date.day) return null
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`
}

/**
 * Local date -> readings. Only fully-reported types survive: an entry without
 * a numeric index is Google saying "nothing to report", and a plant is named
 * only when Google marks it in season and types it (bare name-only plant rows
 * carry no season claim to repeat).
 */
export function parsePollen(payload: PollenPayload): Map<string, PollenDay> {
  const days = new Map<string, PollenDay>()
  for (const raw of payload.dailyInfo ?? []) {
    const key = dateKey(raw.date)
    if (!key) continue
    const day: PollenDay = {}
    for (const info of raw.pollenTypeInfo ?? []) {
      const variable = TYPE_CODES[info.code ?? '']
      const value = info.indexInfo?.value
      if (!variable || typeof value !== 'number') continue
      const plants = (raw.plantInfo ?? [])
        .filter((p) => p.inSeason === true && TYPE_CODES[p.plantDescription?.type ?? ''] === variable)
        .map((p) => p.displayName ?? '')
        .filter(Boolean)
        .map((name) => name.toLowerCase())
      day[variable] = { value, plants }
    }
    if (Object.keys(day).length > 0) days.set(key, day)
  }
  return days
}

/** Null on any failure — the caller falls back to the calendar, not an error. */
export async function fetchPollen(lat: number, lon: number): Promise<Map<string, PollenDay> | null> {
  try {
    const res = await fetch(`${RELAY_BASE}/v1/pollen?lat=${coarse(lat)}&lon=${coarse(lon)}`)
    if (!res.ok) return null
    const days = parsePollen((await res.json()) as PollenPayload)
    return days.size > 0 ? days : null
  } catch {
    return null
  }
}
