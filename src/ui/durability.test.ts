import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DURABILITY,
  backupNudgeDue,
  installNudgeDue,
  unbackedCount,
  type Durability,
} from './durability'

const state = (over: Partial<Durability> = {}): Durability => ({ ...DEFAULT_DURABILITY, ...over })

describe('installNudgeDue', () => {
  it('waits for the third entry', () => {
    expect(installNudgeDue(state(), 2, false)).toBe(false)
    expect(installNudgeDue(state(), 3, false)).toBe(true)
  })

  it('never shows in an installed app', () => {
    expect(installNudgeDue(state(), 30, true)).toBe(false)
  })

  it('stays gone once dismissed', () => {
    expect(installNudgeDue(state({ installNudgeDismissed: true }), 30, false)).toBe(false)
  })
})

describe('backupNudgeDue', () => {
  it('counts entries since the last export, not since the start', () => {
    expect(unbackedCount(state({ entriesAtExport: 12 }), 15)).toBe(3)
    expect(backupNudgeDue(state({ entriesAtExport: 12 }), 21)).toBe(false)
    expect(backupNudgeDue(state({ entriesAtExport: 12 }), 22)).toBe(true)
  })

  it('shows at ten entries when the diary has never been exported', () => {
    expect(backupNudgeDue(state(), 9)).toBe(false)
    expect(backupNudgeDue(state(), 10)).toBe(true)
  })

  it('snoozes for another ten entries, then comes back', () => {
    const snoozed = state({ entriesAtSnooze: 10 })
    expect(backupNudgeDue(snoozed, 11)).toBe(false)
    expect(backupNudgeDue(snoozed, 19)).toBe(false)
    expect(backupNudgeDue(snoozed, 20)).toBe(true)
  })

  it('ignores an export count ahead of the diary — deleted entries are not backups', () => {
    expect(unbackedCount(state({ entriesAtExport: 40 }), 12)).toBe(0)
    expect(backupNudgeDue(state({ entriesAtExport: 40 }), 12)).toBe(false)
  })
})
