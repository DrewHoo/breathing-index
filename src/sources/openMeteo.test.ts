import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AIRNOW_SOURCE, EXPOSURE_SOURCE, fetchExposureSeries, pollenForHour } from './openMeteo'
import type { AirNowRow } from './airnow'
import type { PollenDay } from './googlePollen'
import { recallPollenDays, rememberPollenDays } from './pollenHistory'
import { recallSmokeHours, rememberSmokeHour } from './hmsSmoke'
import { POLLEN_PLANTS } from './pollenPlants'

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

interface Stubs {
  /** relay /v1/airnow rows; absent means the relay answers 404 */
  airnow?: AirNowRow[]
  /** relay /v1/smoke answer; absent means the relay answers 502 */
  smoke?: { density: 0 | 1 | 2 | 3; start?: string | null; end?: string | null }
  utcOffsetSeconds?: number
  /** model columns by Open-Meteo's own key, for the window tests */
  air?: Record<string, (number | null)[]>
  /** weather columns by Open-Meteo's own key — dew point is the only one read */
  weather?: Record<string, (number | null)[]>
}

/**
 * Every endpoint a series touches, with only the fields a test cares about.
 * `pollen` null means the relay is down (the fetch rejects) — the calendar's
 * cue — and an absent `smoke` stub is the same thing for the smoke route.
 */
