import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchExposureSeries, summarizePollen } from './openMeteo'

const AMSTERDAM = { lat: 52.37, lon: 4.9 }
const HAMDEN = { lat: 41.396, lon: -72.897 }

const hoursOf = (day: string): string[] =>
  Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, '0')}:00`)

/**
 * Both endpoints, with only the fields a test cares about. Everything else is
 * absent, which the parser reads as zero.
 */
function stubOpenMeteo(day: string, pollen: (number | null)[] | null) {
  const time = hoursOf(day)
  const column = (v: number) => time.map(() => v)
  vi.stubGlobal('fetch', (url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          url.includes('air-quality')
            ? {
                utc_offset_seconds: 0,
                hourly: {
                  time,
                  pm2_5: column(3),
                  ozone: column(10),
                  grass_pollen: pollen ?? time.map(() => null),
                  birch_pollen: pollen ? column(0) : time.map(() => null),
                  ragweed_pollen: pollen ? column(0) : time.map(() => null),
                },
              }
            : { hourly: { time, temperature_2m: column(20), relative_humidity_2m: column(50) } },
        ),
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('where CAMS measures pollen', () => {
  it('carries the species into every hour of the series', async () => {
    stubOpenMeteo('2026-08-07', hoursOf('x').map((_, h) => (h === 12 ? 14 : 2)))
    const series = await fetchExposureSeries(AMSTERDAM.lat, AMSTERDAM.lon)
    const noon = series.hours[12]!
    // max(now, max8h), the same window the acute pollutants take.
    expect(noon.exposure.grass_pollen).toBe(14)
    expect(series.hours[19]!.exposure.grass_pollen).toBe(14)
    expect(series.hours[20]!.exposure.grass_pollen).toBe(2)
    expect(noon.pollen).toEqual({ variable: 'grass_pollen', value: 14, estimated: false })
    // Nothing estimated: an entry logged here confirms bounds like any other.
    expect(noon.estimated).toBeUndefined()
  })
})

describe('where it does not', () => {
  it('falls back to the calendar season, marked as an estimate', async () => {
    stubOpenMeteo('2026-08-07', null)
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const noon = series.hours[12]!
    expect(noon.exposure.ragweed_pollen).toBe(10)
    expect(noon.estimated).toEqual(['ragweed_pollen'])
    expect(noon.pollen).toEqual({ variable: 'ragweed_pollen', value: 10, estimated: true })
  })

  it('leaves the row negligible out of season', async () => {
    stubOpenMeteo('2026-01-07', null)
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const noon = series.hours[12]!
    expect(noon.pollen).toEqual({ variable: null, value: 0, estimated: true })
    expect(noon.exposure.ragweed_pollen).toBeUndefined()
    expect(noon.estimated).toBeUndefined()
  })

  it('shows no pollen row where neither source reaches', async () => {
    stubOpenMeteo('2026-08-07', null)
    const series = await fetchExposureSeries(-33.87, 151.21) // Sydney
    expect(series.hours[12]!.pollen).toBeNull()
  })
})

describe('the pollen row', () => {
  it('names the dominant species and says when it was measured', () => {
    expect(summarizePollen({ grass_pollen: 40, birch_pollen: 2 }, false, true)).toEqual({
      variable: 'grass_pollen',
      value: 40,
      estimated: false,
    })
  })

  it('carries the estimate flag when the calendar supplied the number', () => {
    expect(summarizePollen({ ragweed_pollen: 10 }, true, true)).toEqual({
      variable: 'ragweed_pollen',
      value: 10,
      estimated: true,
    })
  })

  it('names no species out of season — the row reads as negligible', () => {
    expect(summarizePollen({}, true, true)).toEqual({
      variable: null,
      value: 0,
      estimated: true,
    })
  })

  it('has no row at all where no source covers the place', () => {
    // No data is not the same as no pollen, so the table stays silent.
    expect(summarizePollen({}, true, false)).toBeNull()
  })
})
