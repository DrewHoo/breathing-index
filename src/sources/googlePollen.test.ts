import { describe, expect, it } from 'vitest'
import { parsePollen } from './googlePollen'

// Field shapes copied from a live relay response (Norfolk, Aug 2026),
// including its quirks: a type with no indexInfo at all, and plant rows that
// are bare name-only stubs with no season claim.
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
        { code: 'MAPLE', displayName: 'Maple' }, // bare stub
        {
          code: 'RAGWEED',
          displayName: 'Ragweed',
          inSeason: true,
          indexInfo: { code: 'UPI', value: 2, category: 'Low' },
          plantDescription: { type: 'WEED', family: 'Asteraceae' },
        },
        {
          code: 'ELM',
          displayName: 'Elm',
          inSeason: false,
          indexInfo: { code: 'UPI', value: 1, category: 'Very Low' },
          plantDescription: { type: 'TREE', family: 'Ulmaceae' },
        },
      ],
    },
  ],
}

describe('parsePollen', () => {
  it('keys days by local date and types by exposure variable', () => {
    const days = parsePollen(PAYLOAD)
    const day = days.get('2026-08-11')!
    expect(day.pollen_tree?.value).toBe(1)
    expect(day.pollen_weed?.value).toBe(2)
  })

  it('drops a type with no index — Google saying nothing, not zero', () => {
    expect(parsePollen(PAYLOAD).get('2026-08-11')!.pollen_grass).toBeUndefined()
  })

  it('names only in-season, typed plants, lowercased for the sub-label', () => {
    const day = parsePollen(PAYLOAD).get('2026-08-11')!
    expect(day.pollen_weed?.plants).toEqual(['ragweed'])
    // Elm is typed but out of season; Maple is a bare stub with no type.
    expect(day.pollen_tree?.plants).toEqual([])
  })

  it('returns an empty map for an empty or alien payload', () => {
    expect(parsePollen({}).size).toBe(0)
    expect(parsePollen({ dailyInfo: [{}] }).size).toBe(0)
  })
})
