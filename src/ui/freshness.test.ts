import { describe, expect, it } from 'vitest'
import type { ExposureSeries, Hour } from '../sources/openMeteo'
import { dataAgeMinutes, exposureAgeMinutes, isEstimatedAge, isStale } from './freshness'

/** Times are local to the location, as Open-Meteo returns them. */
const hour = (time: string): Hour => ({
  time,
  exposure: { pm25: 8 },
  raw: { pm25: 8 },
  official: { usAqi: 30, eaqi: 20 },
})

/** UTC-4, so local 13:00 is 17:00Z. */
const series = (times: string[], currentIndex: number): ExposureSeries => ({
  hours: times.map(hour),
  currentIndex,
  fetchedAt: '2026-08-07T17:10:00.000Z',
  utcOffsetSeconds: -4 * 3600,
})

const TIMES = ['2026-08-07T11:00', '2026-08-07T12:00', '2026-08-07T13:00', '2026-08-07T14:00']

describe('dataAgeMinutes', () => {
  it('measures the hour on screen against the clock, not the fetch', () => {
    // Parsed a moment ago, but the newest hour it has is 13:00 local (17:00Z).
    expect(dataAgeMinutes(series(TIMES, 2), new Date('2026-08-07T17:20:00Z'))).toBe(20)
  })

  it('is negative for an hour that has not started yet', () => {
    expect(dataAgeMinutes(series(TIMES, 3), new Date('2026-08-07T17:20:00Z'))).toBe(-40)
  })

  it('says nothing about an empty payload', () => {
    expect(dataAgeMinutes(series([], 0), new Date('2026-08-07T17:20:00Z'))).toBe(0)
  })
})

describe('isStale', () => {
  it('leaves an ordinary hourly lag alone', () => {
    expect(isStale(series(TIMES, 2), new Date('2026-08-07T17:59:00Z'))).toBe(false)
  })

  it('catches a cache hit that arrived looking fresh', () => {
    // A four-hour-old cached payload: parsed now, newest hour still 13:00.
    expect(isStale(series(TIMES, 2), new Date('2026-08-07T21:00:00Z'))).toBe(true)
  })

  it('turns on ninety minutes behind the hour', () => {
    expect(isStale(series(TIMES, 2), new Date('2026-08-07T18:30:00Z'))).toBe(false)
    expect(isStale(series(TIMES, 2), new Date('2026-08-07T18:31:00Z'))).toBe(true)
  })
})

describe('exposureAgeMinutes', () => {
  it('records how far behind the air was at log time', () => {
    expect(exposureAgeMinutes(series(TIMES, 2), new Date('2026-08-07T21:00:00Z'))).toBe(240)
  })

  it('never records a negative age against a forecast hour', () => {
    expect(exposureAgeMinutes(series(TIMES, 3), new Date('2026-08-07T17:20:00Z'))).toBe(0)
  })
})

describe('isEstimatedAge', () => {
  it('turns on past three hours', () => {
    expect(isEstimatedAge(180)).toBe(false)
    expect(isEstimatedAge(181)).toBe(true)
  })
})
