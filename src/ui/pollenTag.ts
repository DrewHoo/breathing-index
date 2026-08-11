import type { DiaryEntry } from '../engine/types'
import { calendarPollen } from '../sources/pollenCalendar'
import { isPending } from './pendingExposure'

/**
 * What tagging a conflict "pollen" does to the entry it sits on.
 *
 * The tag used to be a confounder — the user names the missing variable and the
 * app answers by throwing the day away. Where a calendar season covers that
 * day, it can do better: attach the season as an estimated variable, so the
 * entry re-enters inference with a candidate that was missing, and the day
 * stops being unexplainable. The estimate is marked as one, so it can suspect
 * pollen without ever confirming it (see engine/infer.ts).
 *
 * Returns null when there is nothing honest to attach — no place known, no
 * season running, no air on the entry yet, or the species are already there —
 * and the caller falls back to recording the old confounder.
 */
export function calendarPollenPatch(
  entry: DiaryEntry,
  coords: { lat: number; lon: number } | null,
): Partial<DiaryEntry> | null {
  if (!coords || isPending(entry)) return null
  // The month the user lived, in their own timezone.
  const month = new Date(entry.time).getMonth() + 1
  const estimate = calendarPollen(coords.lat, coords.lon, month).exposure
  const added = Object.entries(estimate).filter(([v]) => entry.exposure[v] === undefined)
  if (added.length === 0) return null
  return {
    exposure: { ...entry.exposure, ...Object.fromEntries(added) },
    estimated: [...new Set([...(entry.estimated ?? []), ...added.map(([v]) => v)])],
  }
}
