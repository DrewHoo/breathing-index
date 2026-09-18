import { describe, expect, it } from 'vitest'
import fixture from '../../tests/fixtures/airnow-data.json'
import {
  airNowReport,
  coversExposureVector,
  inAirNowCoverage,
  parseAirNow,
  parseAirNowPayload,
  type AirNowPayload,
  type AirNowRow,
} from './airnow'

// A real /v1/airnow response for the Hamden cell, trimmed to its last 26
// hours: three Connecticut sites, two of which are nearer for one parameter
// and not for another, and a newest hour whose raw concentrations have not
// posted yet. Captured 2026-09-14.
const HAMDEN = { lat: 41.396, lon: -72.897 }
const payload = fixture as AirNowPayload

/** One aq/data/ row, with only the fields a test is making a point about. */
const row = (over: Partial<AirNowRow>): AirNowRow => ({
  Latitude: 41.3,
  Longitude: -72.9,
  UTC: '2026-09-14T02:00',
  Parameter: 'PM2.5',
  Unit: 'UG/M3',
  Value: 5,
  RawConcentration: 5,
  AQI: 21,
  Category: 1,
  SiteName: 'Somewhere',
  ...over,
})

describe('parseAirNow on a real aq/data/ payload', () => {
  const observations = parseAirNow(payload, HAMDEN.lat, HAMDEN.lon)!

  it('picks the nearest site for every parameter', () => {
    // Stratford also reports ozone and Waterbury also reports both particle
    // sizes; New Haven is closer to Hamden than either.
    expect(observations.monitors.pm25?.siteName).toBe('New Haven')
    expect(observations.monitors.pm10?.siteName).toBe('New Haven')
    expect(observations.monitors.o3?.siteName).toBe('New Haven')
  })

  it('reads the raw hourly concentration, converting ozone out of PPB', () => {
    // 10 PPB at the EPA's reference conditions. The NowCast in `Value` for the
    // same hour is 13, which is the number this must not be.
    expect(observations.monitors.o3?.byHour.get('2026-09-14T02:00')).toBeCloseTo(19.6, 6)
    expect(observations.monitors.pm25?.byHour.get('2026-09-14T02:00')).toBe(4.6)
  })

  it('leaves out the newest hour, whose raw concentration has not posted', () => {
    // AirNow publishes the NowCast first: the 03:00 particle rows carry an AQI
    // and a −999. An hour with no reading is absent, never zero.
    expect(observations.monitors.pm25?.byHour.has('2026-09-14T03:00')).toBe(false)
    expect(observations.monitors.pm25?.byHour.size).toBe(25)
  })

  it('covers the exposure vector, so the series may run on it', () => {
    expect(coversExposureVector(observations)).toBe(true)
  })

  it('names the forecast reporting area and reports no Action Day', () => {
    expect(observations.reportingArea).toBe('New Haven')
    expect(observations.actionDay).toBe(false)
    expect(observations.newestHour).toBe('2026-09-14T03:00')
  })
})

