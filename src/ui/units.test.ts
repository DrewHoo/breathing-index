import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './settings'
import {
  displayExposure,
  displayTemperature,
  displayTemperatureDelta,
  regionFromTags,
  temperatureUnit,
  temperatureUnitForRegion,
} from './units'

describe('regionFromTags', () => {
  it('reads a stated region', () => {
    expect(regionFromTags(['en-US'])).toBe('US')
    expect(regionFromTags(['nl-NL', 'en'])).toBe('NL')
  })

  it('prefers a stated region over one inferred from a language-only tag', () => {
    // Chrome reports ['en', 'en-GB'] for a UK user who lists English first.
    expect(regionFromTags(['en', 'en-GB'])).toBe('GB')
  })

  it('falls back to likely subtags when no tag states a region', () => {
    expect(regionFromTags(['en'])).toBe('US')
    expect(regionFromTags(['nl'])).toBe('NL')
  })

  it('ignores malformed tags', () => {
    expect(regionFromTags(['not a locale', 'fr-FR'])).toBe('FR')
    expect(regionFromTags(['not a locale'])).toBeUndefined()
  })

  it('returns undefined for no tags at all', () => {
    expect(regionFromTags([])).toBeUndefined()
  })
})

describe('temperatureUnitForRegion', () => {
  it('gives Fahrenheit to the US and its territories', () => {
    for (const region of ['US', 'PR', 'GU', 'VI']) {
      expect(temperatureUnitForRegion(region), region).toBe('F')
    }
  })

  it('gives Celsius everywhere else, including when the region is unknown', () => {
    for (const region of ['NL', 'GB', 'CA', 'DE', 'JP']) {
      expect(temperatureUnitForRegion(region), region).toBe('C')
    }
    expect(temperatureUnitForRegion(undefined)).toBe('C')
  })
})

describe('temperatureUnit', () => {
  it('honours an explicit preference over the locale', () => {
    expect(temperatureUnit({ ...DEFAULT_SETTINGS, units: 'celsius' })).toBe('C')
    expect(temperatureUnit({ ...DEFAULT_SETTINGS, units: 'fahrenheit' })).toBe('F')
  })
})

describe('conversion', () => {
  it('converts absolute temperatures with the 32° offset', () => {
    expect(displayTemperature(0, 'F')).toBe(32)
    expect(displayTemperature(25, 'F')).toBe(77)
    expect(displayTemperature(10, 'F')).toBe(50)
    expect(displayTemperature(25, 'C')).toBe(25)
  })

  it('converts temperature differences without the offset', () => {
    expect(displayTemperatureDelta(0, 'F')).toBe(0)
    expect(displayTemperatureDelta(5, 'F')).toBe(9)
    expect(displayTemperatureDelta(5, 'C')).toBe(5)
  })

  it('converts only the temperature stress features', () => {
    // 6 °C over 25 is 10.8 °F over 77 — the same air, described twice.
    expect(displayExposure('heat_stress', 6, 'F')).toBeCloseTo(10.8)
    expect(displayExposure('cold_dry_stress', 5, 'F')).toBeCloseTo(9)
    expect(displayExposure('pm25', 20, 'F')).toBe(20)
    expect(displayExposure('humidity', 68, 'F')).toBe(68)
  })
})