function stubSources(day: string, pollen: { dailyInfo: unknown[] } | null, stubs: Stubs = {}) {
  const time = hoursOf(day)
  const column = (v: number) => time.map(() => v)
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('/v1/pollen')) {
      return pollen
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(pollen) })
        : Promise.reject(new Error('relay down'))
    }
    if (url.includes('/v1/smoke')) {
      return Promise.resolve(
        stubs.smoke
          ? {
              ok: true,
              status: 200,
              json: () => Promise.resolve({ start: null, end: null, ...stubs.smoke }),
            }
          : { ok: false, status: 502, json: () => Promise.resolve({}) },
      )
    }
    if (url.includes('/v1/airnow')) {
      return Promise.resolve(
        stubs.airnow
          ? {
              ok: true,
              status: 200,
              json: () => Promise.resolve({ observations: stubs.airnow, forecast: [] }),
            }
          : { ok: false, status: 404, json: () => Promise.resolve({}) },
      )
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(
          url.includes('air-quality')
            ? {
                utc_offset_seconds: stubs.utcOffsetSeconds ?? 0,
                hourly: {
                  time,
                  pm2_5: column(3),
                  ozone: column(10),
                  nitrogen_dioxide: column(8),
                  ...stubs.air,
                },
              }
            : {
                hourly: {
                  time,
                  // A 14 °C dew point: between the two thresholds, so neither
                  // weather feature fires anywhere the test is not asking.
                  dew_point_2m: column(14),
                  ...stubs.weather,
                },
              },
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

/* --- AirNow as the exposure source --- */

const NEW_HAVEN = { lat: 41.301288, lon: -72.902685 }

/**
 * One monitor's hourly rows, UTC, ending at `throughUtcHour` on 2026-09-13.
 * `raw` may be a function of the UTC hour, for the tests that need a window
 * whose mean is a different number from every hour inside it.
 */
function monitorRows(
  parameter: 'PM2.5' | 'PM10' | 'OZONE',
  raw: number | ((utcHour: number) => number),
  fromUtcHour: number,
  throughUtcHour: number,
  skipUtcHour?: number,
): AirNowRow[] {
  const rows: AirNowRow[] = []
  for (let h = fromUtcHour; h <= throughUtcHour; h++) {
    if (h === skipUtcHour) continue
    const value = typeof raw === 'function' ? raw(h) : raw
    rows.push({
      Latitude: NEW_HAVEN.lat,
      Longitude: NEW_HAVEN.lon,
      UTC: `2026-09-13T${String(h).padStart(2, '0')}:00`,
      Parameter: parameter,
      Unit: parameter === 'OZONE' ? 'PPB' : 'UG/M3',
      Value: value,
      RawConcentration: value,
      AQI: 30,
      Category: 1,
      SiteName: 'New Haven',
    })
  }
  return rows
}

/**
 * Local noon in Hamden is 16:00 UTC in September. Open-Meteo serves local hour
 * strings, AirNow serves UTC, and the offset is the only thing that lines the
 * two up — which is why it is worth a test of its own.
 */
const EDT_OFFSET = -4 * 3600

/**
 * µg/m³ per ppb of ozone at the EPA's reference conditions — the constant
 * `airnow.ts` converts with. Spelled out here rather than imported because a
 * test that reuses the module's own constant cannot catch it changing.
 */
const UG_M3_PER_PPB_O3 = 1.96

/** The mean of a window, for tests that compute their expectation from the fixture. */
const meanOf = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length

describe('AirNow as the exposure source', () => {
  afterEach(() => vi.useRealTimers())

  const stubHamden = (airnow?: AirNowRow[], air?: Record<string, (number | null)[]>) => {
    vi.useFakeTimers()
    // 14:00 local on the 13th, so hours 0–14 are past and 15–23 are forecast.
    vi.setSystemTime(new Date('2026-09-13T18:00:00Z'))
    stubSources('2026-09-13', null, {
      airnow,
      utcOffsetSeconds: EDT_OFFSET,
      ...(air ? { air } : {}),
    })
  }

  /** Monitors covering pm2.5 and ozone: 00:00–14:00 local, one pm2.5 gap. */
  const covering = (): AirNowRow[] => [
    ...monitorRows('PM2.5', 12, 4, 18, 17),
    ...monitorRows('OZONE', 30, 4, 18),
    ...monitorRows('PM10', 20, 4, 18),
  ]

  it('runs the series off the monitors when they cover pm2.5 and ozone', async () => {
    stubHamden(covering())
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon, { airnow: true })
    const now = series.hours[series.currentIndex]!

    expect(series.source).toBe(AIRNOW_SOURCE)
    expect(series.siteNames).toEqual({ pm25: 'New Haven', o3: 'New Haven', pm10: 'New Haven' })
    expect(now.raw.pm25).toBe(12)
    // 30 PPB at the EPA's reference conditions, the same 1.96 the breakpoints use.
    expect(now.raw.o3).toBeCloseTo(58.8, 6)
    expect(now.exposure.pm25).toBe(12)
    expect(now.exposure.o3).toBeCloseTo(58.8, 6)
  })

  it('lines AirNow’s UTC hours up with Open-Meteo’s local ones', async () => {
    stubHamden(covering())
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon, { airnow: true })
    // Local 00:00 is 04:00 UTC, the first monitored hour; 23:00 the day before
    // is outside the window and has no reading at all.
    expect(series.hours[0]!.time).toBe('2026-09-13T00:00')
    expect(series.hours[0]!.raw.pm25).toBe(12)
    expect(series.currentIndex).toBe(14)
    // The one gap: 17:00 UTC is 13:00 local. Absent, never zero — the 8-hour
    // window spans it, so the vector still has a number.
    expect(series.hours[13]!.raw.pm25).toBeUndefined()
    expect(series.hours[13]!.exposure.pm25).toBe(12)
  })

  it('still resolves to the monitors on pm2.5 and ozone alone', async () => {
    stubHamden(covering())
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon, { airnow: true })
    const now = series.hours[series.currentIndex]!
    // The bar is unchanged by the vector diet: pm2.5 and ozone are what a
    // station series has to carry, and PM10 rides along as display only.
    expect(series.source).toBe(AIRNOW_SOURCE)
    expect(now.exposure.pm25).toBe(12)
    expect(now.exposure.o3).toBeCloseTo(58.8, 6)
    expect(now.display?.pm10).toBe(20)
    expect(now.exposure.pm10).toBeUndefined()
  })

  it('fills the hours after now from the model, and says so', async () => {
    stubHamden(covering())
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon, { airnow: true })
    const forecast = series.hours[18]!
    expect(forecast.forecastSource).toBe('cams')
    expect(forecast.raw.pm25).toBe(3) // the model column
    expect(series.hours[series.currentIndex]!.forecastSource).toBeUndefined()
  })

  // The ozone row shows one number and grades the same one: the trailing
  // 8-hour mean of whichever source the series runs on (specs/27-one-ozone.md).
  // Both halves are asserted against a ramp, because a flat fixture makes
  // "the mean of the last eight" and "the reading at 2 pm" the same number, and
  // a test that cannot tell those apart would pass on any window at all.
  it('means the monitor’s own last eight hours on a station series', async () => {
    const ozone = monitorRows('OZONE', (utcHour) => utcHour, 4, 18)
    stubHamden([...monitorRows('PM2.5', 12, 4, 18), ...ozone, ...monitorRows('PM10', 20, 4, 18)])
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon, { airnow: true })

    // Local 14:00 is 18:00 UTC, so the window is the last eight rows the
    // monitor filed. Computed from the fixture: a hardcoded number would
    // survive the window silently becoming something else.
    expect(series.source).toBe(AIRNOW_SOURCE)
    const last8 = ozone.slice(-8).map((r) => r.RawConcentration * UG_M3_PER_PPB_O3)
    expect(last8).toHaveLength(8)
    const now = series.hours[series.currentIndex]!
    expect(now.exposure.o3).toBeCloseTo(meanOf(last8), 6)
    // And it is not the hour's own reading, which is the confusion this ends.
    expect(now.raw.o3).toBeCloseTo(18 * UG_M3_PER_PPB_O3, 6)
    expect(now.exposure.o3).not.toBeCloseTo(now.raw.o3!, 6)
  })

  it('means the model’s own last eight hours when no monitor is in play', async () => {
    const ozone = Array.from({ length: 24 }, (_, h) => 10 + h * 7)
    stubHamden(undefined, { ozone })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon, { airnow: true })

    expect(series.source).toBe(EXPOSURE_SOURCE)
    const ci = series.currentIndex
    const last8 = ozone.slice(ci - 7, ci + 1)
    expect(last8).toHaveLength(8)
    expect(series.hours[ci]!.exposure.o3).toBeCloseTo(meanOf(last8), 6)
  })

  it('falls back to the model when no monitor reports ozone', async () => {
    stubHamden(monitorRows('PM2.5', 12, 4, 18))
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon, { airnow: true })
    expect(series.source).toBe(EXPOSURE_SOURCE)
    expect(series.siteNames).toBeUndefined()
    expect(series.hours[series.currentIndex]!.raw.pm25).toBe(3)
  })

  it('never asks AirNow unless the caller wants it', async () => {
    stubHamden(covering())
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    expect(series.source).toBe(EXPOSURE_SOURCE)
  })

  it('does not ask AirNow about a place it does not measure', async () => {
    stubHamden(covering())
    const series = await fetchExposureSeries(52.37, 4.9, { airnow: true }) // Amsterdam
    expect(series.source).toBe(EXPOSURE_SOURCE)
  })
})

