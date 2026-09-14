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

describe('cold-start pollen priors', () => {
  it('says nothing about a tree plant at Moderate, and warns at High', () => {
    // Population evidence for tree pollen and asthma is weak — London's tree
    // models were inconclusive, Atlanta associated Cupressaceae with *fewer*
    // ED visits — so the tree rows start one category later than the others
    // (specs/22-exposure-windows.md). Oak stays a candidate at 3; it just has
    // no population claim behind it until the diary makes one.
    expect(ceilingAt({ pollen_oak: 3 })).toBe(1)
    expect(ceilingAt({ pollen_oak: 4 })).toBe(3)
    expect(ceilingAt({ pollen_birch: 5 })).toBe(4)
  })

  it('keeps the Moderate row for grass and weeds', () => {
    // Grass is the one taxon with a defensible asthma signal (Erbas 2018),
    // and ragweed keeps its row on the same reasoning at lower confidence.
    expect(ceilingAt({ pollen_graminales: 3 })).toBe(2)
    expect(ceilingAt({ pollen_ragweed: 3 })).toBe(2)
  })
})
