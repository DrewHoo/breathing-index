import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSmoke, recallSmokeHours, rememberSmokeHour } from './hmsSmoke'

const HAMDEN = { lat: 41.396, lon: -72.897 }
/** Same coarse cell as Hamden: the store may not be sharper than the relay. */
const NEXT_STREET = { lat: 41.44, lon: -72.86 }
const DENVER = { lat: 39.74, lon: -104.99 }

/** `back` hours before 2026-09-13T22:00Z, as the UTC hour key the series uses. */
const hour = (back: number): string =>
  new Date(Date.parse('2026-09-13T22:00:00Z') - back * 3_600_000).toISOString().slice(0, 16)

/** The tests run in node; this is the whole surface the module touches. */
const store = new Map<string, string>()
const stubStorage = (setItem?: () => never): void => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: setItem ?? ((key: string, value: string) => void store.set(key, value)),
    removeItem: (key: string) => void store.delete(key),
  })
}

beforeEach(() => {
  store.clear()
  stubStorage()
})

afterEach(() => vi.unstubAllGlobals())

describe('the smoke history store', () => {
  it('reads back what a fetch wrote down', () => {
    rememberSmokeHour(HAMDEN.lat, HAMDEN.lon, hour(0), 2)
    expect(recallSmokeHours(HAMDEN.lat, HAMDEN.lon).get(hour(0))).toBe(2)
  })

  it('accumulates hours instead of replacing them — that is the whole point', () => {
    // HMS publishes the latest analysis and nothing behind it, so the trailing
    // hours of the sparkline exist only because earlier fetches filed them.
    rememberSmokeHour(HAMDEN.lat, HAMDEN.lon, hour(2), 1)
    rememberSmokeHour(HAMDEN.lat, HAMDEN.lon, hour(1), 2)
    rememberSmokeHour(HAMDEN.lat, HAMDEN.lon, hour(0), 3)
    const recalled = recallSmokeHours(HAMDEN.lat, HAMDEN.lon)
    expect([...recalled.keys()].sort()).toEqual([hour(2), hour(1), hour(0)])
    expect(recalled.get(hour(1))).toBe(2)
  })

  it('lets a later fetch correct an hour it already held', () => {
    rememberSmokeHour(HAMDEN.lat, HAMDEN.lon, hour(0), 1)
    rememberSmokeHour(HAMDEN.lat, HAMDEN.lon, hour(0), 3)
    expect(recallSmokeHours(HAMDEN.lat, HAMDEN.lon).get(hour(0))).toBe(3)
  })

  it('keeps places apart, at the coarse cell and no finer', () => {
    rememberSmokeHour(HAMDEN.lat, HAMDEN.lon, hour(0), 1)
    rememberSmokeHour(DENVER.lat, DENVER.lon, hour(0), 3)
    expect(recallSmokeHours(NEXT_STREET.lat, NEXT_STREET.lon).get(hour(0))).toBe(1)
    expect(recallSmokeHours(DENVER.lat, DENVER.lon).get(hour(0))).toBe(3)
  })

  it('keeps the newest 48 hours and drops the rest', () => {
    for (let back = 59; back >= 0; back--) rememberSmokeHour(HAMDEN.lat, HAMDEN.lon, hour(back), 1)
    const recalled = recallSmokeHours(HAMDEN.lat, HAMDEN.lon)
    expect(recalled.size).toBe(48)
    expect(recalled.has(hour(47))).toBe(true)
    expect(recalled.has(hour(48))).toBe(false)
  })

  it('keeps four places and forgets the least recently written', () => {
    const places = [HAMDEN, DENVER, { lat: 47.6, lon: -122.3 }, { lat: 34.05, lon: -118.24 }]
    for (const place of places) rememberSmokeHour(place.lat, place.lon, hour(0), 2)
    // A fifth place: home, work and two trips is the cap, and Hamden was first.
    rememberSmokeHour(29.76, -95.37, hour(0), 3)
    expect(recallSmokeHours(HAMDEN.lat, HAMDEN.lon).size).toBe(0)
    expect(recallSmokeHours(DENVER.lat, DENVER.lon).get(hour(0))).toBe(2)
    expect(recallSmokeHours(29.76, -95.37).get(hour(0))).toBe(3)
  })

  it('survives storage that throws, and answers empty', () => {
    // Private mode, or a full quota shared with the diary — which is the one
    // thing in localStorage that cannot be re-fetched.
    stubStorage(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => rememberSmokeHour(HAMDEN.lat, HAMDEN.lon, hour(0), 2)).not.toThrow()
    expect(recallSmokeHours(HAMDEN.lat, HAMDEN.lon).size).toBe(0)
  })

  it('answers empty on a stored shape it does not recognise', () => {
    store.set('breathing-index.smokeHistory.v1', '{"not":"an array"}')
    expect(recallSmokeHours(HAMDEN.lat, HAMDEN.lon).size).toBe(0)
    // And a write over it still works rather than inheriting the nonsense.
    rememberSmokeHour(HAMDEN.lat, HAMDEN.lon, hour(0), 1)
    expect(recallSmokeHours(HAMDEN.lat, HAMDEN.lon).get(hour(0))).toBe(1)
  })
})

describe('fetching the smoke answer', () => {
  it('passes the relay answer through, coarse coordinates only', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      seen.push(url)
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            density: 2,
            start: '2026-09-13T12:00:00.000Z',
            end: '2026-09-13T15:00:00.000Z',
            fetched: '2026-09-14T05:07:45.126Z',
          }),
      })
    })
    expect(await fetchSmoke(HAMDEN.lat, HAMDEN.lon)).toEqual({
      density: 2,
      start: '2026-09-13T12:00:00.000Z',
      end: '2026-09-13T15:00:00.000Z',
      fetched: '2026-09-14T05:07:45.126Z',
    })
    expect(seen[0]).toContain('lat=41.4&lon=-72.9')
  })

  it('answers null rather than throwing into the series', async () => {
    for (const stub of [
      () => Promise.resolve({ ok: false, status: 502, json: () => Promise.resolve({}) }),
      () => Promise.reject(new Error('offline')),
      // A body that is not the shape this file expects is the same as no body:
      // a smoke answer is one column and must never take the screen down.
      () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ oops: 1 }) }),
    ]) {
      vi.stubGlobal('fetch', stub)
      expect(await fetchSmoke(HAMDEN.lat, HAMDEN.lon)).toBeNull()
    }
  })
})
