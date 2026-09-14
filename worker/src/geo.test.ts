import { describe, expect, it } from 'vitest'
import { hmsInstant, pointInPolygon, smokeAt } from './geo'

/** A ring, written as [lon, lat] pairs the way GeoJSON writes them. */
const square = (west: number, south: number, east: number, north: number): number[][] => [
  [west, south],
  [east, south],
  [east, north],
  [west, north],
  [west, south],
]

/** HMS's own property spelling, with density as the published code. */
const plume = (
  code: number,
  coordinates: unknown,
  type: 'Polygon' | 'MultiPolygon' = 'Polygon',
  stamps: { Start: string; End: string } = { Start: '2026256 1200', End: '2026256 1500' },
) => ({
  type: 'Feature',
  properties: { Satellite: 'GOES-WEST', Density: code, ...stamps },
  geometry: { type, coordinates },
})

const collection = (...features: unknown[]) => ({ type: 'FeatureCollection', features })

/** Light / Medium / Heavy, as the live file codes them. */
const LIGHT = 5
const MEDIUM = 16
const HEAVY = 21

describe('point in polygon', () => {
  const ring = square(-10, 30, 0, 40)

  it('answers for a point inside and a point outside', () => {
    expect(pointInPolygon(-5, 35, [ring])).toBe(true)
    expect(pointInPolygon(5, 35, [ring])).toBe(false)
    expect(pointInPolygon(-5, 45, [ring])).toBe(false)
  })

  it('takes the answer back inside a hole', () => {
    // Rings after the first are holes: a plume drawn around a clear eye.
    const withHole = [ring, square(-7, 33, -3, 37)]
    expect(pointInPolygon(-5, 35, withHole)).toBe(false)
    expect(pointInPolygon(-8, 35, withHole)).toBe(true)
  })
})

describe('the HMS timestamp', () => {
  it('reads YYYYDDD HHMM as a UTC instant', () => {
    // Day 256 of a non-leap year is 13 September.
    expect(hmsInstant('2026256 1200')).toBe('2026-09-13T12:00:00.000Z')
    expect(hmsInstant('2026001 0000')).toBe('2026-01-01T00:00:00.000Z')
    expect(hmsInstant('2024366 2359')).toBe('2024-12-31T23:59:00.000Z')
  })

  it('refuses anything that is not that shape', () => {
    // The client prints this to a person as "as of 8 am"; half a stamp is
    // worse than none.
    for (const bad of ['', '2026-09-13T12:00', '2026256', '20262561200', '2026400 1200', 12])
      expect(hmsInstant(bad)).toBeNull()
  })
})

describe('the smoke answer', () => {
  it('is 0 where no plume reaches, and carries no window with it', () => {
    const file = collection(plume(HEAVY, [square(-100, 30, -95, 35)]))
    expect(smokeAt(file, 41.4, -72.9)).toEqual({ density: 0, start: null, end: null })
  })

  it('maps the published code and carries that plume’s own window', () => {
    const file = collection(plume(MEDIUM, [square(-90, 40, -80, 45)]))
    expect(smokeAt(file, 41.9, -87.6)).toEqual({
      density: 2,
      start: '2026-09-13T12:00:00.000Z',
      end: '2026-09-13T15:00:00.000Z',
    })
  })

  it('takes the worst of overlapping plumes, window and all', () => {
    // Chicago sat under two Light polygons on 2026-09-13; a Heavy one arriving
    // later in the list has to win, and bring its own hours.
    const file = collection(
      plume(LIGHT, [square(-90, 40, -80, 45)]),
      plume(HEAVY, [square(-88, 41, -86, 43)], 'Polygon', {
        Start: '2026256 2010',
        End: '2026256 2330',
      }),
      plume(LIGHT, [square(-89, 41, -85, 44)]),
    )
    expect(smokeAt(file, 41.9, -87.6)).toEqual({
      density: 3,
      start: '2026-09-13T20:10:00.000Z',
      end: '2026-09-13T23:30:00.000Z',
    })
  })

  it('reads a MultiPolygon plume', () => {
    const file = collection(
      plume(MEDIUM, [[square(-120, 30, -110, 40)], [square(-90, 40, -80, 45)]], 'MultiPolygon'),
    )
    expect(smokeAt(file, 35, -115).density).toBe(2)
    expect(smokeAt(file, 41.9, -87.6).density).toBe(2)
    expect(smokeAt(file, 41.4, -72.9).density).toBe(0)
  })

  it('ignores a density code nobody published', () => {
    // The three codes are labels, not a scale. A fourth number is a plume this
    // route has no business ranking.
    const file = collection(plume(99, [square(-90, 40, -80, 45)]))
    expect(smokeAt(file, 41.9, -87.6).density).toBe(0)
  })

  it('says stale rather than throwing when the file is not a file', () => {
    const stale = { density: 0, start: null, end: null, stale: true }
    expect(smokeAt(null, 41.9, -87.6)).toEqual(stale)
    expect(smokeAt({ features: [] }, 41.9, -87.6)).toEqual(stale)
    expect(smokeAt('<html>nope</html>', 41.9, -87.6)).toEqual(stale)
  })
})