describe('choosing a monitor', () => {
  const quietNearby = [
    row({ SiteName: 'Next Door', Latitude: 41.39, Longitude: -72.9, UTC: '2026-09-12T04:00' }),
    row({ SiteName: 'Across Town', Latitude: 41.15, Longitude: -73.1, UTC: '2026-09-14T02:00' }),
  ]

  it('prefers a live monitor further off to a near one that went quiet', () => {
    // Three kilometres away and silent since the day before yesterday is not a
    // better answer about the air right now than thirty kilometres and live.
    const observations = parseAirNow({ observations: quietNearby }, HAMDEN.lat, HAMDEN.lon)!
    expect(observations.monitors.pm25?.siteName).toBe('Across Town')
    expect(observations.monitors.pm25?.recent).toBe(true)
  })

  it('ignores a site that reports nothing but the missing sentinel', () => {
    const observations = parseAirNow(
      {
        observations: [
          row({ SiteName: 'Next Door', Latitude: 41.39, Longitude: -72.9, RawConcentration: -999 }),
          row({ SiteName: 'Across Town', Latitude: 41.15, Longitude: -73.1 }),
        ],
      },
      HAMDEN.lat,
      HAMDEN.lon,
    )!
    expect(observations.monitors.pm25?.siteName).toBe('Across Town')
  })

  it('will not carry a series without both particles and ozone', () => {
    // PM2.5 and ozone are the whole vector a station series has to carry
    // (specs/24-vector-diet.md), so the bar is both of them: without ozone the
    // series falls back to the model.
    const particlesOnly = parseAirNow({ observations: [row({})] }, HAMDEN.lat, HAMDEN.lon)!
    expect(particlesOnly.monitors.o3).toBeUndefined()
    expect(coversExposureVector(particlesOnly)).toBe(false)

    const stale = parseAirNow(
      {
        observations: [
          row({ UTC: '2026-09-14T02:00' }),
          row({ Parameter: 'OZONE', Unit: 'PPB', UTC: '2026-09-12T02:00' }),
        ],
      },
      HAMDEN.lat,
      HAMDEN.lon,
    )!
    // Two days of silence from the ozone monitor: it is in the box, it is not
    // reporting, and a two-day-old number is not this afternoon's air.
    expect(stale.monitors.o3?.recent).toBe(false)
    expect(coversExposureVector(stale)).toBe(false)
  })
})

describe('sulfur dioxide', () => {
  it('reads SO₂ off the monitor, converting its PPB at 2.62', () => {
    // The New Haven site reports SO₂ hourly (specs/29-sulfur-dioxide.md). The
    // factor is the gas's own — 2.62 µg/m³ per ppb, not ozone's 1.96 — because
    // the molecule is heavier, and using the wrong one would be a third of the
    // way off on the one variable whose floor decides whether it exists at all.
    const observations = parseAirNow(
      {
        observations: [
          row({ Parameter: 'SO2', Unit: 'PPB', RawConcentration: 10, SiteName: 'New Haven' }),
        ],
      },
      HAMDEN.lat,
      HAMDEN.lon,
    )!
    expect(observations.monitors.so2?.siteName).toBe('New Haven')
    expect(observations.monitors.so2?.byHour.get('2026-09-14T02:00')).toBeCloseTo(26.2, 6)
  })

  it('leaves SO₂ out of the measured strip, which has no bridge for it', () => {
    // The strip's chips are AQI points walked back through `aqi.ts`, whose
    // tables cover PM and ozone only. A fourth chip would be a point with no
    // concentration behind it (specs/29-sulfur-dioxide.md).
    const observations = parseAirNow(
      {
        observations: [
          row({}),
          row({ Parameter: 'SO2', Unit: 'PPB', RawConcentration: 10, AQI: 90, Category: 2 }),
        ],
      },
      HAMDEN.lat,
      HAMDEN.lon,
    )!
    expect(observations.monitors.so2).toBeDefined()
    expect(airNowReport(observations)!.observations.map((o) => o.parameter)).toEqual(['PM2.5'])
  })
})

