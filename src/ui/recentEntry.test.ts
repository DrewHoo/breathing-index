import { describe, expect, it } from 'vitest'
import { PRIORS } from '../engine/config'
import type { DiaryEntry, Exposure, Rating } from '../engine/types'
import { todaysSimilarEntries } from './recentEntry'

const NOW = new Date('2026-08-07T15:00:00')

const AIR: Exposure = { pm25: 12, pm10: 20, o3: 80, no2: 14, heat_stress: 2, humidity: 62 }

let seq = 0
const entry = (
  time: string,
  rating: Rating,
  exposure: Exposure = AIR,
  extra: Partial<DiaryEntry> = {},
): DiaryEntry => ({
  id: `e${seq++}`,
  time: new Date(time).toISOString(),
  rating,
  exposure,
  ...extra,
})

const ids = (entries: DiaryEntry[]): string[] => entries.map((e) => e.id)

describe('todaysSimilarEntries', () => {
  it('finds nothing in an empty diary', () => {
    expect(todaysSimilarEntries([], AIR, PRIORS, NOW)).toEqual([])
  })

  it('finds an entry logged earlier today in the same air', () => {
    const morning = entry('2026-08-07T09:00:00', 2)
    expect(ids(todaysSimilarEntries([morning], AIR, PRIORS, NOW))).toEqual([morning.id])
  })

  it('ignores an identical-looking entry from a previous day', () => {
    expect(todaysSimilarEntries([entry('2026-08-06T14:00:00', 2)], AIR, PRIORS, NOW)).toEqual([])
  })

  it("ignores today's entry once the air has moved", () => {
    const morning = entry('2026-08-07T09:00:00', 1, { ...AIR, pm25: 3, o3: 20 })
    expect(todaysSimilarEntries([morning], AIR, PRIORS, NOW)).toEqual([])
  })

  it('returns every match, most recent first, whatever the diary order', () => {
    const early = entry('2026-08-07T08:00:00', 1)
    const mid = entry('2026-08-07T11:15:00', 2, { ...AIR, pm25: 13 })
    const late = entry('2026-08-07T13:30:00', 3, { ...AIR, o3: 88 })
    expect(ids(todaysSimilarEntries([mid, late, early], AIR, PRIORS, NOW))).toEqual([
      late.id,
      mid.id,
      early.id,
    ])
  })

  it('counts confounded entries — the question was still answered', () => {
    const sick = entry('2026-08-07T09:00:00', 3, AIR, { confounders: ['sick'] })
    expect(ids(todaysSimilarEntries([sick], AIR, PRIORS, NOW))).toEqual([sick.id])
  })

  it('skips entries with an unparseable timestamp', () => {
    const broken = { ...entry('2026-08-07T09:00:00', 2), time: 'not a date' }
    expect(todaysSimilarEntries([broken], AIR, PRIORS, NOW)).toEqual([])
  })
})
