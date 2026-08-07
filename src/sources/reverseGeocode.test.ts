import { afterEach, describe, expect, it, vi } from 'vitest'
import { reverseGeocode } from './reverseGeocode'

/** Stand in for the fields we actually read off the BigDataCloud response. */
const respond = (body: unknown, ok = true) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)),
  )

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('reverseGeocode', () => {
  it('names US places by state, the way people say them', async () => {
    respond({
      city: 'Hamden',
      principalSubdivision: 'Connecticut',
      principalSubdivisionCode: 'US-CT',
      countryCode: 'US',
    })
    expect(await reverseGeocode(41.396, -72.897)).toBe('Hamden, CT')
  })

  it('names places elsewhere by country, since subdivision codes do not travel', async () => {
    respond({
      city: 'Amsterdam',
      principalSubdivision: 'North Holland',
      principalSubdivisionCode: 'NL-NH',
      countryCode: 'NL',
    })
    expect(await reverseGeocode(52.374, 4.89)).toBe('Amsterdam, NL')
  })

  it('falls back through locality and subdivision when there is no city', async () => {
    respond({ locality: 'Hamden Center', principalSubdivisionCode: 'US-CT', countryCode: 'US' })
    expect(await reverseGeocode(41.4, -72.9)).toBe('Hamden Center, CT')

    respond({ principalSubdivision: 'Connecticut', countryCode: 'US' })
    expect(await reverseGeocode(41.5, -72.8)).toBe('Connecticut, US')
  })

  it('returns the bare name when the response has no country', async () => {
    respond({ locality: 'Polynesian Triangle' })
    expect(await reverseGeocode(0, -140)).toBe('Polynesian Triangle')
  })

  it('gives up quietly so the caller keeps its existing label', async () => {
    respond({}, false)
    expect(await reverseGeocode(1, 1)).toBeNull()

    respond({ countryCode: 'US' })
    expect(await reverseGeocode(2, 2)).toBeNull()

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    expect(await reverseGeocode(3, 3)).toBeNull()
  })
})
