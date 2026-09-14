import type { DiaryEntry } from '../engine/types'

/**
 * Being sick, as a variable rather than a reason to throw the day away
 * (specs/26-sick-as-signal.md).
 *
 * `sick` was a confounder: the entry stayed in the diary and left inference.
 * The literature says that is backwards. A virus *alone* is null — Green 2002
 * put it at OR 1.67 with an interval crossing 1 — and what actually multiplies
 * is virus × sensitization × allergen exposure: OR 8.4 in Green's adults, 19.4
 * (3.7–101.5) in Murray 2005's children. So a sick day with oak pollen up is
 * the most informative day about allergen triggers this diary will ever get,
 * and the old rule discarded exactly those days.
 *
 * As an exposure key it needs no new engine machinery: the combo-repeat clause
 * already floors on a repeat of sick-plus-pollen without attributing the day to
 * either half, which is the interaction the studies describe.
 */
export const VIRAL = 'viral'

/**
 * Keys an entry carries that no exposure series ever produces. The air comes
 * from a feed; this one comes from the user's thumb, so anything that replaces
 * an entry's vector wholesale (`resolvePending`) has to put it back.
 */
export const ENTRY_OWN_VARIABLES: ReadonlySet<string> = new Set([VIRAL])

/** True when this entry is already marked sick. Absent, never 0 — a 0 would read as a reading. */
export const isSick = (entry: DiaryEntry): boolean => entry.exposure[VIRAL] === 1

/**
 * What tagging a conflict "sick" does to the entry it sits on — the same move
 * `calendarPollenPatch` makes, and for the same reason. The tag used to file a
 * confounder, so naming the likeliest explanation for an unexplainable day was
 * the one answer that guaranteed the app would never learn from it. Now it
 * attaches the candidate the day was missing and the entry re-enters inference.
 *
 * Unlike the pollen patch there is nothing to look up: no calendar, no place,
 * no season. Returns null only when the flag is already there, so the caller
 * knows there is nothing to do rather than writing the same entry back.
 */
export function viralPatch(entry: DiaryEntry): Partial<DiaryEntry> | null {
  if (isSick(entry)) return null
  return { exposure: { ...entry.exposure, [VIRAL]: 1 } }
}
