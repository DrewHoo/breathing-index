import { describe, expect, it } from 'vitest'
import { PRIORS } from './config'
import { buildModel, predict } from './infer'

/** No diary at all: predictions come entirely from the population priors. */
const freshProfile = buildModel([])

const ceilingAt = (exposure: Record<string, number>) =>
  predict(freshProfile, exposure, PRIORS).ceiling

describe('cold-start pollutant priors', () => {
  it('warns that a 150 µg/m³ ozone hour could be limiting', () => {
    // EPA 8-h USG starts at 71 ppb ≈ 139 µg/m³, so 150 is squarely inside it.
    expect(ceilingAt({ o3: 150 })).toBe(3)
  })

  it('holds the ozone levels at their derived boundaries', () => {
    expect(ceilingAt({ o3: 138 })).toBe(2)
    expect(ceilingAt({ o3: 139 })).toBe(3)
    expect(ceilingAt({ o3: 168 })).toBe(3)
    expect(ceilingAt({ o3: 169 })).toBe(4)
  })

  it('never lowers the floor — priors only raise the ceiling', () => {
    expect(predict(freshProfile, { o3: 200, pm25: 90 }, PRIORS).floor).toBe(1)
  })
})
