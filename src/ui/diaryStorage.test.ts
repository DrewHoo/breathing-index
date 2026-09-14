import { describe, expect, it } from 'vitest'
import { buildModel } from '../engine/infer'
import type { DiaryEntry } from '../engine/types'
import { migrateEntries } from './diaryStorage'

const entry = (id: string, over: Partial<DiaryEntry> = {}): DiaryEntry => ({
  id,
  time: '2026-09-14T15:00:00.000Z',
  rating: 3,
  exposure: { pollen_oak: 4 },
  ...over,
})

describe('migrateEntries', () => {
  const diary = (): DiaryEntry[] => [
    entry('untouched'),
    entry('sick-only', { confounders: ['sick'] }),
    entry('sick-and-more', { confounders: ['sick', 'allergies'] }),
    entry('old-spelling', { confounders: ['indoors-all-day'] }),
    entry('already-flagged', { confounders: ['sick'], exposure: { pollen_oak: 4, viral: 1 } }),
  ]

  it('moves the sick confounder onto the vector as a variable', () => {
    const [, sickOnly, both] = migrateEntries(diary())
    expect(sickOnly!.exposure).toEqual({ pollen_oak: 4, viral: 1 })
    // The array goes away entirely when sick was all it held: an empty
    // `confounders` still excludes the entry from inference, and admitting
    // these days is the point of the change.
    expect('confounders' in sickOnly!).toBe(false)
    expect(both!.exposure.viral).toBe(1)
    expect(both!.confounders).toEqual(['allergies'])
  })

  it('still renames the older spellings, and leaves everything else alone', () => {
    const [untouched, , , oldSpelling] = migrateEntries(diary())
    expect(oldSpelling!.confounders).toEqual(['indoors all day'])
    expect(untouched).toEqual(entry('untouched'))
  })

  it('is idempotent, and does not disturb a day that already carries the flag', () => {
    const once = migrateEntries(diary())
    expect(migrateEntries(once)).toEqual(once)
    expect(once[4]!.exposure).toEqual({ pollen_oak: 4, viral: 1 })
  })

  it('does not mutate what it was handed', () => {
    const before = diary()
    migrateEntries(before)
    expect(before).toEqual(diary())
  })

  it('readmits the migrated day to inference, which is the whole point', () => {
    const before = [entry('sick-only', { confounders: ['sick'] })]
    expect(buildModel(before).constraints).toEqual([])

    const after = migrateEntries(before)
    expect(buildModel(after).constraints.map((c) => [...c.candidates].sort())).toEqual([
      ['pollen_oak', 'viral'],
      ['pollen_oak', 'viral'],
    ])
  })
})
