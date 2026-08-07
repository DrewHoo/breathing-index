import { describe, expect, it } from 'vitest'
import { PRIORS } from '../engine/config'
import type { DiaryEntry, Exposure, Rating } from '../engine/types'
import { findTodaysSimilarEntry } from './recentEntry'

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

describe('findTodaysSimilarEntry', () => {
  it('finds nothing in an empty diary', () => {
    expect(findTodaysSimilarEntry([], AIR, PRIORS, NOW)).toBeNull()
  })

  it('finds an entry logged earlier today in the same air', () => {
    const morning = entry('2026-08-07T09:00:00', 2)
    expect(findTodaysSimilarEntry([morning], AIR, PRIORS, NOW)?.id).toBe(morning.id)
  })

  it('ignores an identical-looking entry from a previous day', () => {
    expect(findTodaysSimilarEntry([entry('2026-08-06T14:00:00', 2)], AIR, PRIORS, NOW)).toBeNull()
  })

  it('ignores today\'s entry once the air has moved', () => {
    const morning = entry('2026-08-07T09:00:00', 1, { ...AIR, pm25: 3, o3: 20 })
    expect(findTodaysSimilarEntry([morning], AIR, PRIORS, NOW)).toBeNull()
  })

  it('returns the most recent match, whatever the diary order', () => {
    const early = entry('2026-08-07T08:00:00', 1)
    const late = entry('2026-08-07T13:30:00', 3, { ...AIR, pm25: 13 })
    expect(findTodaysSimilarEntry([late, early], AIR, PRIORS, NOW)?.id).toBe(late.id)
    expect(findTodaysSimilarEntry([early, late], AIR, PRIORS, NOW)?.id).toBe(late.id)
  })

  it('counts confounded entries — the question was still answered', () => {
    const sick = entry('2026-08-07T09:00:00', 3, AIR, { confounders: ['sick'] })
    expect(findTodaysSimilarEntry([sick], AIR, PRIORS, NOW)?.id).toBe(sick.id)
  })

  it('skips entries with an unparseable timestamp', () => {
    const broken = { ...entry('2026-08-07T09:00:00', 2), time: 'not a date' }
    expect(findTodaysSimilarEntry([broken], AIR, PRIORS, NOW)).toBeNull()
  })
})
