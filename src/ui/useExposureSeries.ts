import { useEffect, useState } from 'react'
import { fetchExposureSeries, findCurrentIndex, type ExposureSeries } from '../sources/openMeteo'
import { reverseGeocode } from '../sources/reverseGeocode'
import { loadSettings } from './settings'

export interface Location {
  lat: number
  lon: number
  label: string
}

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
 * Where the active coordinates came from. Reported to analytics in place of the
 * location itself: now that the header names a real town, the label is the
 * user's actual city and must not leave the device.
 */
export type LocationSource = 'default' | 'saved' | 'auto'

export function useExposureSeries(): {
  location: Location
  source: LocationSource
  series: ExposureSeries | null
  error: string | null
  /** true when showing last-known data because the live fetch failed */
  stale: boolean
  /** ask again after a failure — the error screen's Retry button */
  retry: () => void
} {
  const [location, setLocation] = useState<Location>(() => {
    const settings = loadSettings()
    if (settings.activeLocation !== 'auto') {
      const saved = settings.locations[settings.activeLocation]
      if (saved) return saved
    }
    return DEFAULT_LOCATION
  })
  const [source, setSource] = useState<LocationSource>(() =>
    loadSettings().activeLocation !== 'auto' ? 'saved' : 'default',
  )
  const [series, setSeries] = useState<ExposureSeries | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // Drop the in-flight failure as well as the counter: the whole point of
  // pressing Retry is to go back to the network, not to replay the miss.
  const retry = () => {
    cache = null
    setError(null)
    setAttempt((n) => n + 1)
  }

  useEffect(() => {
    if (loadSettings().activeLocation !== 'auto') return
    let cancelled = false

    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        if (cancelled) return
        const lat = Math.round(pos.coords.latitude * 1000) / 1000
        const lon = Math.round(pos.coords.longitude * 1000) / 1000

        // Show the generic label immediately so the header is never empty, then
        // name the place once we know it. The air data does not wait on this.
        setLocation({ lat, lon, label: 'Your location' })
        setSource('auto')
        void reverseGeocode(lat, lon).then((label) => {
          // Only name the place we actually looked up — the user may have
          // switched to a saved location while the lookup was in flight.
          if (!cancelled && label)
            setLocation((prev) => (prev.lat === lat && prev.lon === lon ? { ...prev, label } : prev))
        })
      },
      () => undefined,
      { timeout: 5000, maximumAge: 600_000 },
    )

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
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

  return { location, source, series, error, stale, retry }
}
