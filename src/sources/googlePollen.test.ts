import { describe, expect, it } from 'vitest'
import { parsePollen } from './googlePollen'

// Field shapes copied from a live relay response (Norfolk, Aug 2026),
// including its quirks: a type with no indexInfo at all, plant rows that are
// bare name-only stubs, and out-of-season plants still carrying an index.
const PAYLOAD = {
  regionCode: 'US',
  dailyInfo: [
    {
      date: { year: 2026, month: 8, day: 11 },
      pollenTypeInfo: [
        { code: 'GRASS', displayName: 'Grass' }, // no indexInfo: nothing to report
        {
          code: 'TREE',
          displayName: 'Tree',
          inSeason: false,
          indexInfo: { code: 'UPI', value: 1, category: 'Very Low' },
        },
        {
          code: 'WEED',
          displayName: 'Weed',
          inSeason: true,
          indexInfo: { code: 'UPI', value: 2, category: 'Low' },
        },
      ],
      plantInfo: [
        { code: 'MAPLE', displayName: 'Maple' }, // bare stub, no index
        {
          code: 'RAGWEED',
          displayName: 'Ragweed',
          inSeason: true,
          indexInfo: { code: 'UPI', value: 2, category: 'Low' },
          plantDescription: { type: 'WEED', family: 'Asteraceae' },
        },
        {
          code: 'MUGWORT',
          displayName: 'Mugwort',
          inSeason: true,
          indexInfo: { code: 'UPI', value: 1, category: 'Very Low' },
        },
        {
          code: 'ELM',
          displayName: 'Elm',
          inSeason: false,
          indexInfo: { code: 'UPI', value: 1, category: 'Very Low' },
          plantDescription: { type: 'TREE', family: 'Ulmaceae' },
        },
        {
          code: 'GRAMINALES',
          displayName: 'Grasses',
          indexInfo: { code: 'UPI', value: 0 }, // measured zero
        },
      ],
    },
  ],
}

describe('parsePollen', () => {
  it('makes plants the exposure variables, keyed by local date', () => {
    const day = parsePollen(PAYLOAD).get('2026-08-11')!
    expect(day.exposure).toEqual({ pollen_ragweed: 2, pollen_mugwort: 1, pollen_elm: 1 })
  })

  it('keeps the type index as display, with plants ordered highest first', () => {
    const day = parsePollen(PAYLOAD).get('2026-08-11')!
    expect(day.types.weed).toEqual({
      value: 2,
      plants: [
        { variable: 'pollen_ragweed', name: 'Ragweed', value: 2 },
        { variable: 'pollen_mugwort', name: 'Mugwort', value: 1 },
      ],
    })
    // Out of season but reporting: elm still counts — the index is the claim.
    expect(day.types.tree!.plants.map((p) => p.variable)).toEqual(['pollen_elm'])
  })

  it('drops a type with no index and zero-index plants — silence, not zeros', () => {
    const day = parsePollen(PAYLOAD).get('2026-08-11')!
    expect(day.types.grass).toBeUndefined()
    expect(day.exposure.pollen_graminales).toBeUndefined()
  })

  it('never carries a plant whose type row was dropped', () => {
    // Every exposure variable must be visible on some row.
    const day = parsePollen(PAYLOAD).get('2026-08-11')!
    const shown = Object.values(day.types).flatMap((t) => t.plants.map((p) => p.variable))
    expect(Object.keys(day.exposure).sort()).toEqual(shown.sort())
  })

  it('returns an empty map for an empty or alien payload', () => {
    expect(parsePollen({}).size).toBe(0)
    expect(parsePollen({ dailyInfo: [{}] }).size).toBe(0)
  })
})
