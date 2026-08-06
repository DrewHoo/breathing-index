import { useEffect, useState } from 'react'
import { fetchExposureSeries, type ExposureSeries } from '../sources/openMeteo'

export interface Location {
  lat: number
  lon: number
  label: string
}

export const DEFAULT_LOCATION: Location = { lat: 41.396, lon: -72.897, label: 'Hamden, CT (default)' }

const TTL_MS = 10 * 60_000
let cache: { key: string; promise: Promise<ExposureSeries>; at: number } | null = null

function getSeries(location: Location): Promise<ExposureSeries> {
  const key = `${location.lat},${location.lon}`
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) return cache.promise
  const promise = fetchExposureSeries(location.lat, location.lon)
  cache = { key, promise, at: Date.now() }
  promise.catch(() => {
    if (cache?.promise === promise) cache = null
  })
  return promise
}

export function useExposureSeries(): {
  location: Location
  series: ExposureSeries | null
  error: string | null
} {
  const [location, setLocation] = useState<Location>(DEFAULT_LOCATION)
  const [series, setSeries] = useState<ExposureSeries | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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
        if (!cancelled) setSeries(s)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [location])

  return { location, series, error }
}
