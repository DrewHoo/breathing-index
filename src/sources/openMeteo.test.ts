import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchExposureSeries, pollenForHour } from './openMeteo'
import type { PollenDay } from './googlePollen'

const HAMDEN = { lat: 41.396, lon: -72.897 }

const hoursOf = (day: string): string[] =>
  Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, '0')}:00`)

/** A relay /v1/pollen payload for one date, in Google's own field shapes. */
const pollenPayload = (date: string, weedValue: number) => ({
  dailyInfo: [
    {
      date: {
        year: Number(date.slice(0, 4)),
        month: Number(date.slice(5, 7)),
        day: Number(date.slice(8, 10)),
      },
      pollenTypeInfo: [
        { code: 'WEED', indexInfo: { value: weedValue } },
        { code: 'GRASS' }, // no indexInfo: Google saying "nothing to report"
      ],
      plantInfo: [
        {
          code: 'RAGWEED',
          displayName: 'Ragweed',
          inSeason: true,
          indexInfo: { value: weedValue },
        },
      ],
    },
  ],
})

/**
 * All three endpoints, with only the fields a test cares about. `pollen`
 * null means the relay is down (the fetch rejects) — the calendar's cue.
 */
function stubSources(day: string, pollen: ReturnType<typeof pollenPayload> | null) {
  const time = hoursOf(day)
  const column = (v: number) => time.map(() => v)
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/v1/pollen')) {
      return pollen
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(pollen) })
        : Promise.reject(new Error('relay down'))
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          url.includes('air-quality')
            ? {
                utc_offset_seconds: 0,
                hourly: { time, pm2_5: column(3), ozone: column(10) },
              }
            : { hourly: { time, temperature_2m: column(20), relative_humidity_2m: column(50) } },
        ),
    })
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('measured pollen', () => {
  it("carries the day's index into every hour of that local date", async () => {
    stubSources('2026-08-11', pollenPayload('2026-08-11', 4))
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const noon = series.hours[12]!
    expect(noon.exposure.pollen_ragweed).toBe(4)
    expect(series.hours[23]!.exposure.pollen_ragweed).toBe(4)
    expect(noon.pollenDisplay).toEqual({
      weed: { value: 4, plants: [{ variable: 'pollen_ragweed', name: 'Ragweed', value: 4 }] },
    })
    // Nothing estimated: an entry logged here confirms bounds like any other.
    expect(noon.estimated).toBeUndefined()
  })

  it('leaves a plant Google omitted out of the vector — no data is not zero', async () => {
    stubSources('2026-08-11', pollenPayload('2026-08-11', 4))
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    expect(series.hours[12]!.exposure.pollen_graminales).toBeUndefined()
    expect(series.hours[12]!.exposure.pollen_oak).toBeUndefined()
  })
})

describe('the calendar fallback', () => {
  it('stands in when the relay is down, marked as an estimate', async () => {
    stubSources('2026-08-11', null)
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const noon = series.hours[12]!
    // August in the northeast: ragweed at the calendar's "med", index 3.
    expect(noon.exposure.pollen_ragweed).toBe(3)
    expect(noon.estimated).toEqual(['pollen_ragweed'])
    expect(noon.pollenDisplay).toEqual({
      weed: { value: 3, plants: [{ variable: 'pollen_ragweed', name: 'Ragweed', value: 3 }] },
    })
  })

  it('covers dates before the measured feed begins', () => {
    const measured = new Map<string, PollenDay>([
      [
        '2026-08-11',
        {
          types: { weed: { value: 4, plants: [{ variable: 'pollen_ragweed', name: 'Ragweed', value: 4 }] } },
          exposure: { pollen_ragweed: 4 },
        },
      ],
    ])
    // Yesterday is not in the forecast: the calendar answers, estimated.
    const yesterday = pollenForHour(measured, HAMDEN.lat, HAMDEN.lon, '2026-08-10T09:00')
    expect(yesterday.estimated).toBe(true)
    expect(yesterday.day.exposure.pollen_ragweed).toBe(3)
    const today = pollenForHour(measured, HAMDEN.lat, HAMDEN.lon, '2026-08-11T09:00')
    expect(today).toEqual({ day: measured.get('2026-08-11'), estimated: false })
  })

  it('claims nothing out of season — winter carries no pollen keys at all', async () => {
    stubSources('2026-01-07', null)
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const noon = series.hours[12]!
    expect(noon.exposure.pollen_ragweed).toBeUndefined()
    expect(noon.estimated).toBeUndefined()
  })

  it('claims nothing where no source reaches', async () => {
    stubSources('2026-08-11', null)
    const series = await fetchExposureSeries(-33.87, 151.21) // Sydney
    const noon = series.hours[12]!
    expect(Object.keys(noon.exposure).some((k) => k.startsWith('pollen_'))).toBe(false)
  })
})
