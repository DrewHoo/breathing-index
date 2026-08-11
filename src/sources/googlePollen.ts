/**
 * Measured pollen via the Google Pollen API, reached through the relay
 * (worker/), which holds the key, caps the spend, and caches by grid cell.
 *
 * Google reports a Universal Pollen Index (integer 0–5) per local day at two
 * grains: per *type* (tree/grass/weed) and per *plant* (birch, oak, ragweed…).
 * The plants are the engine's variables and the types are only display
 * (specs/18-measured-pollen.md): only plant-level numbers can ever answer
 * "birch and not oak", and a type is roughly the max of its plants — two
 * numbers that co-move by construction must not both be candidates.
 *
 * The index is not a count, but no consumer pollen source publishes a count a
 * user could check; 0–5 with its category word is the honest ceiling. A type
 * or plant Google omits an index for is absent here, not zero — "no data" and
 * "measured none" stay different claims.
 */
import { POLLEN_PLANTS, type PollenTypeKey } from './pollenPlants'
import { RELAY_BASE, coarse } from './relay'

export interface PlantReading {
  variable: string
  name: string
  value: number
}

export interface PollenTypeDisplay {
  /** the row's headline: Google's own type index */
  value: number
  /** the row's sub-label and verdict source, highest first */
  plants: PlantReading[]
}

export interface PollenDay {
  /** per-type display for the three rows */
  types: Partial<Record<PollenTypeKey, PollenTypeDisplay>>
  /** the engine's half: plant variable -> index value */
  exposure: Record<string, number>
}

const TYPE_CODES: Record<string, PollenTypeKey> = {
  TREE: 'tree',
  GRASS: 'grass',
  WEED: 'weed',
}

interface RawIndexed {
  code?: string
  indexInfo?: { value?: number }
}

interface RawDay {
  date?: { year?: number; month?: number; day?: number }
  pollenTypeInfo?: RawIndexed[]
  plantInfo?: RawIndexed[]
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
 * Local date -> readings. Zero-index plants are dropped on both sides: a
 * measured zero adds nothing an absence doesn't, and it would only pad
 * candidate sets and sub-labels with silence. A plant code the catalog does
 * not know is skipped entirely — the engine may only reason about numbers the
 * app can show and name. A type row survives only if at least one of its
 * plants reported: a headline with no plant behind it would be a number the
 * engine can neither cite nor learn from.
 */
export function parsePollen(payload: PollenPayload): Map<string, PollenDay> {
  const days = new Map<string, PollenDay>()
  for (const raw of payload.dailyInfo ?? []) {
    const key = dateKey(raw.date)
    if (!key) continue
    const plantsByType: Partial<Record<PollenTypeKey, PlantReading[]>> = {}
    for (const info of raw.plantInfo ?? []) {
      const plant = POLLEN_PLANTS[info.code ?? '']
      const value = info.indexInfo?.value
      if (!plant || typeof value !== 'number' || value <= 0) continue
      ;(plantsByType[plant.type] ??= []).push({
        variable: plant.variable,
        name: plant.name,
        value,
      })
    }
    const types: PollenDay['types'] = {}
    // Exposure carries exactly the plants that made it onto a row — a plant
    // whose type row was dropped would be a number nobody can see.
    const exposure: Record<string, number> = {}
    for (const info of raw.pollenTypeInfo ?? []) {
      const type = TYPE_CODES[info.code ?? '']
      const value = info.indexInfo?.value
      const plants = type ? plantsByType[type] : undefined
      if (!type || typeof value !== 'number' || !plants?.length) continue
      types[type] = { value, plants: plants.sort((a, b) => b.value - a.value) }
      for (const plant of plants) exposure[plant.variable] = plant.value
    }
    if (Object.keys(types).length > 0) days.set(key, { types, exposure })
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
