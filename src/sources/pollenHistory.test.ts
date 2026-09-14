import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PollenDay } from './googlePollen'
import { recallPollenDays, rememberPollenDays } from './pollenHistory'

const HAMDEN = { lat: 41.396, lon: -72.897 }
/** Same coarse cell as Hamden: the store may not be sharper than the relay. */
const NEXT_STREET = { lat: 41.44, lon: -72.86 }
const DENVER = { lat: 39.74, lon: -104.99 }

const day = (value: number): PollenDay => ({
  types: {
    grass: { value, plants: [{ variable: 'pollen_graminales', name: 'Grasses', value }] },
  },
  exposure: { pollen_graminales: value },
})

/** `days` back from 2026-09-20, as a local date key; a negative is ahead. */
const date = (back: number): string =>
  new Date(Date.parse('2026-09-20T00:00:00Z') - back * 86_400_000).toISOString().slice(0, 10)

/** The tests run in node; this is the whole surface the module touches. */
const store = new Map<string, string>()
const stubStorage = (): void => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
}

beforeEach(() => {
  store.clear()
  stubStorage()
})

describe('the pollen history store', () => {
  it('reads back what a fetch wrote down', () => {
    rememberPollenDays(HAMDEN.lat, HAMDEN.lon, new Map([[date(0), day(4)]]), date(0))
    expect(recallPollenDays(HAMDEN.lat, HAMDEN.lon).get(date(0))).toEqual(day(4))
  })

  it('files the days it read and refuses the ones it was shown ahead', () => {
    // The relay's endpoint is a forecast lookup: today comes back with several
    // days after it. Remembering those would have Thursday's grass window
    // grading a person on Monday's guess about Tuesday.
    rememberPollenDays(
      HAMDEN.lat,
      HAMDEN.lon,
      new Map([
        [date(1), day(2)],
        [date(0), day(3)],
        [date(-1), day(5)],
        [date(-2), day(5)],
      ]),
      date(0),
    )
    const recalled = recallPollenDays(HAMDEN.lat, HAMDEN.lon)
    expect([...recalled.keys()].sort()).toEqual([date(1), date(0)])
    // Tomorrow is written tomorrow, when it is a reading.
    rememberPollenDays(HAMDEN.lat, HAMDEN.lon, new Map([[date(-1), day(1)]]), date(-1))
    expect(recallPollenDays(HAMDEN.lat, HAMDEN.lon).get(date(-1))).toEqual(day(1))
  })

  it('accumulates days instead of replacing them — that is the whole point', () => {
    rememberPollenDays(HAMDEN.lat, HAMDEN.lon, new Map([[date(2), day(4)]]), date(2))
    rememberPollenDays(HAMDEN.lat, HAMDEN.lon, new Map([[date(1), day(1)]]), date(1))
    rememberPollenDays(HAMDEN.lat, HAMDEN.lon, new Map([[date(0), day(2)]]), date(0))
    const recalled = recallPollenDays(HAMDEN.lat, HAMDEN.lon)
    expect([...recalled.keys()].sort()).toEqual([date(2), date(1), date(0)])
  })

  it('lets a later fetch correct a day it already held', () => {
    // Two fetches on the same day: the app opened at breakfast and again at
    // dusk, and the source had revised the index in between.
    rememberPollenDays(HAMDEN.lat, HAMDEN.lon, new Map([[date(0), day(2)]]), date(0))
    rememberPollenDays(HAMDEN.lat, HAMDEN.lon, new Map([[date(0), day(5)]]), date(0))
    expect(recallPollenDays(HAMDEN.lat, HAMDEN.lon).get(date(0))).toEqual(day(5))
  })

  it('keeps places apart, at the coarse cell and no finer', () => {
    rememberPollenDays(HAMDEN.lat, HAMDEN.lon, new Map([[date(0), day(4)]]), date(0))
    rememberPollenDays(DENVER.lat, DENVER.lon, new Map([[date(0), day(1)]]), date(0))
    expect(recallPollenDays(HAMDEN.lat, HAMDEN.lon).get(date(0))).toEqual(day(4))
    expect(recallPollenDays(DENVER.lat, DENVER.lon).get(date(0))).toEqual(day(1))
    // Geolocation jitter is not a new place: the relay is never told, and this
    // is not told either.
    expect(recallPollenDays(NEXT_STREET.lat, NEXT_STREET.lon).get(date(0))).toEqual(day(4))
  })

  it('caps a cell at fourteen days, oldest out', () => {
    for (let back = 20; back >= 0; back--) {
      rememberPollenDays(HAMDEN.lat, HAMDEN.lon, new Map([[date(back), day(1)]]), date(back))
    }
    const recalled = recallPollenDays(HAMDEN.lat, HAMDEN.lon)
    expect(recalled.size).toBe(14)
    // A window looks backwards from today, so the oldest date is always the
    // first thing that stops mattering.
    expect(recalled.has(date(13))).toBe(true)
    expect(recalled.has(date(14))).toBe(false)
  })

  it('caps the places it remembers, least recently written out', () => {
    const cells = [
      { lat: 41.4, lon: -72.9 },
      { lat: 42.4, lon: -71.1 },
      { lat: 40.7, lon: -74 },
      { lat: 38.9, lon: -77 },
      { lat: 37.8, lon: -122.4 },
    ]
    for (const cell of cells) {
      rememberPollenDays(cell.lat, cell.lon, new Map([[date(0), day(3)]]), date(0))
    }
    expect(recallPollenDays(cells[0]!.lat, cells[0]!.lon).size).toBe(0)
    expect(recallPollenDays(cells[4]!.lat, cells[4]!.lon).size).toBe(1)
  })

  it('writes nothing when there is nothing to write', () => {
    rememberPollenDays(HAMDEN.lat, HAMDEN.lon, new Map(), date(0))
    expect(store.size).toBe(0)
  })

  it('survives storage that refuses to answer', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('denied')
      },
      setItem: () => {
        throw new DOMException('quota')
      },
      removeItem: () => undefined,
    })
    // Private mode, a full quota, a browser with site data blocked: pollen
    // history is a convenience, and the calendar answers for the days it
    // cannot remember.
    expect(() =>
      rememberPollenDays(HAMDEN.lat, HAMDEN.lon, new Map([[date(0), day(4)]]), date(0)),
    ).not.toThrow()
    expect(recallPollenDays(HAMDEN.lat, HAMDEN.lon).size).toBe(0)
  })

  it('ignores a stored value it did not write', () => {
    store.set('breathing-index.pollenHistory.v1', '{"cell":"41.4,-72.9"}')
    expect(recallPollenDays(HAMDEN.lat, HAMDEN.lon).size).toBe(0)
    // And a write over the junk still lands.
    rememberPollenDays(HAMDEN.lat, HAMDEN.lon, new Map([[date(0), day(4)]]), date(0))
    expect(recallPollenDays(HAMDEN.lat, HAMDEN.lon).get(date(0))).toEqual(day(4))
  })
})
