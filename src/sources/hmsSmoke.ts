/**
 * Is there smoke overhead, and what the app remembers of the hours that have
 * already gone by.
 *
 * NOAA's Hazard Mapping System is an analyst-drawn smoke plume map built from
 * satellite imagery, republished hourly by the Forest Service and reached
 * through the relay, which does the point-in-polygon so a browser does not
 * have to pull 230 KB to answer one yes/no (worker/src/geo.ts).
 *
 * Two things about the product shape the code below. It is a *nowcast*: the
 * file holds the latest analysis and nothing behind it, so the only way to
 * have this morning's answer this evening is to have written it down this
 * morning — the same bind pollen is in, and the same store pattern answers it
 * (pollenHistory.ts). And smoke detection needs daylight, so overnight the
 * "latest" analysis is yesterday afternoon's; the answer therefore carries the
 * polygon's own observation window, and the row says "as of" when it is old.
 *
 * What this module never does is decide whether the smoke is in the air the
 * user is breathing. HMS sees a column from above and flags a plume aloft over
 * clean surface air exactly as it flags one at head height. The gate that
 * turns "smoke somewhere overhead" into an exposure is the fine-fraction
 * fingerprint in `ui/smoke.ts`, applied in feature extraction
 * (specs/25-smoke-variable.md).
 */
import * as v from 'valibot'
import { RELAY_BASE, coarse } from './relay'

/** 0 is "no plume over this cell", never "nobody looked". */
export type SmokeDensity = 0 | 1 | 2 | 3

export interface SmokeAnswer {
  density: SmokeDensity
  /** ISO UTC bounds of the imagery the densest plume was drawn from */
  start: string | null
  end: string | null
  /** when the relay computed this, debug metadata — not a freshness signal */
  fetched?: string
  /** the relay got a file it could not read; treat as no claim either way */
  stale?: boolean
}

const KEY = 'breathing-index.smokeHistory.v1'

/** Hours kept per cell: the sparkline's 48, and not an hour more. */
const HOURS_PER_CELL = 48

/** Places kept at all. Least recently written is the one that goes. */
const CELLS = 4

interface StoredCell {
  /** the coarse cell, "41.4,-72.9" — never a sharper coordinate */
  cell: string
  /** UTC hour key ("2026-09-13T22:00") -> that hour's density */
  hours: Record<string, SmokeDensity>
}

/** Most recently written last, so trimming is "drop from the front" — the
 * same shape, and the same reasoning, as the pollen store's array. */
type Store = StoredCell[]

const cellKey = (lat: number, lon: number): string => `${coarse(lat)},${coarse(lon)}`

const isDensity = (x: unknown): x is SmokeDensity => x === 0 || x === 1 || x === 2 || x === 3

/**
 * Ask the relay about this cell. Null on anything that goes wrong — a 4xx, a
 * dead network, a body that is not the shape this file expects — because a
 * smoke answer is one column of the exposure vector and must never be able to
 * take the screen down with it. Absent, the `smoke` variable is simply not in
 * the vector, which is the honest state: nothing was measured.
 */
/** Density is load-bearing — anything else refuses the answer whole. The
 * window bounds and metadata fall back rather than costing the density. */
const AnswerSchema = v.object({
  density: v.union([v.literal(0), v.literal(1), v.literal(2), v.literal(3)]),
  start: v.fallback(v.nullish(v.string(), null), null),
  end: v.fallback(v.nullish(v.string(), null), null),
  fetched: v.fallback(v.optional(v.string()), undefined),
  stale: v.fallback(v.optional(v.literal(true)), undefined),
})

export async function fetchSmoke(lat: number, lon: number): Promise<SmokeAnswer | null> {
  try {
    const res = await fetch(`${RELAY_BASE}/v1/smoke?lat=${coarse(lat)}&lon=${coarse(lon)}`)
    if (!res.ok) return null
    const parsed = v.safeParse(AnswerSchema, await res.json())
    if (!parsed.success) return null
    const body = parsed.output
    return {
      density: body.density,
      start: body.start,
      end: body.end,
      ...(body.fetched !== undefined ? { fetched: body.fetched } : {}),
      ...(body.stale === true ? { stale: true } : {}),
    }
  } catch {
    return null
  }
}

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is StoredCell =>
        typeof entry === 'object' && entry !== null && typeof (entry as StoredCell).cell === 'string',
    )
  } catch {
    // No storage, private mode, or a shape written by a version that thought
    // differently. The history is the sparkline and the trailing hours of the
    // variable; without it the current hour still answers for itself.
    return []
  }
}

/**
 * File this hour's density under this place. `hour` is the UTC hour key the
 * series joins on ("2026-09-13T22:00"), because HMS answers about now and the
 * series' own hour strings are local to wherever the user is.
 *
 * Only ever called with a fresh answer for the current hour: a density written
 * against an hour it did not describe would be a reading this app invented,
 * and the sparkline it draws is read back as fact.
 */
export function rememberSmokeHour(
  lat: number,
  lon: number,
  hour: string,
  density: SmokeDensity,
): void {
  const cell = cellKey(lat, lon)
  const store = read()
  const existing = store.find((entry) => entry.cell === cell)
  const merged: Record<string, SmokeDensity> = { ...existing?.hours, [hour]: density }
  // Newest hours win the cap: the window looks backwards from now, so the
  // oldest hour is always the first thing that stops mattering.
  const kept = Object.keys(merged).sort().slice(-HOURS_PER_CELL)
  const next: Store = [
    ...store.filter((entry) => entry.cell !== cell),
    { cell, hours: Object.fromEntries(kept.map((h) => [h, merged[h]!])) },
  ].slice(-CELLS)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Quota, or no storage at all. The current hour is still answered live;
    // the hours behind it go back to being absent, which they honestly are.
  }
}

/** Everything remembered about this place, empty when that is nothing. */
export function recallSmokeHours(lat: number, lon: number): Map<string, SmokeDensity> {
  const hours = read().find((entry) => entry.cell === cellKey(lat, lon))?.hours
  return new Map(Object.entries(hours ?? {}).filter((pair): pair is [string, SmokeDensity] =>
    isDensity(pair[1]),
  ))
}
