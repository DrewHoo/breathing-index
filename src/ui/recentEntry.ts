import { isSimilarExposure } from '../engine/similarity'
import type { DiaryEntry, Exposure, Priors } from '../engine/types'
import { isPending } from './pendingExposure'

const sameLocalDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString()

/**
 * Entries logged today in air like this, most recent first — the reason not to
 * ask "how's breathing?" again. Confounded entries count: the user answered,
 * and the caveat is a matter for inference, not for whether to re-ask.
 *
 * Same *day* as well as similar exposure, because the question is about how
 * this body is doing today, and an identical-looking vector from last Tuesday
 * says nothing about a chest that's since caught a cold.
 *
 * The full list, not just the newest, because the home screen also has to keep
 * these entries out of the model behind its forecast — see routes/index.tsx.
 *
 * Entries still waiting for their air are skipped: with an empty vector they
 * would match any air at all. They rejoin the moment the backfill lands.
 */
export function todaysSimilarEntries(
  diary: DiaryEntry[],
  exposure: Exposure,
  priors: Priors,
  now: Date = new Date(),
): DiaryEntry[] {
  return diary
    .filter((entry) => {
      if (isPending(entry)) return false
      const at = new Date(entry.time)
      if (Number.isNaN(at.getTime()) || !sameLocalDay(at, now)) return false
      return isSimilarExposure(entry.exposure, exposure, priors)
    })
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
}