/* --- one window per mechanism (specs/22-exposure-windows.md) --- */

const ramp = (step: number): number[] => Array.from({ length: 24 }, (_, h) => h * step)

describe('exposure windows', () => {
  it('grades ozone on the trailing 8-hour mean, not the worst hour in it', async () => {
    stubSources('2026-09-13', null, { air: { ozone: ramp(10) } })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    // Hours 05:00–12:00 are 50…120 µg/m³: mean 85, max 120. The breakpoints
    // this is compared against are 8-hour means, so 85 is the honest number.
    expect(series.hours[12]!.exposure.o3).toBeCloseTo(85, 6)
    expect(series.hours[12]!.raw.o3).toBe(120)
  })

  it('grades particles on the trailing 24-hour mean', async () => {
    stubSources('2026-09-13', null, { air: { pm2_5: ramp(1), pm10: ramp(2) } })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const last = series.hours[23]!
    expect(last.exposure.pm25).toBeCloseTo(11.5, 6) // 0…23
    expect(last.raw.pm25).toBe(23)
  })

  it('gives PM10 the same window and keeps it out of the vector', async () => {
    stubSources('2026-09-13', null, { air: { pm2_5: ramp(1), pm10: ramp(2) } })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const last = series.hours[23]!
    // Display only (specs/24-vector-diet.md), and still a 24-hour mean: the
    // row shows the same span the graded row beside it does.
    expect(last.exposure.pm10).toBeUndefined()
    expect(last.display?.pm10).toBeCloseTo(23, 6) // 0…46
    // The fingerprint and the sparkline read the hour itself, so raw stays.
    expect(last.raw.pm10).toBe(46)
  })

  it('leaves PM10 out of a bad day’s candidate set by never putting it in', async () => {
    // The spec's acceptance case — pm25 20, pm10 30, o3 5 — is a
    // feature-extraction fact now rather than an engine one: an entry logged
    // in this air has no `pm10` for a candidate set to contain.
    stubSources('2026-09-13', null, {
      air: { pm2_5: Array(24).fill(20), pm10: Array(24).fill(30), ozone: Array(24).fill(5) },
    })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const noon = series.hours[12]!
    expect(noon.exposure.pm25).toBe(20)
    expect(noon.exposure.o3).toBe(5)
    expect(Object.keys(noon.exposure)).not.toContain('pm10')
    expect(noon.display?.pm10).toBe(30)
  })

  it('averages a partial window over the hours it holds', async () => {
    const gappy = Array.from({ length: 24 }, (_, h): number | null =>
      h === 2 ? 48 : h === 3 ? 52 : null,
    )
    stubSources('2026-09-13', null, { air: { pm2_5: gappy } })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    // Two readings in the window, not two readings over twenty-four hours:
    // dividing by the hours nobody measured would report air cleaner than
    // anyone breathed.
    expect(series.hours[5]!.exposure.pm25).toBeCloseTo(50, 6)
    expect(series.hours[5]!.raw.pm25).toBeUndefined()
  })

  it('leaves an empty window absent, never zero', async () => {
    const missing = Array.from({ length: 24 }, () => null)
    stubSources('2026-09-13', null, { air: { ozone: missing, pm2_5: missing } })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const noon = series.hours[12]!
    // A gap recorded as 0 would drop the variable under its background floor
    // and quietly disqualify the real trigger from suspicion.
    expect(noon.exposure.o3).toBeUndefined()
    expect(noon.exposure.pm25).toBeUndefined()
    expect(noon.raw.o3).toBeUndefined()
  })

  it('renames the source, because a window change is a source change', async () => {
    stubSources('2026-09-13', null)
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    // The literal matters: every bound learned under `cams` was learned about
    // an 8-hour max, and the engine retires those by name.
    expect(series.source).toBe('cams-w2')
  })

  it('leaves NO₂ out of the series entirely, column and all', async () => {
    const asked: string[] = []
    stubSources('2026-09-13', null, { air: { nitrogen_dioxide: ramp(2) } })
    const inner = globalThis.fetch as unknown as (url: string) => Promise<unknown>
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url)
      return inner(url)
    })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const hour = series.hours[7]!
    // Not graded, not displayed, not even requested (specs/24-vector-diet.md):
    // clinically marginal in controlled exposure, no dose-response between 100
    // and 600 ppb, and sub-kilometer gradients that a 45 km CAMS cell reads as
    // noise. The stub still serves the column; nothing reads it.
    expect(hour.exposure.no2).toBeUndefined()
    expect(hour.raw.no2).toBeUndefined()
    expect(asked.some((url) => url.includes('nitrogen_dioxide'))).toBe(false)
  })
})

