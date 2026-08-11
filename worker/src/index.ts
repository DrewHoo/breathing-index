/**
 * The relay: the one server breathingindex.com runs, existing only because
 * keyed APIs cannot be called from a public client. It holds the keys, rounds
 * away precision, and caches — it never logs, stores, or derives anything
 * about a user.
 *
 * The privacy promise this code enforces (and the privacy page states): the
 * relay never receives a location sharper than one decimal degree (~11 km).
 * The client rounds before asking and this file rejects anything sharper, so
 * the promise holds structurally from both ends — a bug in one is caught by
 * the other. Keys live in Wrangler secrets; nothing here reads them from git.
 */

export interface Env {
  AIRNOW_API_KEY: string
  PURPLEAIR_API_KEY: string
  GOOGLE_MAPS_API_KEY: string
  /** Optional KV cache — see wrangler.toml. Absent, every request goes upstream. */
  CACHE?: KVNamespace
}

/**
 * Origins allowed to call the relay from a browser. The Origin check filters
 * casual freeloading, nothing more — real spend protection is the per-key
 * daily quota cap set at each upstream vendor.
 */
const ALLOWED_ORIGINS = new Set([
  'https://breathingindex.com',
  'https://www.breathingindex.com',
  'http://localhost:5173',
  'http://localhost:4173',
])

/**
 * At most one decimal place: ~11 km. This is a privacy gate, not input
 * sanitizing — "0.05" is a perfectly clean number the relay refuses to know.
 */
const COARSE = /^-?\d{1,3}(\.\d)?$/

/** Seconds a cached upstream answer is served before refetching. */
const TTL = 3600

const json = (body: unknown, status: number, cors: HeadersInit): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  })

function coarseCoords(url: URL): { lat: string; lon: string } | null {
  const lat = url.searchParams.get('lat') ?? ''
  const lon = url.searchParams.get('lon') ?? ''
  if (!COARSE.test(lat) || !COARSE.test(lon)) return null
  if (Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return null
  return { lat, lon }
}

/**
 * Serve from KV when a fresh answer for this (route, cell) exists; otherwise
 * fetch upstream and remember it. The key is the coarse request itself, so two
 * users in one grid cell within an hour cost one upstream call — the cache is
 * the cost control, and it is also why the relay can promise no per-user
 * anything: there is nothing per-user in the key.
 */
async function relay(
  env: Env,
  cacheKey: string,
  upstream: () => Promise<Response>,
  cors: HeadersInit,
): Promise<Response> {
  const hit = await env.CACHE?.get(cacheKey)
  if (hit != null) {
    return new Response(hit, {
      headers: { 'content-type': 'application/json', 'x-relay-cache': 'hit', ...cors },
    })
  }
  const res = await upstream()
  const body = await res.text()
  if (!res.ok) {
    // Upstream failures pass through with their status so the client can fall
    // back the way it already knows how (calendar estimate, "no evidence yet")
    // — and they are never cached.
    return new Response(body, {
      status: res.status,
      headers: { 'content-type': 'application/json', ...cors },
    })
  }
  await env.CACHE?.put(cacheKey, body, { expirationTtl: TTL })
  return new Response(body, {
    headers: { 'content-type': 'application/json', 'x-relay-cache': 'miss', ...cors },
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')
    const cors: HeadersInit =
      origin && ALLOWED_ORIGINS.has(origin)
        ? { 'access-control-allow-origin': origin, vary: 'Origin' }
        : {}

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'access-control-allow-methods': 'GET', 'access-control-max-age': '86400' },
      })
    }
    if (request.method !== 'GET') return json({ error: 'GET only' }, 405, cors)
    if (origin && !ALLOWED_ORIGINS.has(origin)) return json({ error: 'origin not allowed' }, 403, cors)

    const coords = coarseCoords(url)
    if (!coords) {
      return json(
        { error: 'lat/lon required, at most one decimal place — the relay refuses precise locations' },
        400,
        cors,
      )
    }
    const { lat, lon } = coords

    switch (url.pathname) {
      // Official AirNow current observations plus today's forecast, one
      // payload, one cache entry: the observations carry the per-pollutant
      // AQI points the client bridges to µg/m³; the forecast rows ride along
      // only because they are where AirNow says whether today is an official
      // Action Day. Parsing lives in the client, where it has tests.
      case '/v1/airnow': {
        const common = {
          format: 'application/json',
          latitude: lat,
          longitude: lon,
          distance: '50',
          API_KEY: env.AIRNOW_API_KEY,
        }
        const obs = new URL('https://www.airnowapi.org/aq/observation/latLong/current/')
        obs.search = new URLSearchParams(common).toString()
        const fc = new URL('https://www.airnowapi.org/aq/forecast/latLong/')
        fc.search = new URLSearchParams(common).toString()
        return relay(
          env,
          // v2: {observations, forecast} envelope. The version rides the key
          // so a shape change never serves an hour of stale-shape cache.
          `airnow:v2:${lat},${lon}`,
          async () => {
            const [o, f] = await Promise.all([fetch(obs), fetch(fc)])
            if (!o.ok) return o
            // A dead forecast endpoint must not take the observations down.
            const observations = await o.json()
            const forecast = f.ok ? await f.json() : []
            return new Response(JSON.stringify({ observations, forecast }), {
              headers: { 'content-type': 'application/json' },
            })
          },
          cors,
        )
      }

      // Outdoor PurpleAir sensors in the grid cell — hyperlocal PM where
      // AirNow's network is sparse.
      case '/v1/purpleair': {
        const u = new URL('https://api.purpleair.com/v1/sensors')
        u.search = new URLSearchParams({
          fields: 'name,latitude,longitude,pm2.5_10minute,pm2.5_60minute',
          location_type: '0',
          max_age: '3600',
          nwlat: String(Number(lat) + 0.05),
          nwlng: String(Number(lon) - 0.05),
          selat: String(Number(lat) - 0.05),
          selng: String(Number(lon) + 0.05),
        }).toString()
        return relay(
          env,
          `purpleair:${lat},${lon}`,
          () => fetch(u, { headers: { 'X-API-Key': env.PURPLEAIR_API_KEY } }),
          cors,
        )
      }

      // Google Pollen forecast — the metered one. The key rides a header, not
      // the URL, so it cannot end up in an upstream request log line.
      case '/v1/pollen': {
        const u = new URL('https://pollen.googleapis.com/v1/forecast:lookup')
        u.search = new URLSearchParams({
          'location.latitude': lat,
          'location.longitude': lon,
          days: '3',
        }).toString()
        return relay(
          env,
          `pollen:${lat},${lon}`,
          () => fetch(u, { headers: { 'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY } }),
          cors,
        )
      }

      default:
        return json({ error: 'unknown route' }, 404, cors)
    }
  },
}
