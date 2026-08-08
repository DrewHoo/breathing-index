import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { claimBankedRelease, markBankedToday } from './bankedDay'

const store = new Map<string, string>()

const stubStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v)
  },
  removeItem: (k: string) => {
    store.delete(k)
  },
}

const DAY_1 = new Date('2026-08-07T09:05:00')
const LATER_DAY_1 = new Date('2026-08-07T21:40:00')
const DAY_2 = new Date('2026-08-08T07:15:00')
const DAY_3 = new Date('2026-08-09T08:00:00')

describe('bankedDay', () => {
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', stubStorage)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('claims nothing when nothing was ever banked', () => {
    expect(claimBankedRelease(DAY_2)).toBe(false)
  })

  it('claims nothing later the same day — the entries are still held out', () => {
    markBankedToday(DAY_1)
    expect(claimBankedRelease(LATER_DAY_1)).toBe(false)
  })

  it('claims once on the next local day, then never again', () => {
    markBankedToday(DAY_1)
    expect(claimBankedRelease(DAY_2)).toBe(true)
    expect(claimBankedRelease(DAY_2)).toBe(false)
  })

  it('re-arms when a later day banks entries of its own', () => {
    markBankedToday(DAY_1)
    claimBankedRelease(DAY_2)
    markBankedToday(DAY_2)
    expect(claimBankedRelease(DAY_2)).toBe(false)
    expect(claimBankedRelease(DAY_3)).toBe(true)
  })

  it('stays quiet rather than throwing when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => markBankedToday(DAY_1)).not.toThrow()
    expect(claimBankedRelease(DAY_2)).toBe(false)
  })
})