/* --- dew point, both sides (specs/23-dew-point-air.md) --- */

describe('dry air and humid heat', () => {
  it('counts dry air down from an 11 °C dew point', async () => {
    // A 20 °C April day at a 5 °C dew point: air drier than most of January,
    // which the retired T < 10 °C gate read as nothing at all.
    stubSources('2026-04-14', null, { weather: { dew_point_2m: Array(24).fill(5) } })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const noon = series.hours[12]!
    expect(noon.exposure.dry_air).toBe(6)
    expect(noon.exposure.humid_heat).toBe(0)
    expect(noon.raw.dewpoint).toBe(5)
  })

  it('counts humid heat up from an 18 °C dew point', async () => {
    // 22 °C of dew point only happens in hot air, so one number carries both.
    stubSources('2026-07-20', null, { weather: { dew_point_2m: Array(24).fill(22) } })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const noon = series.hours[12]!
    expect(noon.exposure.dry_air).toBe(0)
    expect(noon.exposure.humid_heat).toBe(4)
  })

  it('leaves both absent when the dew point is, never zero', async () => {
    stubSources('2026-07-20', null, { weather: { dew_point_2m: Array(24).fill(null) } })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const noon = series.hours[12]!
    // Zero here would be a comfortable day the feed never reported, and it
    // would sit under both background floors and disqualify the real trigger.
    expect(noon.exposure.dry_air).toBeUndefined()
    expect(noon.exposure.humid_heat).toBeUndefined()
    expect(noon.raw.dewpoint).toBeUndefined()
  })

  it('no longer carries relative humidity as an exposure variable', async () => {
    stubSources('2026-07-20', null)
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    // It pooled at OR 1.05 on its own and pointed the wrong way as an outdoor
    // mould proxy — Alternaria and Cladosporium are dry-weather spores.
    expect(series.hours[12]!.exposure.humidity).toBeUndefined()
    expect(series.hours[12]!.raw.humidity).toBeUndefined()
  })
})

