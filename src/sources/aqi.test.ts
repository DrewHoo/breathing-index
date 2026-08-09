import { describe, expect, it } from 'vitest'
import { PRIORS } from '../engine/config'
import { bridgeableParameter, concentrationFromAqi } from './aqi'

const at = (parameter: string, aqi: number): number => {
  const value = concentrationFromAqi(parameter, aqi)
  if (value === null) throw new Error(`no concentration for ${parameter} ${aqi}`)
  return value
}

describe('concentrationFromAqi', () => {
  it('lands on the engine breakpoints at the category edges', () => {
    // The category boundaries are the same numbers scripts/derive-breakpoints.mjs
    // feeds into PRIORS, so the inverse has to reproduce them exactly. Ozone
    // included, conversion and all: 71 ppb × 1.96 = 139 µg/m³.
    expect(at('PM2.5', 101)).toBeCloseTo(PRIORS.pm25![3]!, 5)
    expect(at('PM2.5', 151)).toBeCloseTo(PRIORS.pm25![4]!, 5)
    expect(at('PM10', 51)).toBeCloseTo(PRIORS.pm10![2]!, 5)
    expect(at('PM10', 101)).toBeCloseTo(PRIORS.pm10![3]!, 5)
    expect(Math.round(at('OZONE', 101))).toBe(PRIORS.o3![3])
    expect(Math.round(at('OZONE', 151))).toBe(PRIORS.o3![4])
  })

  it('interpolates inside a category', () => {
    // AQI 50 is the top of Good for PM2.5: 9.0 µg/m³.
    expect(at('PM2.5', 50)).toBeCloseTo(9, 5)
    expect(at('PM2.5', 100)).toBeCloseTo(35.4, 5)
    // Halfway up Moderate is halfway up the concentration band.
    expect(at('PM10', 75)).toBeCloseTo(55 + (24 * (154 - 55)) / 49, 5)
  })

  it('reads ozone points as a mass concentration, not as points', () => {
    // The M1 Hamden case: a station in the high 50s against a model at 166.
    const station = at('OZONE', 58)
    expect(station).toBeGreaterThan(100)
    expect(station).toBeLessThan(125)
  })

  it('has nothing to say about pollutants outside the table', () => {
    expect(concentrationFromAqi('NO2', 40)).toBeNull()
    expect(concentrationFromAqi('CO', 40)).toBeNull()
    expect(bridgeableParameter('NO2')).toBeUndefined()
  })

  it('refuses values off the end of the table rather than extrapolating', () => {
    // The 8-h ozone table stops at 200 ppb; above that the 1-h table governs.
    expect(concentrationFromAqi('OZONE', 350)).toBeNull()
    expect(concentrationFromAqi('PM2.5', 501)).toBeNull()
    expect(concentrationFromAqi('PM2.5', -1)).toBeNull()
    expect(concentrationFromAqi('PM2.5', Number.NaN)).toBeNull()
  })
})