describe('the measured strip report', () => {
  it('takes one AQI point per parameter from its monitor’s newest hour', () => {
    const report = airNowReport(parseAirNow(payload, HAMDEN.lat, HAMDEN.lon)!)!
    expect(report.observations.map((o) => [o.parameter, o.aqi])).toEqual([
      ['PM2.5', 22],
      ['PM10', 7],
      ['OZONE', 12],
    ])
    // isPrimary is the highest point present — what AirNow's own displays mean.
    expect(report.observations.filter((o) => o.isPrimary).map((o) => o.parameter)).toEqual(['PM2.5'])
    expect(report.reportingArea).toBe('New Haven')
    expect(report.time).toBe('2026-09-14T03:00')
  })

  it("drops the API's AQI −1 no-data rows instead of showing them", () => {
    const observations = parseAirNow(
      { observations: [row({ AQI: 21 }), row({ Parameter: 'PM10', AQI: -1, UTC: '2026-09-14T03:00' })] },
      HAMDEN.lat,
      HAMDEN.lon,
    )!
    expect(airNowReport(observations)!.observations.map((o) => o.parameter)).toEqual(['PM2.5'])
  })

  it('still reports an Action Day when observations are empty', () => {
    const observations = parseAirNow(
      { observations: [], forecast: [{ reportingArea: 'New Haven', actionDay: true }] },
      HAMDEN.lat,
      HAMDEN.lon,
    )!
    const report = airNowReport(observations)!
    expect(report.actionDay).toBe(true)
    expect(report.observations).toHaveLength(0)
    expect(report.reportingArea).toBe('New Haven')
  })

  it('survives AirNow answering "no forecast here" with an error object', () => {
    // Verified in Anchorage: HTTP 200, observations intact, and the forecast
    // half is `{WebServiceError: [...]}` rather than an empty list.
    const observations = parseAirNow(
      { observations: [row({})], forecast: { WebServiceError: [{ Message: 'no forecasts' }] } as never },
      HAMDEN.lat,
      HAMDEN.lon,
    )!
    expect(observations.actionDay).toBe(false)
    expect(observations.reportingArea).toBe('Somewhere')
    expect(airNowReport(observations)!.observations).toHaveLength(1)
  })

  it('has nothing to show for an empty payload — including a missing one', () => {
    expect(parseAirNow({ observations: [], forecast: [] }, HAMDEN.lat, HAMDEN.lon)).toBeNull()
    // A relay that has not been upgraded returns some other shape entirely;
    // every field lookup misses and the screen keeps its model numbers.
    expect(parseAirNow({} as never, HAMDEN.lat, HAMDEN.lon)).toBeNull()
  })
})

describe('coverage', () => {
  it('claims the US and nowhere else', () => {
    expect(inAirNowCoverage(41.396, -72.897)).toBe(true) // Hamden
    expect(inAirNowCoverage(61.2, -149.9)).toBe(true) // Anchorage
    expect(inAirNowCoverage(21.3, -157.9)).toBe(true) // Honolulu
    expect(inAirNowCoverage(52.37, 4.9)).toBe(false) // Amsterdam
    expect(inAirNowCoverage(-33.87, 151.21)).toBe(false) // Sydney
  })
})

describe('parseAirNowPayload', () => {
  const row = {
    Latitude: 41.3,
    Longitude: -72.9,
    UTC: '2026-09-13T22:00',
    Parameter: 'PM2.5',
    Unit: 'UG/M3',
    Value: 9,
    RawConcentration: 9,
    AQI: 38,
    Category: 1,
    SiteName: 'New Haven',
  }

  it('passes well-formed halves through', () => {
    const payload = parseAirNowPayload({ observations: [row], forecast: [{ actionDay: true }] })
    expect(payload!.observations).toHaveLength(1)
    expect(payload!.forecast).toEqual([{ actionDay: true }])
  })

  it('turns WebServiceError halves into empty arrays, the Anchorage case', () => {
    const payload = parseAirNowPayload({
      observations: [row],
      forecast: { WebServiceError: [{ Message: 'no forecast' }] },
    })
    expect(payload!.observations).toHaveLength(1)
    expect(payload!.forecast).toEqual([])
  })

  it('drops retired-endpoint rows and fills sentinels for missing fields', () => {
    const payload = parseAirNowPayload({
      observations: [
        { ParameterName: 'PM2.5', HourObserved: 17 }, // retired shape: no Parameter/UTC
        { Parameter: 'OZONE', UTC: '2026-09-13T22:00' }, // sparse but load-bearing fields present
      ],
    })
    expect(payload!.observations).toHaveLength(1)
    const sparse = payload!.observations![0]!
    expect(sparse.RawConcentration).toBe(-999)
    expect(sparse.AQI).toBe(-1)
  })

  it('answers null for a body that is not even an object', () => {
    expect(parseAirNowPayload('gone')).toBeNull()
    expect(parseAirNowPayload(null)).toBeNull()
  })
})