/* --- grass over three days --- */

/** A relay /v1/pollen payload of grass-only days: local date -> index. */
const grassPayload = (byDate: Record<string, number>) => ({
  dailyInfo: Object.entries(byDate).map(([date, value]) => ({
    date: {
      year: Number(date.slice(0, 4)),
      month: Number(date.slice(5, 7)),
      day: Number(date.slice(8, 10)),
    },
    pollenTypeInfo: [{ code: 'GRASS', indexInfo: { value } }],
    plantInfo: [{ code: 'GRAMINALES', displayName: 'Grasses', indexInfo: { value } }],
  })),
})

/** One day as the history store holds it. */
const storedDay = (
  code: 'GRAMINALES' | 'RAGWEED' | 'OAK',
  type: 'grass' | 'weed' | 'tree',
  value: number,
): PollenDay => {
  const plant = POLLEN_PLANTS[code]!
  return {
    types: { [type]: { value, plants: [{ variable: plant.variable, name: plant.name, value }] } },
    exposure: { [plant.variable]: value },
  }
}

describe('grass pollen over the trailing three days', () => {
  const store = new Map<string, string>()
  afterEach(() => vi.useRealTimers())
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    })
  })

  it('still grades today at a spike two days back', async () => {
    rememberPollenDays(
      HAMDEN.lat,
      HAMDEN.lon,
      new Map([['2026-09-11', storedDay('GRAMINALES', 'grass', 4)]]),
      '2026-09-11',
    )
    stubSources('2026-09-13', grassPayload({ '2026-09-13': 1 }))
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const noon = series.hours[12]!
    // Erbas 2018: the effect is cumulative, IRR 1.46 at a 3-day lag. Today's
    // quiet index is not the exposure this person is carrying.
    expect(noon.exposure.pollen_graminales).toBe(4)
    // The row shows what the engine grades, so the display moves with it…
    expect(noon.pollenDisplay?.grass?.value).toBe(4)
    // …while raw keeps the day's own reading: the sparkline is a record of
    // what was read, hour by hour.
    expect(noon.raw.pollen_graminales).toBe(1)
    // Two measured days, nothing guessed: this can still confirm a bound.
    expect(noon.estimated).toBeUndefined()
  })

  it('drops the spike out of the window on the fourth day', async () => {
    rememberPollenDays(
      HAMDEN.lat,
      HAMDEN.lon,
      new Map([['2026-09-11', storedDay('GRAMINALES', 'grass', 4)]]),
      '2026-09-11',
    )
    stubSources('2026-09-14', grassPayload({ '2026-09-14': 1 }))
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    // September in the northeast has no calendar grass season, so days −1 and
    // −2 are blanks rather than estimates, and the window is today alone.
    expect(series.hours[12]!.exposure.pollen_graminales).toBe(1)
    expect(series.hours[12]!.estimated).toBeUndefined()
  })

  it('leaves tree and weed on the day they were read', async () => {
    rememberPollenDays(
      HAMDEN.lat,
      HAMDEN.lon,
      new Map([
        ['2026-09-11', storedDay('RAGWEED', 'weed', 5)],
        ['2026-09-12', storedDay('OAK', 'tree', 5)],
      ]),
      '2026-09-12',
    )
    stubSources('2026-09-13', pollenPayload('2026-09-13', 2))
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const noon = series.hours[12]!
    // No evidence for a longer window on either, so yesterday's ragweed is
    // yesterday's problem.
    expect(noon.exposure.pollen_ragweed).toBe(2)
    expect(noon.exposure.pollen_oak).toBeUndefined()
    expect(noon.pollenDisplay?.weed?.value).toBe(2)
  })

  it('marks the window estimated when a calendar day is inside it', async () => {
    // June in the northeast is the calendar's "high" grass month, index 4, and
    // nothing was remembered — so days −1 and −2 are guesses.
    stubSources('2026-06-15', grassPayload({ '2026-06-15': 2 }))
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const noon = series.hours[12]!
    expect(noon.exposure.pollen_graminales).toBe(4)
    // The claim "the worst of three days" leans on all three, so a guess in
    // the window is a guess in the answer: no bound may be confirmed from it.
    expect(noon.estimated).toContain('pollen_graminales')
  })

  it('files the day it read, and not the days it was only shown ahead', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-13T18:00:00Z'))
    stubSources('2026-09-13', grassPayload({ '2026-09-13': 3, '2026-09-14': 5 }))
    await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const remembered = recallPollenDays(HAMDEN.lat, HAMDEN.lon)
    // Today, so that Friday's window can read it back as a Wednesday reading.
    expect(remembered.get('2026-09-13')?.exposure).toEqual({ pollen_graminales: 3 })
    // Tomorrow is a projection. Filed, it would be graded on Thursday as
    // though somebody had read it.
    expect(remembered.has('2026-09-14')).toBe(false)
  })
})

