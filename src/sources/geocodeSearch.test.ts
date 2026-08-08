import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseGeocodeResults, searchPlaces } from './geocodeSearch'

/** Stand in for the fields we actually read off the Open-Meteo response. */
const respond = (body: unknown, ok = true) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)),
  )

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseGeocodeResults', () => {
  it('names a place by its region and keeps the country for telling Denvers apart', () => {
    expect(
      parseGeocodeResults({
        results: [
          {
            id: 5419384,
            name: 'Denver',
            latitude: 39.73915,
            longitude: -104.9847,
            country: 'United States',
            country_code: 'US',
            admin1: 'Colorado',
            admin2: 'Denver',
            population: 682545,
          },
          {
            id: 4693342,
            name: 'Denver',
            latitude: 33.21789,
            longitude: -97.30612,
            country: 'United States',
            admin1: 'Texas',
          },
        ],
      }),
    ).toEqual([
      { label: 'Denver, Colorado', detail: 'United States', lat: 39.739, lon: -104.985 },
      { label: 'Denver, Texas', detail: 'United States', lat: 33.218, lon: -97.306 },
    ])
  })

  it('falls back to the country when a result has no region', () => {
    expect(
      parseGeocodeResults({
        results: [{ name: 'Singapore', latitude: 1.28967, longitude: 103.85007, country: 'Singapore' }],
      }),
    ).toEqual([{ label: 'Singapore, Singapore', detail: '', lat: 1.29, lon: 103.85 }])
  })

  it('shows the bare name when the response has neither region nor country', () => {
    expect(parseGeocodeResults({ results: [{ name: 'Wake Island', latitude: 19.3, longitude: 166.6 }] })).toEqual(
      [{ label: 'Wake Island', detail: '', lat: 19.3, lon: 166.6 }],
    )
  })

  it('drops results with nothing to point at', () => {
    expect(
      parseGeocodeResults({
        results: [
          { name: 'Nowhere', country: 'Elsewhere' },
          { latitude: 1, longitude: 2, country: 'Elsewhere' },
          { name: 'Somewhere', latitude: 'north', longitude: 2 },
          { name: 'Real', latitude: 1.5, longitude: 2.5 },
        ],
      }),
    ).toEqual([{ label: 'Real', detail: '', lat: 1.5, lon: 2.5 }])
  })

  it('reads a no-match response, which carries no results key at all, as no matches', () => {
    expect(parseGeocodeResults({ generationtime_ms: 0.42 })).toEqual([])
    expect(parseGeocodeResults({ results: null })).toEqual([])
    expect(parseGeocodeResults(null)).toEqual([])
  })
})

describe('searchPlaces', () => {
  it('returns the parsed matches', async () => {
    respond({ results: [{ name: 'Hamden', latitude: 41.3959, longitude: -72.8968, admin1: 'Connecticut', country: 'United States' }] })
    expect(await searchPlaces('hamden')).toEqual([
      { label: 'Hamden, Connecticut', detail: 'United States', lat: 41.396, lon: -72.897 },
    ])
  })

  it('does not go looking on a fragment of a name', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await searchPlaces(' d ')).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('says null when the lookup failed, which is not the same as finding nothing', async () => {
    respond({}, false)
    expect(await searchPlaces('denver')).toBeNull()

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    expect(await searchPlaces('denver')).toBeNull()
  })
})
