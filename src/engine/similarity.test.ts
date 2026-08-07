import { describe, expect, it } from 'vitest'
import { PRIORS } from './config'
import { SIMILAR_EXPOSURE_DISTANCE, exposureDistance, isSimilarExposure } from './similarity'

describe('exposureDistance', () => {
  it('is zero for identical vectors', () => {
    const x = { pm25: 12, o3: 90, heat_stress: 3 }
    expect(exposureDistance(x, { ...x }, PRIORS)).toBe(0)
  })

  it('measures a difference in units of the level-2 prior', () => {
    // pm25 level-2 prior is 9.1 µg/m³, so +9.1 is exactly one unit.
    expect(exposureDistance({ pm25: 10 }, { pm25: 19.1 }, PRIORS)).toBeCloseTo(1)
    expect(exposureDistance({ pm25: 10 }, { pm25: 14.55 }, PRIORS)).toBeCloseTo(0.5)
  })

  it('takes the worst variable, not the average', () => {
    const a = { pm25: 10, o3: 40, no2: 10 }
    const b = { pm25: 10, o3: 40, no2: 35 } // no2 prior 25 -> one full unit
    expect(exposureDistance(a, b, PRIORS)).toBeCloseTo(1)
  })

  it('treats a variable missing from one vector as zero', () => {
    expect(exposureDistance({ pm25: 9.1 }, {}, PRIORS)).toBeCloseTo(1)
  })

  it('falls back to the negligible floor when a variable has no level-2 prior', () => {
    // Unknown variables get a scale of 1, so the raw difference is the distance.
    expect(exposureDistance({ mystery: 0 }, { mystery: 3 }, {})).toBe(3)
  })

  it('is symmetric', () => {
    const a = { pm25: 8, o3: 120, humidity: 61 }
    const b = { pm25: 21, o3: 95, humidity: 74 }
    expect(exposureDistance(a, b, PRIORS)).toBe(exposureDistance(b, a, PRIORS))
  })
})

describe('isSimilarExposure', () => {
  const morning = { pm25: 12, pm10: 20, o3: 80, no2: 14, heat_stress: 2, humidity: 62 }

  it('accepts small drift within a quarter of each level-2 prior', () => {
    const later = { ...morning, pm25: 13.5, o3: 95, heat_stress: 3 }
    expect(isSimilarExposure(morning, later, PRIORS)).toBe(true)
  })

  it('rejects a smoke spike even when everything else is unchanged', () => {
    expect(isSimilarExposure(morning, { ...morning, pm25: 45 }, PRIORS)).toBe(false)
  })

  it('rejects an afternoon ozone climb', () => {
    expect(isSimilarExposure(morning, { ...morning, o3: 150 }, PRIORS)).toBe(false)
  })

  it('is inclusive at exactly the threshold', () => {
    // +6.25 µg/m³ is exactly a quarter of the 25 µg/m³ no2 prior.
    expect(exposureDistance({ no2: 10 }, { no2: 16.25 }, PRIORS)).toBe(SIMILAR_EXPOSURE_DISTANCE)
    expect(isSimilarExposure({ no2: 10 }, { no2: 16.25 }, PRIORS)).toBe(true)
    expect(isSimilarExposure({ no2: 10 }, { no2: 16.5 }, PRIORS)).toBe(false)
  })
})