/* --- smoke, gated on the fine fraction (specs/25-smoke-variable.md) --- */

/** Hamden on the UTC grid, so the series' local hours *are* its UTC hours. */
const flat = (v: number | null): (number | null)[] => Array.from({ length: 24 }, () => v)

/** A column that is `v` everywhere except the hours listed, which are null. */
const flatExcept = (v: number, missing: number[]): (number | null)[] =>
  flat(v).map((x, h) => (missing.includes(h) ? null : x))

describe('smoke, gated on the fine fraction', () => {
  const store = new Map<string, string>()
  afterEach(() => vi.useRealTimers())
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    })
  })

  /** 14:30 UTC on the 13th at offset 0: hour 14 is now, 15–23 are forecast. */
  const stubSmokeDay = (stubs: Stubs) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-13T14:30:00Z'))
    stubSources('2026-09-13', null, { utcOffsetSeconds: 0, ...stubs })
  }

  it('keeps the density when the particulate underneath is fine-mode', async () => {
    // PM2.5 20, PM10 22: past the level the population prior calls noticeable,
    // and 0.91 of the mass is fine. Dust and road grit are ruled out.
    stubSmokeDay({ smoke: { density: 2 }, air: { pm2_5: flat(20), pm10: flat(22) } })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const now = series.hours[series.currentIndex]!
    expect(now.exposure.smoke).toBe(2)
    // The ungated density rides in raw, because that is what the row draws.
    expect(now.raw.hms_density).toBe(2)
    // And the PM2.5 it was gated on keeps its own value: the split is the
    // point — smoke PM2.5 and ordinary PM2.5 are two variables now.
    expect(now.exposure.pm25).toBe(20)
  })

  it('reads 0 when a plume is overhead and the air below it is clean', async () => {
    // Medium overhead, PM2.5 at 8: a plume aloft over air nobody is choking
    // on. HMS sees a column from above and cannot tell the difference.
    stubSmokeDay({ smoke: { density: 2 }, air: { pm2_5: flat(8), pm10: flat(9) } })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const now = series.hours[series.currentIndex]!
    expect(now.exposure.smoke).toBe(0)
    // Zero is a reading, not an absence: the satellite looked, and the row
    // stays away because the floor is 0 and nothing is above it.
    expect(now.raw.hms_density).toBe(2)
  })

  it('is absent when nobody has an answer for the hour', async () => {
    // The relay is down. Absent, not 0 — a variable recorded as 0 would be
    // tolerance evidence for a clean hour nobody measured.
    stubSmokeDay({ air: { pm2_5: flat(20), pm10: flat(22) } })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const now = series.hours[series.currentIndex]!
    expect(now.exposure.smoke).toBeUndefined()
    expect(now.raw.hms_density).toBeUndefined()
  })

  it('is absent when the PM columns cannot answer the gate', async () => {
    // No PM10 anywhere: the fine fraction has no denominator, so the gate has
    // no verdict — which is a different thing from a verdict of "not smoke".
    stubSmokeDay({ smoke: { density: 3 }, air: { pm2_5: flat(20) } })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const now = series.hours[series.currentIndex]!
    expect(now.exposure.smoke).toBeUndefined()
    expect(now.raw.hms_density).toBe(3)
  })

  it('looks back up to two hours for the raw PM the current hour lacks', async () => {
    // AirNow publishes the NowCast first and the raw hourly behind it, so the
    // newest hour routinely has no raw PM at all. Without the look-back the
    // row would blink out at the top of every hour.
    stubSmokeDay({
      smoke: { density: 2 },
      air: { pm2_5: flatExcept(20, [14]), pm10: flatExcept(22, [14]) },
    })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    expect(series.hours[14]!.exposure.smoke).toBe(2)
  })

  it('gives up after two hours rather than gating on stale air', async () => {
    stubSmokeDay({
      smoke: { density: 2 },
      air: { pm2_5: flatExcept(20, [12, 13, 14]), pm10: flatExcept(22, [12, 13, 14]) },
    })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    expect(series.hours[14]!.exposure.smoke).toBeUndefined()
  })

  it('claims nothing about the hours after now — HMS is a nowcast', async () => {
    stubSmokeDay({ smoke: { density: 2 }, air: { pm2_5: flat(20), pm10: flat(22) } })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    const forecast = series.hours[18]!
    expect(forecast.exposure.smoke).toBeUndefined()
    expect(forecast.raw.hms_density).toBeUndefined()
  })

  it('files this hour so the trailing hours have one at all', async () => {
    stubSmokeDay({ smoke: { density: 2 }, air: { pm2_5: flat(20), pm10: flat(22) } })
    await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    expect(recallSmokeHours(HAMDEN.lat, HAMDEN.lon).get('2026-09-13T14:00')).toBe(2)
  })

  it('reads an earlier hour back out of the store, with the relay down', async () => {
    // The only way the sparkline ever has a 9 am in it is that the app was
    // open at 9 am: the file holds the latest analysis and nothing behind it.
    rememberSmokeHour(HAMDEN.lat, HAMDEN.lon, '2026-09-13T12:00', 3)
    stubSmokeDay({ air: { pm2_5: flat(20), pm10: flat(22) } })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    expect(series.hours[12]!.exposure.smoke).toBe(3)
    expect(series.hours[12]!.raw.hms_density).toBe(3)
    // And an hour nobody wrote down stays absent rather than inheriting it.
    expect(series.hours[13]!.exposure.smoke).toBeUndefined()
  })

  it('carries the plume’s observation window so the row can say “as of”', async () => {
    stubSmokeDay({
      smoke: { density: 1, start: '2026-09-13T12:00:00.000Z', end: '2026-09-13T15:00:00.000Z' },
      air: { pm2_5: flat(20), pm10: flat(22) },
    })
    const series = await fetchExposureSeries(HAMDEN.lat, HAMDEN.lon)
    expect(series.smokeAsOf).toBe('2026-09-13T15:00:00.000Z')
  })

  it('does not ask about a place the analysis does not cover', async () => {
    stubSmokeDay({ smoke: { density: 3 }, air: { pm2_5: flat(20), pm10: flat(22) } })
    const series = await fetchExposureSeries(52.37, 4.9) // Amsterdam
    expect(series.hours[series.currentIndex]!.exposure.smoke).toBeUndefined()
    expect(series.smokeAsOf).toBeUndefined()
  })
})
