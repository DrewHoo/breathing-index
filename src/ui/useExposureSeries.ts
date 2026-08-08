import { useCallback, useEffect, useState } from 'react'
import { fetchExposureSeries, findCurrentIndex, type ExposureSeries } from '../sources/openMeteo'
import { reverseGeocode } from '../sources/reverseGeocode'
import { loadSettings } from './settings'

export interface Location {
  lat: number
  lon: number
  label: string
}

/**
 * A sample place, for previewing what the app looks like — never a fallback for
 * someone whose location we could not get. Its label carries the marker, and no
 * screen may strip it: air from a place you did not choose is the gaslighting
 * this app exists to undo.
 */
export const DEFAULT_LOCATION: Location = { lat: 41.396, lon: -72.897, label: 'Hamden, CT (default)' }

const TTL_MS = 10 * 60_000
const LAST_GOOD_KEY = 'breathing-index.lastSeries.v1'
let cache: { key: string; promise: Promise<ExposureSeries>; at: number } | null = null

function getSeries(location: Location): Promise<ExposureSeries> {
  const key = `${location.lat},${location.lon}`
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) return cache.promise
  const promise = fetchExposureSeries(location.lat, location.lon)
  cache = { key, promise, at: Date.now() }
  promise
    .then((s) => {
      try {
        localStorage.setItem(LAST_GOOD_KEY, JSON.stringify({ key, series: s }))
      } catch {
        /* storage full — offline fallback just won't refresh */
      }
    })
    .catch(() => {
      if (cache?.promise === promise) cache = null
    })
  return promise
}

function loadLastGood(key: string): ExposureSeries | null {
  try {
    const raw = localStorage.getItem(LAST_GOOD_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as { key: string; series: ExposureSeries }
    if (saved.key !== key) return null
    // Re-derive "now" — the saved index points at the hour it was fetched.
    saved.series.currentIndex = findCurrentIndex(
      saved.series.hours.map((h) => h.time),
      saved.series.utcOffsetSeconds,
    )
    return saved.series
  } catch {
    return null
  }
}

/**
 * The coordinates the app last read the air for: the saved place if there is
 * one, otherwise whatever the cached series belongs to. For screens that need
 * a place but have no business reopening the location prompt — the diary,
 * attaching a calendar estimate to a day already logged.
 */
export function lastKnownCoords(): { lat: number; lon: number } | null {
  const chosen = chosenLocation()
  if (chosen) return { lat: chosen.lat, lon: chosen.lon }
  try {
    const raw = localStorage.getItem(LAST_GOOD_KEY)
    if (!raw) return null
    const [lat, lon] = (JSON.parse(raw) as { key: string }).key.split(',').map(Number)
    if (lat === undefined || lon === undefined) return null
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
  } catch {
    return null
  }
}

/**
 * Where the active coordinates came from. Reported to analytics in place of the
 * location itself: now that the header names a real town, the label is the
 * user's actual city and must not leave the device.
 */
export type LocationSource = 'default' | 'saved' | 'auto'

/** Why there is no place to read the air for. The home screen says which. */
export type LocationGap = 'denied' | 'no-answer' | 'unsupported'

/** The place the user picked in Settings, if that is how they set it up. */
function chosenLocation(): Location | null {
  const settings = loadSettings()
  if (settings.activeLocation === 'auto') return null
  return settings.locations[settings.activeLocation] ?? null
}

export function useExposureSeries(): {
  /** null until we know where to read — never a stand-in place */
  location: Location | null
  source: LocationSource
  /** set when the browser will not say where we are and no place is saved */
  gap: LocationGap | null
  /** ask the browser again, after the user has had a word with it */
  retryLocation: () => void
  series: ExposureSeries | null
  error: string | null
  /** true when showing last-known data because the live fetch failed */
  stale: boolean
  /** ask again after a failure — the error screen's Retry button */
  retry: () => void
} {
  const [location, setLocation] = useState<Location | null>(chosenLocation)
  const [source, setSource] = useState<LocationSource>(() => (chosenLocation() ? 'saved' : 'auto'))
  const [gap, setGap] = useState<LocationGap | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [series, setSeries] = useState<ExposureSeries | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)

  // Drop the in-flight failure as well as the counter: the whole point of
  // pressing Retry is to go back to the network, not to replay the miss.
  const retry = () => {
    cache = null
    setError(null)
    setAttempt((n) => n + 1)
  }

  const retryLocation = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    if (chosenLocation()) return
    let cancelled = false

    if (!navigator.geolocation) {
      setGap('unsupported')
      return
    }
    setGap(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return
        const lat = Math.round(pos.coords.latitude * 1000) / 1000
        const lon = Math.round(pos.coords.longitude * 1000) / 1000

        // Show the generic label immediately so the header is never empty, then
        // name the place once we know it. The air data does not wait on this.
        setLocation({ lat, lon, label: 'Your location' })
        setSource('auto')
        setGap(null)
        void reverseGeocode(lat, lon).then((label) => {
          // Only name the place we actually looked up — the user may have
          // switched to a saved location while the lookup was in flight.
          if (!cancelled && label)
            setLocation((prev) =>
              prev && prev.lat === lat && prev.lon === lon ? { ...prev, label } : prev,
            )
        })
      },
      (err) => {
        if (cancelled) return
        // A refusal is an answer: say so and ask for a place, rather than
        // loading a town the user has never breathed in. A timeout is not a
        // refusal — the permission dialog may still be up — so it reads as
        // "no answer yet" and the retry button is the whole fix.
        setGap(err.code === err.PERMISSION_DENIED ? 'denied' : 'no-answer')
      },
      // The permission dialog is user-paced; 5 s used to expire underneath it.
      { timeout: 30_000, maximumAge: 600_000 },
    )

    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(() => {
    if (!location) return
    let cancelled = false
    setError(null)
    getSeries(location)
      .then((s) => {
        if (cancelled) return
        setSeries(s)
        setStale(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const lastGood = loadLastGood(`${location.lat},${location.lon}`)
        if (lastGood) {
          setSeries(lastGood)
          setStale(true)
        } else {
          setError(e instanceof Error ? e.message : String(e))
        }
      })
    return () => {
      cancelled = true
    }
  }, [location, attempt])

  return { location, source, gap, retryLocation, series, error, stale, retry }
}
