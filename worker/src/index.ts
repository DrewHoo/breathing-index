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

/** Half-width of the AirNow bounding box: ±0.25° is about the 50-mile radius
 * the retired lat/long endpoints searched, and it is drawn around the coarse
 * cell the relay was given rather than around anyone's actual position. */
const BBOX_DEGREES = 0.25

/** AirNow wants `YYYY-MM-DDTHH`, always UTC, hour resolution. */
const airNowHour = (ms: number): string => new Date(ms).toISOString().slice(0, 13)

/** How far back the observation window reaches. The client needs 24 hours to
 * decide whether the monitors cover its exposure vector and 48 to draw the
 * air table's sparkline, so 48 it is — one request either way. */
const OBSERVATION_HOURS = 48

/**
 * Today's reporting-area forecast, which exists here only to carry `ActionDay`
 * — the one thing AirNow publishes that no concentration can be derived from.
 *
 * The path is `aq/forecast/current/`, the survivor of the September 2026
 * retirement: the docs call it "Current Forecasts By Reporting Area, Lat/Long,
 * or Zip Code" but link it behind a login, so it was found by probing. Every
 * other plausible spelling (`aq/forecast/reportingArea/` and friends) 302s to
 * the docs site, which is what this host does with an unknown path. Its rows
 * are camelCase — `reportingArea`, `actionDay` — where the retired lat/long
 * forecast returned PascalCase, so the client parses this shape and no other.
 */
function forecastRequest(env: Env, lat: string, lon: string): Request {
  const u = new URL('https://www.airnowapi.org/aq/forecast/current/')
  u.search = new URLSearchParams({
    format: 'application/json',
    latitude: lat,
    longitude: lon,
    distance: '50',
    API_KEY: env.AIRNOW_API_KEY,
  }).toString()
  return new Request(u)
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
      // AirNow's monitoring-site observations plus today's reporting-area
      // forecast, one payload, one cache entry. The observations are the
      // interesting half: `aq/data/` returns a row per monitor per hour with
      // the *raw* concentration alongside the AQI point, which is what lets
      // the client run its own window features off station data rather than
      // walking AQI points back to micrograms. The forecast rows ride along
      // only because they are where AirNow says whether today is an official
      // Action Day. Parsing lives in the client, where it has tests.
      //
      // Both services are capped at 500 requests per hour, per key, per
      // service, and the cap cannot be raised — the hour of KV below is what
      // keeps a grid cell to one call an hour, well under it.
      case '/v1/airnow': {
        const now = Date.now()
        const obs = new URL('https://www.airnowapi.org/aq/data/')
        obs.search = new URLSearchParams({
          format: 'application/json',
          // minLon,minLat,maxLon,maxLat around the coarse cell.
          BBOX: [
            (Number(lon) - BBOX_DEGREES).toFixed(2),
            (Number(lat) - BBOX_DEGREES).toFixed(2),
            (Number(lon) + BBOX_DEGREES).toFixed(2),
            (Number(lat) + BBOX_DEGREES).toFixed(2),
          ].join(','),
          parameters: 'OZONE,PM25,PM10',
          // B = both the AQI point and the concentration behind it.
          dataType: 'B',
          includerawconcentrations: '1',
          // Site name and coordinates per row — how the client picks the
          // nearest monitor for each parameter and names it on the row.
          verbose: '1',
          // Permanent monitors only; mobile and temporary units move between
          // hours, so a series from one is not a series of one place.
          monitorType: '0',
          startDate: airNowHour(now - OBSERVATION_HOURS * 3_600_000),
          endDate: airNowHour(now),
          API_KEY: env.AIRNOW_API_KEY,
        }).toString()
        return relay(
          env,
          // v3: aq/data/ rows and camelCase forecast rows. The version rides
          // the key so a shape change never serves an hour of stale-shape
          // cache — v2 was the retired reporting-area observation endpoints.
          `airnow:v3:${lat},${lon}`,
          async () => {
            const [o, f] = await Promise.all([fetch(obs), fetch(forecastRequest(env, lat, lon))])
            if (!o.ok) return o
            // A dead forecast endpoint must not take the observations down —
            // and "dead" includes a 200 carrying `{WebServiceError: [...]}`,
            // which is how AirNow says a reporting area has no forecast
            // issued today (verified in Anchorage). Both halves are normalised
            // to arrays here so the client never has to ask what shape it got.
            const observations = await o.json()
            const forecast = f.ok ? await f.json() : []
            return new Response(
              JSON.stringify({
                observations: Array.isArray(observations) ? observations : [],
                forecast: Array.isArray(forecast) ? forecast : [],
              }),
              {
                headers: { 'content-type': 'application/json' },
              },
            )
          },
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
