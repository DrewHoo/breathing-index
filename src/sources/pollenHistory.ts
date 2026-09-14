/**
 * What the app remembers of pollen days that have already gone by.
 *
 * Google's Pollen API serves today forward, and grass needs three days
 * (specs/22-exposure-windows.md: Erbas 2018 finds the asthma signal cumulative
 * and threshold-shaped, IRR 1.46 at a 3-day lag). Nobody backfills pollen —
 * there is no "last Tuesday" endpoint to ask — so the only way to have
 * yesterday's reading tomorrow is to have written it down yesterday. Every
 * successful fetch files its days here, keyed by the same coarse cell the
 * relay was asked about, and feature extraction reads the trailing days back.
 *
 * A remembered day keeps its standing as a *measured* day: it was read from
 * the source on the date it describes, and reading it out of storage does not
 * make it a guess. That promise is the whole reason only days up to the local
 * date of the fetch are written. The relay's endpoint is `forecast:lookup` —
 * it answers with today *and several days ahead* — and filing those would have
 * Thursday's window quietly grading a person on Monday's guess about Tuesday.
 * A projection is worth drawing on a curve; it is not worth remembering as a
 * reading. The season calendar remains the fallback for a day nothing ever
 * recorded, tagged `estimated` exactly as before — which means a fresh install
 * grades grass off the calendar for two days and then off its own memory, with
 * no cliff in between.
 *
 * Capped on both axes, because this writes on every fetch, forever, into a
 * quota shared with the diary — and the diary is the one thing in localStorage
 * that cannot be re-fetched. Fourteen days is four more than any window here
 * will ever want; four cells is home, work, and two trips.
 */
import type { PollenDay } from './googlePollen'
import { coarse } from './relay'

const KEY = 'breathing-index.pollenHistory.v1'

/** Days kept per cell — the 3-day window plus slack for a week away. */
const DAYS_PER_CELL = 14

/** Places kept at all. Least recently written is the one that goes. */
const CELLS = 4

interface StoredCell {
  /** the coarse cell, "41.4,-72.9" — never a sharper coordinate */
  cell: string
  /** local date ("2026-09-13") -> that day's reading */
  days: Record<string, PollenDay>
}

/**
 * Most recently written last, so trimming is "drop from the front". An array
 * rather than an object keyed by cell because the order *is* the recency
 * record, and object key order is a fact about the JS engine, not a promise
 * this file should be leaning on.
 */
type Store = StoredCell[]

const cellKey = (lat: number, lon: number): string => `${coarse(lat)},${coarse(lon)}`

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
    // differently. Pollen history is a convenience: without it the calendar
    // answers for the trailing days, marked as the estimate it is.
    return []
  }
}

/**
 * File a fetch's readings under this place. `today` is the local date at that
 * place — the caller has the location's UTC offset and this module does not —
 * and days after it are dropped: they are the feed's projections, and this
 * store exists to hold what was actually read. Each of them gets written on
 * the day it becomes today.
 */
export function rememberPollenDays(
  lat: number,
  lon: number,
  days: Map<string, PollenDay>,
  today: string,
): void {
  const readings = [...days].filter(([date]) => date <= today)
  if (readings.length === 0) return
  const cell = cellKey(lat, lon)
  const store = read()
  const existing = store.find((entry) => entry.cell === cell)
  const merged: Record<string, PollenDay> = { ...existing?.days }
  for (const [date, day] of readings) merged[date] = day
  // Newest dates win the cap: a window looks backwards from today, so the
  // oldest date is always the first thing that stops mattering.
  const kept = Object.keys(merged)
    .sort()
    .slice(-DAYS_PER_CELL)
  const next: Store = [
    ...store.filter((entry) => entry.cell !== cell),
    { cell, days: Object.fromEntries(kept.map((date) => [date, merged[date]!])) },
  ].slice(-CELLS)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Quota, or no storage at all. The window falls back to the calendar for
    // the days it cannot remember, which is the honest answer anyway.
  }
}

/** Everything remembered about this place, empty when that is nothing. */
export function recallPollenDays(lat: number, lon: number): Map<string, PollenDay> {
  const cell = cellKey(lat, lon)
  const days = read().find((entry) => entry.cell === cell)?.days
  return new Map(Object.entries(days ?? {}))
}
