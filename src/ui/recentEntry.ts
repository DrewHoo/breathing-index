import { isSimilarExposure } from '../engine/similarity'
import type { DiaryEntry, Exposure, Priors } from '../engine/types'

const sameLocalDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString()

/**
 * The most recent entry logged today in air like this — the reason not to ask
 * "how's breathing?" again. Confounded entries count: the user answered, and
 * the caveat is a matter for inference, not for whether to re-ask.
 *
 * Same *day* as well as similar exposure, because the question is about how
 * this body is doing today, and an identical-looking vector from last Tuesday
 * says nothing about a chest that's since caught a cold.
 */
export function findTodaysSimilarEntry(
  diary: DiaryEntry[],
  exposure: Exposure,
  priors: Priors,
  now: Date = new Date(),
): DiaryEntry | null {
  let best: DiaryEntry | null = null
  let bestAt = -Infinity
  for (const entry of diary) {
    const at = new Date(entry.time).getTime()
    if (Number.isNaN(at) || at <= bestAt) continue
    if (!sameLocalDay(new Date(at), now)) continue
    if (!isSimilarExposure(entry.exposure, exposure, priors)) continue
    best = entry
    bestAt = at
  }
  return best
}
