import { describe, expect, it } from 'vitest'
import { parseAirNow } from './airnow'

// Field shapes copied from a live relay response (Hampton Roads, Aug 2026).
const obs = (parameter: string, aqi: number, category = 'Good') => ({
  DateObserved: '2026-08-10',
  HourObserved: 22,
  LocalTimeZone: 'EST',
  ReportingArea: 'Hampton Roads',
  StateCode: 'VA',
  Latitude: 36.9238,
  Longitude: -76.48,
  ParameterName: parameter,
  AQI: aqi,
  Category: { Number: 1, Name: category },
})

describe('parseAirNow', () => {
  it('derives isPrimary as the highest AQI present', () => {
    const report = parseAirNow({
      observations: [obs('O3', 30), obs('PM2.5', 51, 'Moderate')],
      forecast: [],
    })
    expect(report!.observations.map((o) => [o.parameter, o.isPrimary])).toEqual([
      ['O3', false],
      ['PM2.5', true],
    ])
    expect(report!.reportingArea).toBe('Hampton Roads')
    expect(report!.time).toBe('22:00')
    expect(report!.actionDay).toBe(false)
  })

  it("drops the API's AQI −1 no-data rows instead of showing them", () => {
    const report = parseAirNow({ observations: [obs('O3', 30), obs('PM10', -1)], forecast: [] })
    expect(report!.observations).toHaveLength(1)
  })

  it('still reports an Action Day when observations are empty', () => {
    const report = parseAirNow({
      observations: [],
      forecast: [{ ReportingArea: 'Hampton Roads', ActionDay: true }],
    })
    expect(report).not.toBeNull()
    expect(report!.actionDay).toBe(true)
    expect(report!.observations).toHaveLength(0)
    expect(report!.reportingArea).toBe('Hampton Roads')
  })

  it('has nothing to show for an empty payload — including a missing one', () => {
    expect(parseAirNow({ observations: [], forecast: [] })).toBeNull()
    // An un-upgraded relay returns a bare array; every field lookup misses.
    expect(parseAirNow({} as never)).toBeNull()
  })
})
