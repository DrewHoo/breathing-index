/**
 * Ratings logged with no air behind them.
 *
 * A bad-breathing moment in a dead zone is exactly the data point this app
 * exists to capture, so the tap saves immediately with the coordinates it was
 * made at and nothing else. The vector arrives later, from Open-Meteo's own
 * hourly history for that hour, and until it does the entry is held out of
 * everything the model reads — an empty exposure would otherwise read as
 * tolerance for every variable at once.
 */
import type { DiaryEntry } from '../engine/types'
import { fetchExposureSeries, hourInstant, type ExposureSeries } from '../sources/openMeteo'

const HOUR_MS = 3_600_000

/** Open-Meteo serves three past days; older than that, the hour is gone for good. */
export const BACKFILL_WINDOW_MS = 3 * 24 * HOUR_MS

/**
 * Close enough to be the same air. CAMS runs on a ~0.1° grid and geolocation
 * jitters between app opens, so insisting on identical coordinates would send
 * a second request for the same model cell.
 */
const SAME_PLACE_DEGREES = 0.05

export interface Place {
  lat: number
  lon: number
}

export const isPending = (entry: DiaryEntry): boolean => entry.pendingExposure !== undefined

/**
 * The entries the model may read. Everything that reaches buildModel,
 * predict, or the similar-air hold-out goes through here first.
 */
export const settled = (diary: DiaryEntry[]): DiaryEntry[] => diary.filter((e) => !isPending(e))

const samePlace = (a: Place, b: Place): boolean =>
  Math.abs(a.lat - b.lat) <= SAME_PLACE_DEGREES && Math.abs(a.lon - b.lon) <= SAME_PLACE_DEGREES

/** Index of the hour containing this instant, or -1 if the series doesn't reach it. */
function hourIndexAt(series: ExposureSeries, instant: number): number {
  for (let i = series.hours.length - 1; i >= 0; i--) {
    const start = hourInstant(series.hours[i]!.time, series.utcOffsetSeconds)
    if (start <= instant && instant < start + HOUR_MS) return i
  }
  return -1
}

/**
 * Attach the air to every pending entry this series covers. Entries logged
 * somewhere else are left alone — the reading has to be of the place the
 * person was breathing in.
 */
export function resolvePending(
  diary: DiaryEntry[],
  series: ExposureSeries,
  at: Place,
): DiaryEntry[] {
  let changed = false
  const next = diary.map((entry) => {
    const pending = entry.pendingExposure
    if (!pending || !samePlace(pending, at)) return entry
    const instant = Date.parse(entry.time)
    if (Number.isNaN(instant)) return entry
    const index = hourIndexAt(series, instant)
    const hour = series.hours[index]
    if (!hour) return entry
    changed = true
    const { pendingExposure: _pending, ...rest } = entry
    return {
      ...rest,
      exposure: hour.exposure,
      official: hour.official,
      exposureAgeMinutes: Math.round(
        (instant - hourInstant(hour.time, series.utcOffsetSeconds)) / 60_000,
      ),
    }
  })
  return changed ? next : diary
}

/** Pending entries still young enough for the API to have their hour. */
export function backfillable(diary: DiaryEntry[], now: Date = new Date()): DiaryEntry[] {
  return diary.filter((entry) => {
    if (!isPending(entry)) return false
    const instant = Date.parse(entry.time)
    return !Number.isNaN(instant) && now.getTime() - instant < BACKFILL_WINDOW_MS
  })
}

const placeKey = (place: Place): string =>
  `${place.lat.toFixed(2)},${place.lon.toFixed(2)}`

/**
 * Fill in what can be filled in, using the series already on screen where it
 * covers the entry and a history request per other place where it doesn't.
 * Returns null when nothing changed, so a caller can skip the write.
 */
export async function backfillPending(
  diary: DiaryEntry[],
  series: ExposureSeries | null,
  at: Place | null,
  now: Date = new Date(),
  fetchSeries: (lat: number, lon: number) => Promise<ExposureSeries> = fetchExposureSeries,
): Promise<DiaryEntry[] | null> {
  if (backfillable(diary, now).length === 0) return null

  let next = series && at ? resolvePending(diary, series, at) : diary

  const elsewhere = new Map<string, Place>()
  for (const entry of backfillable(next, now)) {
    const place = entry.pendingExposure!
    elsewhere.set(placeKey(place), place)
  }
  for (const place of elsewhere.values()) {
    try {
      next = resolvePending(next, await fetchSeries(place.lat, place.lon), place)
    } catch {
      // Still offline, or the place is gone from the API's window. The entry
      // keeps waiting; it is a real rating either way.
    }
  }

  return next === diary ? null : next
}
