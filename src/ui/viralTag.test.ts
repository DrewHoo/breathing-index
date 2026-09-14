import { describe, expect, it } from 'vitest'
import { buildModel } from '../engine/infer'
import type { DiaryEntry } from '../engine/types'
import { isSick, viralPatch } from './viralTag'

const entry = (over: Partial<DiaryEntry> = {}): DiaryEntry => ({
  id: 'e1',
  time: '2026-09-14T15:00:00.000Z',
  rating: 3,
  exposure: { pollen_oak: 4 },
  ...over,
})

describe('tagging a conflict "sick"', () => {
  it('attaches the variable, leaving the air alone', () => {
    const patch = viralPatch(entry())
    expect(patch?.exposure).toEqual({ pollen_oak: 4, viral: 1 })
  })

  it('has nothing to add to a day already marked sick', () => {
    expect(viralPatch(entry({ exposure: { pollen_oak: 4, viral: 1 } }))).toBeNull()
  })

  it('reads the flag off the vector, and only a 1 counts', () => {
    expect(isSick(entry())).toBe(false)
    expect(isSick(entry({ exposure: { viral: 1 } }))).toBe(true)
    // Absent, never 0 — a 0 would be a reading of something nobody measured.
    expect(isSick(entry({ exposure: { viral: 0 } }))).toBe(false)
  })

  it('turns an unexplainable day into a candidate set instead of filing it away', () => {
    // The oak was already proven tolerable at this level, so the bad day has
    // nothing left to blame and reads as an unmodeled trigger.
    const diary = [
      { rating: 1 as const, exposure: { pollen_oak: 5 } },
      { rating: 3 as const, exposure: { pollen_oak: 4 } },
    ]
    expect(buildModel(diary).conflicts).toEqual([
      { entryIndex: 1, kind: 'unmodeled-trigger', againstIndex: 0 },
    ])

    const bad = entry({ exposure: diary[1]!.exposure })
    const tagged = [diary[0]!, { ...bad, ...viralPatch(bad) }]
    const model = buildModel(tagged)
    expect(model.conflicts).toEqual([])
    // One day, with oak still in the background: a lead, not yet a promise.
    expect(
      model.confirmations.map((c) => [c.variable, c.level, c.strength, c.context]),
    ).toEqual([
      ['viral', 2, 'suspected-strong', { pollen_oak: 4 }],
      ['viral', 3, 'suspected-strong', { pollen_oak: 4 }],
    ])
  })
})
