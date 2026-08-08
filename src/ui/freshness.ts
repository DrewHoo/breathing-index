/**
 * How old the air on screen actually is.
 *
 * The one question this app has to answer honestly is "is this now?", and the
 * arrival time of the bytes cannot answer it: the service worker serves
 * Open-Meteo NetworkFirst with a cache up to six hours old, so a cache hit
 * reaches the app looking exactly like a live fetch. Freshness therefore comes
 * from the payload — the newest hour it has for "now" — and never from the
 * clock reading at parse time.
 */
import { hourInstant, type ExposureSeries } from '../sources/openMeteo'

/**
 * Past this the header would be implying a currency the data doesn't have, so
 * the banner names the hour instead. An hourly feed is up to 59 minutes behind
 * by design; 90 leaves room for that plus a late publication.
 */
export const STALE_AFTER_MINUTES = 90

/**
 * Past this the vector on a diary entry describes a different part of the day
 * than the rating does. The entry still counts — it is a real symptom at a real
 * time — but its air is an estimate of that hour, and is marked as one.
 */
export const ESTIMATED_AFTER_MINUTES = 180

/** The hour the screen is showing: the newest one in the payload that isn't ahead of now. */
export function displayedHour(series: ExposureSeries): string | null {
  return series.hours[series.currentIndex]?.time ?? null
}

/** Minutes between the start of that hour and wall-clock now. Negative means forecast. */
export function dataAgeMinutes(series: ExposureSeries, now: Date = new Date()): number {
  const time = displayedHour(series)
  if (time === null) return 0
  return (now.getTime() - hourInstant(time, series.utcOffsetSeconds)) / 60_000
}

/** True when the air on screen lags wall-clock far enough to have to say so. */
export function isStale(series: ExposureSeries, now: Date = new Date()): boolean {
  return dataAgeMinutes(series, now) > STALE_AFTER_MINUTES
}

/** The age to record on an entry logged now against this series. */
export function exposureAgeMinutes(series: ExposureSeries, now: Date = new Date()): number {
  return Math.max(0, Math.round(dataAgeMinutes(series, now)))
}

/** Whether air that old makes the entry's vector a guess about its hour. */
export function isEstimatedAge(ageMinutes: number): boolean {
  return ageMinutes > ESTIMATED_AFTER_MINUTES
}
