import { describe, expect, it } from 'vitest'
import type { DiaryEntry } from '../engine/types'
import { MALFORMED_ENTRIES, UNREADABLE_FILE, mergeDiary, parseDiaryImport } from './diaryTransfer'

const entry = (over: Partial<DiaryEntry> = {}): DiaryEntry => ({
  id: 'a1',
  time: '2026-08-07T15:00:00.000Z',
  rating: 2,
  exposure: { pm25: 12, o3: 80, humidity: 62 },
  ...over,
})

const json = (value: unknown): string => JSON.stringify(value)

const entries = (text: string): DiaryEntry[] => {
  const result = parseDiaryImport(text)
  if (!result.ok) throw new Error(`expected a valid import, got: ${result.reason}`)
  return result.entries
}

const rejection = (text: string): string => {
  const result = parseDiaryImport(text)
  if (result.ok) throw new Error('expected the import to be rejected')
  return result.reason
}

describe('parseDiaryImport', () => {
  it('accepts a diary export, optional fields and all', () => {
    const full = entry({
      note: 'walk cut short',
      confounders: ['sick'],
      observations: ['worse-outdoors'],
      official: { usAqi: 70, eaqi: null },
    })
    expect(entries(json([full, entry({ id: 'a2' })]))).toEqual([full, entry({ id: 'a2' })])
  })

  it('accepts an entry still waiting on its air, empty vector and all', () => {
    const waiting = entry({ exposure: {}, pendingExposure: { lat: 41.396, lon: -72.897 } })
    expect(entries(json([waiting]))).toEqual([waiting])
  })

  it('rejects an empty vector on an entry that is not waiting on anything', () => {
    expect(rejection(json([entry({ exposure: {} })]))).toBe(MALFORMED_ENTRIES)
  })

  it('accepts an empty diary', () => {
    expect(entries('[]')).toEqual([])
  })

  it('rejects text that is not JSON', () => {
    expect(rejection('not json at all')).toBe(UNREADABLE_FILE)
  })

  it('rejects JSON that is not an array', () => {
    expect(rejection(json({ entries: [entry()] }))).toBe(UNREADABLE_FILE)
  })

  it('rejects an entry with no rating', () => {
    const { rating, ...rest } = entry()
    void rating
    expect(rejection(json([rest]))).toBe(MALFORMED_ENTRIES)
  })

  it('rejects a rating outside 1–4', () => {
    expect(rejection(json([entry({ rating: 7 as DiaryEntry['rating'] })]))).toBe(MALFORMED_ENTRIES)
  })

  it('rejects an unparseable time', () => {
    expect(rejection(json([entry({ time: 'whenever' })]))).toBe(MALFORMED_ENTRIES)
  })

  it('rejects a missing or empty exposure vector', () => {
    expect(rejection(json([entry({ exposure: {} })]))).toBe(MALFORMED_ENTRIES)
    const { exposure, ...rest } = entry()
    void exposure
    expect(rejection(json([rest]))).toBe(MALFORMED_ENTRIES)
  })

  it('rejects an exposure that is not all numbers', () => {
    expect(rejection(json([entry({ exposure: { pm25: 'lots' as unknown as number } })]))).toBe(
      MALFORMED_ENTRIES,
    )
  })

  it('rejects an id-only object — the old import merged those straight in', () => {
    expect(rejection(json([{ id: 'a1' }]))).toBe(MALFORMED_ENTRIES)
  })

  it('rejects the whole file when one entry is bad', () => {
    expect(rejection(json([entry(), { id: 'a2', time: '2026-08-07T16:00:00.000Z' }]))).toBe(
      MALFORMED_ENTRIES,
    )
  })

  it('rejects nulls and bare values in the array', () => {
    expect(rejection(json([null]))).toBe(MALFORMED_ENTRIES)
    expect(rejection(json(['a1']))).toBe(MALFORMED_ENTRIES)
  })
})

describe('mergeDiary', () => {
  const older = entry({ id: 'a1', time: '2026-08-05T09:00:00.000Z' })
  const newer = entry({ id: 'a2', time: '2026-08-07T15:00:00.000Z' })

  it('adds unknown entries and sorts oldest first', () => {
    const { merged, added } = mergeDiary([newer], [older])
    expect(merged.map((e) => e.id)).toEqual(['a1', 'a2'])
    expect(added).toEqual([older])
  })

  it('keeps the entry it already has when ids collide', () => {
    const amended = { ...older, note: 'from the backup' }
    const { merged, added } = mergeDiary([older], [amended])
    expect(merged).toEqual([older])
    expect(added).toEqual([])
  })

  it('dedupes repeats inside the imported file', () => {
    const { added } = mergeDiary([], [older, older])
    expect(added).toEqual([older])
  })
})
