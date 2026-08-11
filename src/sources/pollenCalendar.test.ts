import { describe, expect, it } from 'vitest'
import { PRIORS, negligibleFor } from '../engine/config'
import { POLLEN_PLANT_VARIABLES } from './pollenPlants'
import { calendarPollen, monthOf, pollenRegion } from './pollenCalendar'

const HAMDEN = { lat: 41.396, lon: -72.897 }
const AMSTERDAM = { lat: 52.37, lon: 4.9 }
const REGIONS = [
  { name: 'Hamden, CT', lat: 41.396, lon: -72.897, region: 'northeast' },
  { name: 'Minneapolis, MN', lat: 44.98, lon: -93.27, region: 'upper-midwest' },
  { name: 'Louisville, KY', lat: 38.25, lon: -85.76, region: 'ohio-valley' },
  { name: 'Atlanta, GA', lat: 33.75, lon: -84.39, region: 'southeast' },
  { name: 'Austin, TX', lat: 30.27, lon: -97.74, region: 'south' },
  { name: 'Billings, MT', lat: 45.78, lon: -108.5, region: 'northern-plains' },
  { name: 'Denver, CO', lat: 39.74, lon: -104.99, region: 'southwest' },
  { name: 'Portland, OR', lat: 45.52, lon: -122.68, region: 'northwest' },
  { name: 'Los Angeles, CA', lat: 34.05, lon: -118.24, region: 'west' },
] as const

describe('region lookup', () => {
  for (const place of REGIONS) {
    it(`puts ${place.name} in ${place.region}`, () => {
      expect(pollenRegion(place.lat, place.lon)).toBe(place.region)
    })
  }

  it('claims nothing outside the table — abroad, the measured feed is the only source', () => {
    expect(pollenRegion(AMSTERDAM.lat, AMSTERDAM.lon)).toBeNull()
    expect(calendarPollen(AMSTERDAM.lat, AMSTERDAM.lon, 8)).toEqual({ types: {}, exposure: {} })
  })

  it('claims nothing for places the boxes do not reach', () => {
    expect(pollenRegion(61.2, -149.9)).toBeNull() // Anchorage
    expect(pollenRegion(-33.9, 151.2)).toBeNull() // Sydney
  })
})

describe('the calendar itself', () => {
  it('has ragweed running in Hamden in August, on the index scale', () => {
    const august = calendarPollen(HAMDEN.lat, HAMDEN.lon, 8)
    expect(august.exposure).toEqual({ pollen_ragweed: 3 })
    expect(august.types.weed).toEqual({
      value: 3,
      plants: [{ variable: 'pollen_ragweed', name: 'Ragweed', value: 3 }],
    })
    expect(august.types.grass).toBeUndefined()
    expect(august.types.tree).toBeUndefined()
  })

  it('peaks that ragweed season in September and ends it after October', () => {
    expect(calendarPollen(HAMDEN.lat, HAMDEN.lon, 9).exposure.pollen_ragweed).toBe(4)
    expect(calendarPollen(HAMDEN.lat, HAMDEN.lon, 11).exposure.pollen_ragweed).toBeUndefined()
  })

  it('leaves winter empty rather than writing zeros', () => {
    // "Nothing is in season" and "we measured zero" are different claims, and
    // only the first one is ours to make.
    expect(calendarPollen(HAMDEN.lat, HAMDEN.lon, 1)).toEqual({ types: {}, exposure: {} })
  })

  it('never claims Very High — a peak is a measurement to make', () => {
    for (const place of REGIONS) {
      for (let month = 1; month <= 12; month++) {
        for (const [variable, value] of Object.entries(
          calendarPollen(place.lat, place.lon, month).exposure,
        )) {
          expect(value, `${place.region} ${variable} in month ${month}`).toBeLessThanOrEqual(
            PRIORS[variable]?.[3] ?? Infinity,
          )
        }
      }
    }
  })

  it('keeps a low season under the floor that makes a variable a suspect', () => {
    // A "low" month is information, not an accusation: index 1 (Very Low)
    // sits at every negligible floor, so it can never enter a candidate set.
    for (const variable of POLLEN_PLANT_VARIABLES) {
      expect(negligibleFor(variable)).toBeGreaterThanOrEqual(1)
    }
    expect(calendarPollen(HAMDEN.lat, HAMDEN.lon, 10).exposure.pollen_ragweed).toBe(1)
  })

  it('reads the month off a local API timestamp', () => {
    expect(monthOf('2026-08-07T13:00')).toBe(8)
  })
})
