/**
 * Coordinates -> a place name worth showing in the header ("Hamden, CT").
 *
 * BigDataCloud's reverse-geocode-client endpoint is keyless, CORS-enabled and
 * worldwide, which is the same constraint Open-Meteo satisfies for the data
 * itself — no API key to leak, nothing to sign up for.
 *
 * Best-effort throughout: every failure path leaves the caller's existing label
 * alone rather than showing an error. The coordinates sent are the same rounded
 * ones already sent to Open-Meteo and AirNow (3dp, roughly 110m).
 */

const CACHE_KEY = 'breathing-index.place.v1'

interface RawPlace {
  city?: string
  locality?: string
  principalSubdivision?: string
  principalSubdivisionCode?: string
  countryCode?: string
}

/**
 * "Hamden, CT" in the US and Canada, where the subdivision is how people name
 * where they are; "Amsterdam, NL" elsewhere, where the country reads better
 * than a subdivision code almost nobody recognises.
 */
function format(place: RawPlace): string | null {
  const name = place.city || place.locality || place.principalSubdivision
  if (!name) return null

  const subdivision = place.principalSubdivisionCode?.split('-')[1]
  const region =
    (place.countryCode === 'US' || place.countryCode === 'CA') && subdivision
      ? subdivision
      : place.countryCode
  return region ? `${name}, ${region}` : name
}

function readCache(key: string): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as { key: string; label: string }
    return saved.key === key ? saved.label : null
  } catch {
    return null
  }
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const key = `${lat},${lon}`

  const cached = readCache(key)
  if (cached) return cached

  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
    )
    if (!res.ok) return null

    const label = format((await res.json()) as RawPlace)
    if (!label) return null

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ key, label }))
    } catch {
      /* storage full — we just look it up again next time */
    }
    return label
  } catch {
    return null
  }
}
