/**
 * Today's entries are held out of the model that predicts today (recentEntry.ts),
 * so the reward for a first tap can only land tomorrow. This remembers the day a
 * tap was banked against a model that wasn't drawing on the user yet, so the home
 * screen can say "now drawing on your entries" once — on the next local day — and
 * then forget it.
 */

const KEY = 'breathing-index.banked-day.v1'

/** Local day stamp; the same notion of "today" recentEntry.ts holds out on. */
const localDay = (now: Date): string => now.toDateString()

/** Remember that an entry was logged today, waiting on tomorrow to count. */
export function markBankedToday(now: Date = new Date()): void {
  try {
    localStorage.setItem(KEY, localDay(now))
  } catch {
    // Storage can be denied outright. A missed acknowledgment is not worth an error.
  }
}

/**
 * True exactly once: on the first open of a local day later than the one the
 * entries were banked on. Reading it clears the mark.
 */
export function claimBankedRelease(now: Date = new Date()): boolean {
  try {
    const banked = localStorage.getItem(KEY)
    if (!banked || banked === localDay(now)) return false
    localStorage.removeItem(KEY)
    return true
  } catch {
    return false
  }
}
