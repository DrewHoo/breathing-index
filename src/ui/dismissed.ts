/**
 * Choices about cards, kept out of the diary.
 *
 * "Leave it" on a conflict card was component state, so every visit to the
 * Diary re-asked a question the user had already answered — and the card is
 * about an entry that will not change. This is the same shape as
 * `ui/durability.ts`: one versioned localStorage key, a whole record read and
 * written at once, and every failure swallowed, because a browser that will not
 * hold this will not hold the diary either.
 *
 * What is stored is an entry id and a card kind, never the rating, the air, or
 * the note — this file has no business knowing what the entry says.
 */

const KEY = 'breathing-index.dismissed.v1'

export interface DismissedCards {
  /** "<entry id>|<conflict kind>" for each conflict card left alone */
  conflicts: string[]
}

const EMPTY: DismissedCards = { conflicts: [] }

export const conflictKey = (entryId: string, kind: string): string => `${entryId}|${kind}`

export function loadDismissed(): DismissedCards {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<DismissedCards>
    return { conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [] }
  } catch {
    return EMPTY
  }
}

/** The set the Diary filters with — read once at mount, added to on a tap. */
export function dismissedConflicts(): Set<string> {
  return new Set(loadDismissed().conflicts)
}

export function dismissConflict(entryId: string, kind: string): Set<string> {
  const next = dismissedConflicts()
  next.add(conflictKey(entryId, kind))
  try {
    localStorage.setItem(KEY, JSON.stringify({ conflicts: [...next] }))
  } catch {
    /* the tap still holds for this session */
  }
  return next
}
