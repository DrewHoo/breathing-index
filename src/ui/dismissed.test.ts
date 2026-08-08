import { beforeEach, describe, expect, it, vi } from 'vitest'
import { conflictKey, dismissConflict, dismissedConflicts, loadDismissed } from './dismissed'

/** The tests run in node; this is the whole surface the module touches. */
const store = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
})

beforeEach(() => store.clear())

describe('conflict dismissals', () => {
  it('remembers a card left alone, by entry and kind', () => {
    dismissConflict('e1', 'unmodeled-trigger')
    expect(dismissedConflicts().has(conflictKey('e1', 'unmodeled-trigger'))).toBe(true)
    // A different complaint about the same day is a different question.
    expect(dismissedConflicts().has(conflictKey('e1', 'stale-trigger'))).toBe(false)
    expect(dismissedConflicts().has(conflictKey('e2', 'unmodeled-trigger'))).toBe(false)
  })

  it('accumulates instead of replacing', () => {
    dismissConflict('e1', 'unmodeled-trigger')
    const after = dismissConflict('e2', 'unmodeled-trigger')
    expect(after.size).toBe(2)
    expect(loadDismissed().conflicts).toHaveLength(2)
  })

  it('is idempotent — tapping "leave it" twice is one dismissal', () => {
    dismissConflict('e1', 'unmodeled-trigger')
    expect(dismissConflict('e1', 'unmodeled-trigger').size).toBe(1)
  })

  it('treats junk in storage as nothing dismissed', () => {
    store.set('breathing-index.dismissed.v1', 'not json')
    expect(loadDismissed().conflicts).toEqual([])
    store.set('breathing-index.dismissed.v1', '{"conflicts":"e1"}')
    expect(loadDismissed().conflicts).toEqual([])
  })
})
