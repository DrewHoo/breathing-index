import { useEffect, useState } from 'react'
import { fetchExposureSeries, findCurrentIndex, type ExposureSeries } from '../sources/openMeteo'
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

export function useExposureSeries(): {
  location: Location
  series: ExposureSeries | null
  error: string | null
  /** true when showing last-known data because the live fetch failed */
  stale: boolean
} {
  const [location, setLocation] = useState<Location>(() => {
    const settings = loadSettings()
    if (settings.activeLocation !== 'auto') {
      const saved = settings.locations[settings.activeLocation]
      if (saved) return saved
    }
    return DEFAULT_LOCATION
  })
  const [series, setSeries] = useState<ExposureSeries | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if (loadSettings().activeLocation !== 'auto') return
    navigator.geolocation?.getCurrentPosition(
      (pos) =>
        setLocation({
          lat: Math.round(pos.coords.latitude * 1000) / 1000,
          lon: Math.round(pos.coords.longitude * 1000) / 1000,
          label: 'Your location',
        }),
      () => undefined,
      { timeout: 5000, maximumAge: 600_000 },
    )
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
  }, [location])

  return { location, series, error, stale }
}
