import { describe, expect, it } from 'vitest'
import { buildModel } from '../engine/infer'
import type { DiaryEntry } from '../engine/types'
import { calendarPollenPatch } from './pollenTag'

const HAMDEN = { lat: 41.396, lon: -72.897 }

const entryAt = (time: string): DiaryEntry => ({
  id: 'e1',
  time,
  rating: 3,
  exposure: { pm25: 3, o3: 10, humidity: 50 },
})

describe('tagging a conflict "pollen"', () => {
  it('attaches the season that day was in, marked as an estimate', () => {
    const patch = calendarPollenPatch(entryAt('2026-08-20T15:00:00.000Z'), HAMDEN)
    expect(patch?.exposure?.ragweed_pollen).toBe(10)
    expect(patch?.estimated).toEqual(['ragweed_pollen'])
    // Everything already on the entry survives.
    expect(patch?.exposure?.pm25).toBe(3)
  })

  it('turns the unexplainable day into a suspicion, not a confirmation', () => {
    const entry = entryAt('2026-08-20T15:00:00.000Z')
    expect(buildModel([entry]).conflicts).toHaveLength(1)

    const tagged = { ...entry, ...calendarPollenPatch(entry, HAMDEN) }
    const model = buildModel([tagged])
    expect(model.conflicts).toHaveLength(0)
    expect(model.constraints.map((c) => c.candidates)).toContainEqual(['ragweed_pollen'])
    expect(model.confirmed.ragweed_pollen).toBeUndefined()
  })

  it('has nothing to attach out of season, and says so', () => {
    expect(calendarPollenPatch(entryAt('2026-01-20T15:00:00.000Z'), HAMDEN)).toBeNull()
  })

  it('has nothing to attach with no place known', () => {
    expect(calendarPollenPatch(entryAt('2026-08-20T15:00:00.000Z'), null)).toBeNull()
  })

  it('leaves an entry that already carries pollen alone', () => {
    const entry = entryAt('2026-08-20T15:00:00.000Z')
    entry.exposure.ragweed_pollen = 4
    expect(calendarPollenPatch(entry, HAMDEN)).toBeNull()
  })

  it('will not build a vector for an entry still waiting on its air', () => {
    const entry = { ...entryAt('2026-08-20T15:00:00.000Z'), exposure: {}, pendingExposure: HAMDEN }
    expect(calendarPollenPatch(entry, HAMDEN)).toBeNull()
  })
})
