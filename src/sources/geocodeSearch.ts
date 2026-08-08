/**
 * A place name -> somewhere to read the air ("Denver" -> 39.739, -104.985).
 *
 * Open-Meteo's geocoding endpoint is the same bargain as the air data itself:
 * no key, CORS-enabled, worldwide. It is what lets Settings ask for a name
 * instead of three latitude/longitude boxes nobody can check by eye.
 *
 * Coordinates come back at full precision and are rounded to 3dp (~110 m)
 * before they are stored, matching what the app already sends to Open-Meteo
 * and AirNow — a diary should not carry a house-level fix around.
 */

export interface PlaceResult {
  /** stored and shown in the header: "Denver, Colorado" */
  label: string
  /** the disambiguating line under it: "United States" — may be empty */
  detail: string
  lat: number
  lon: number
}

interface RawResult {
  name?: string
  admin1?: string
  country?: string
  latitude?: number
  longitude?: number
}

const round = (n: number): number => Math.round(n * 1000) / 1000

function toPlace(raw: RawResult): PlaceResult | null {
  const name = raw.name?.trim()
  if (!name) return null
  const { latitude: lat, longitude: lon } = raw
  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  // The region names the place ("Denver, Colorado"); the country only has to
  // separate it from the other Denvers, so it sits underneath.
  const region = raw.admin1?.trim()
  const country = raw.country?.trim()
  return {
    label: region ? `${name}, ${region}` : country ? `${name}, ${country}` : name,
    detail: region && country ? country : '',
    lat: round(lat),
    lon: round(lon),
  }
}

/** A no-match response has no `results` key at all, which is not an error. */
export function parseGeocodeResults(body: unknown): PlaceResult[] {
  const results = (body as { results?: unknown })?.results
  if (!Array.isArray(results)) return []
  return results
    .map((raw) => toPlace(raw as RawResult))
    .filter((place): place is PlaceResult => place !== null)
}

/**
 * `null` means the lookup itself failed — offline, blocked, rate-limited —
 * which is worth saying out loud; an empty array means no such place.
 */
export async function searchPlaces(query: string): Promise<PlaceResult[] | null> {
  const name = query.trim()
  if (name.length < 2) return []
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en&format=json`,
    )
    if (!res.ok) return null
    return parseGeocodeResults(await res.json())
  } catch {
    return null
  }
}
