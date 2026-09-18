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
import { smokeAt } from './geo'
import { type CellSensor, cellReading, parseSensorsPayload, pickSensors } from './purpleair'
import { parseCanton } from './mold/canton'
import { newestHoustonDay, parseHoustonDay } from './mold/houston'
import { parseKansasCity } from './mold/kc'
import { fetchNab, parseNabSets } from './mold/nab'
import type { MoldObservation, MoldReading } from './mold/reading'
import { parseStlRss } from './mold/rss'
import {
  type Station,
  availableStations,
  findStation,
  nabEnabled,
  publicStation,
} from './mold/stations'

export interface Env {
  AIRNOW_API_KEY: string
  GOOGLE_MAPS_API_KEY: string
  /**
   * Optional, and its absence gates the route (403), the NAB pattern: the
   * points behind this key are granted once and never refresh, so nothing
   * spends them until a key is deliberately set.
   */
  PURPLEAIR_API_KEY?: string
  /**
   * `"1"` switches on the AAAAI National Allergy Bureau stations, and nothing
   * else does. It is a licence term rather than a preference — see
   * `mold/nab.ts` — and `wrangler.toml` pins it to `"0"` for production.
   */
  MOLD_NAB_ENABLED?: string
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

/**
 * Mold is the slow one. Counting stations post once a weekday morning — a
 * technician reads a slide and types a number into a web page — so an hourly
 * refetch would be six pointless scrapes a day of somebody's health department
 * site. Six hours keeps every user of one station to four fetches a day, and
 * still picks up the morning's post within half a working morning.
 */
const MOLD_TTL = 6 * 3600

/** The station directory is a constant in this worker's source; a day of KV is
 * about sparing the parse, and about the flag flip below being the only thing
 * that can change the answer. */
const STATIONS_TTL = 24 * 3600

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
  ttl = TTL,
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
  await env.CACHE?.put(cacheKey, body, { expirationTtl: ttl })
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

/**
 * NOAA's Hazard Mapping System smoke analysis, republished hourly as GeoJSON
 * by the Forest Service's AirFire group. No key, no auth, ~230 KB, updated at
 * :37 past the hour — the one upstream here that is neither keyed nor metered,
 * and it goes through the relay anyway because a browser cannot usefully pull
 * a quarter-megabyte national file to answer one yes/no about one point.
 */
const HMS_SMOKE_URL =
  'https://airfire-data-exports.s3.us-west-2.amazonaws.com/hms/v1/geojson/latest_smoke.geojson'

/**
 * The file itself, cached under one key for the whole planet — it is national
 * and hourly, so per-cell file copies would be the same 230 KB written a dozen
 * times. The per-cell answer is cached separately by `relay()`, which is what
 * keeps the common path from parsing the file at all.
 */
const SMOKE_FILE_KEY = 'smoke:file:v1'

/**
 * One cell's smoke answer, built from the cached file when there is one.
 *
 * An upstream failure is returned as the upstream response so `relay()` passes
 * its status through uncached, exactly as a dead AirNow does. A file that
 * arrives but does not parse is *not* that case: it answers density 0 with
 * `stale`, because "the bucket served something odd" and "there is no smoke
 * claim for you" reach the client as the same silence either way, and an error
 * status would make the client retry a file that is fine for everyone else.
 */
async function smokeAnswer(env: Env, lat: string, lon: string): Promise<Response> {
  let text = (await env.CACHE?.get(SMOKE_FILE_KEY)) ?? null
  if (text === null) {
    const upstream = await fetch(HMS_SMOKE_URL)
    if (!upstream.ok) return upstream
    text = await upstream.text()
    await env.CACHE?.put(SMOKE_FILE_KEY, text, { expirationTtl: TTL })
  }
  let file: unknown = null
  try {
    file = JSON.parse(text)
  } catch {
    file = null
  }
  return new Response(
    JSON.stringify({
      ...smokeAt(file, Number(lat), Number(lon)),
      // When this answer was computed, which after an hour of KV is not when
      // it was served. The client shows the polygon's own `end` to a person;
      // this is here for the same reason `fetchedAt` is on the series — debug
      // metadata, never a freshness claim.
      fetched: new Date().toISOString(),
    }),
    { headers: { 'content-type': 'application/json' } },
  )
}

/**
 * One station's page (or two, for Houston), fetched and reduced to the
 * observation its parser found.
 *
 * An upstream failure comes back as the upstream response so `relay()` passes
 * its status through uncached, exactly as a dead AirNow does — a health
 * department's 503 is their outage, not a reading, and caching it would make
 * it ours for six hours.
 */
async function observe(station: Station): Promise<{ observation: MoldObservation } | Response> {
  switch (station.shape) {
    case 'rss': {
      const feed = await fetch(station.url)
      if (!feed.ok) return feed
      return dated(parseStlRss(await feed.text()))
    }

    // Two fetches, because Houston publishes one page per day under a
    // hand-typed slug and has no "today" URL. The index names the newest page;
    // the URL is resolved from the href the index gave, never constructed.
    case 'houston': {
      const index = await fetch(station.url)
      if (!index.ok) return index
      const newest = newestHoustonDay(await index.text())
      if (newest === null) return dated(null)
      // Resolved against the index, and pinned to its origin. The href comes
      // out of a document this worker does not control, and "follow whatever
      // link the page gave us" is how a relay becomes somebody's proxy.
      const day = new URL(newest.href, station.url)
      if (day.origin !== new URL(station.url).origin) return dated(null)
      const page = await fetch(day.toString())
      if (!page.ok) return page
      return dated(parseHoustonDay(await page.text(), day.pathname))
    }

    case 'kc': {
      const page = await fetch(station.url)
      if (!page.ok) return page
      return dated(parseKansasCity(await page.text()))
    }

    case 'canton': {
      const page = await fetch(station.url)
      if (!page.ok) return page
      return dated(parseCanton(await page.text()))
    }

    case 'nab': {
      const response = await fetchNab(station.id.slice('nab:'.length))
      if (!response.ok) return response
      // A 200 carrying an HTML error page, or a GraphQL `errors` document,
      // both land in `dated(null)` — the endpoint answering oddly is not a
      // reading either.
      let payload: unknown = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      return dated(parseNabSets(payload))
    }
  }
}

/** No date, no reading. `reading.ts` says why at length; the short version is
 * that Waterbury Hospital's count page has looked entirely normal every day
 * for four years past its last real reading. */
const dated = (observation: MoldObservation | null): { observation: MoldObservation } | Response =>
  observation === null
    ? new Response(JSON.stringify({ error: 'no date' }), {
        status: 502,
        headers: { 'content-type': 'application/json' },
      })
    : { observation }

/** The station's observation, wearing the station's own metadata: who measured
 * it, in what units, and how precisely. */
async function moldAnswer(station: Station): Promise<Response> {
  const result = await observe(station)
  if (result instanceof Response) return result
  const reading: MoldReading = {
    stationId: station.id,
    name: station.name,
    ...result.observation,
    precision: station.precision,
    units: station.units,
    fetchedAt: new Date().toISOString(),
  }
  return new Response(JSON.stringify(reading), {
    headers: { 'content-type': 'application/json' },
  })
}

/** The discovery box: ±0.15° (~17 km) around the coarse cell. Tighter than
 * AirNow's ±0.25° because a sensor twenty kilometres away is not "your air"
 * the way a regulatory monitor is a region's. */
const PURPLEAIR_BOX = 0.15

/** Sensors don't move: a week of KV per cell keeps discovery — the expensive
 * bbox query, ~205 points over an urban cell — to one call a week, and an
 * empty cell (cached just the same) to one a week too. */
const PURPLEAIR_SENSORS_TTL = 7 * 24 * 3600

const purpleAirUrl = (params: Record<string, string>): URL => {
  const u = new URL('https://api.purpleair.com/v1/sensors')
  u.search = new URLSearchParams(params).toString()
  return u
}

/** The key rides a header, like Google's — never the URL. */
const purpleAirFetch = (env: Env, u: URL): Promise<Response> =>
  fetch(u, { headers: { 'X-API-Key': env.PURPLEAIR_API_KEY ?? '' } })

/**
 * One cell's derived reading (specs/37-purpleair.md): the EPA-corrected
 * median of the nearest outdoor sensors. Raw PurpleAir rows exist only inside
 * this function — the response carries one number, a count, a distance and
 * the payload's own timestamp, which is the shape the license allows out
 * (research/purpleair-license.md).
 */
async function purpleAirAnswer(env: Env, lat: string, lon: string): Promise<Response> {
  const directoryKey = `purpleair:sensors:v1:${lat},${lon}`
  let sensors: CellSensor[] | null = null
  const cached = await env.CACHE?.get(directoryKey)
  if (cached != null) {
    try {
      sensors = JSON.parse(cached) as CellSensor[]
    } catch {
      sensors = null
    }
  }
  if (sensors === null) {
    // `max_age=86400`: a sensor silent for a day is not in anyone's air.
    // `location_type=0`: outdoor only — an indoor unit measures a living room.
    const discovery = await purpleAirFetch(
      env,
      purpleAirUrl({
        fields: 'latitude,longitude,confidence',
        location_type: '0',
        max_age: '86400',
        nwlng: (Number(lon) - PURPLEAIR_BOX).toFixed(2),
        nwlat: (Number(lat) + PURPLEAIR_BOX).toFixed(2),
        selng: (Number(lon) + PURPLEAIR_BOX).toFixed(2),
        selat: (Number(lat) - PURPLEAIR_BOX).toFixed(2),
      }),
    )
    if (!discovery.ok) return discovery
    const payload = parseSensorsPayload(await discovery.json())
    if (payload === null) return json({ error: 'unexpected upstream shape' }, 502, {})
    sensors = pickSensors(payload, Number(lat), Number(lon))
    await env.CACHE?.put(directoryKey, JSON.stringify(sensors), {
      expirationTtl: PURPLEAIR_SENSORS_TTL,
    })
  }

  const fetched = new Date().toISOString()
  if (sensors.length === 0) {
    // Absent, never zero: no usable sensor within reach is a fact about
    // coverage, and the client renders nothing rather than a 0 µg/m³.
    return new Response(
      JSON.stringify({ pm25: null, sensors: 0, nearestKm: null, time: null, fetched }),
      { headers: { 'content-type': 'application/json' } },
    )
  }

  // `max_age=3600` again on the reading: a unit that reported for discovery
  // last week but not this hour contributes silence, not a stale number.
  const reading = await purpleAirFetch(
    env,
    purpleAirUrl({
      fields: 'pm2.5_cf_1,humidity',
      show_only: sensors.map((s) => s.i).join(','),
      max_age: '3600',
    }),
  )
  if (!reading.ok) return reading
  const payload = parseSensorsPayload(await reading.json())
  if (payload === null) return json({ error: 'unexpected upstream shape' }, 502, {})
  return new Response(
    JSON.stringify({ ...cellReading(payload, sensors[0]?.km ?? null), fetched }),
    { headers: { 'content-type': 'application/json' } },
  )
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

    // Mold is the one family of routes that is not about where you are
    // (specs/28-mold.md). Counting stations are 50–100 miles apart, so a user
    // picks one by name the way they pick a saved location, and the reading is
    // the same reading for everyone who picked it. These two therefore skip
    // the coordinate gate — which would otherwise 400 them for the crime of
    // not sending a location — and keep the origin gate above. Nothing below
    // this point learns anything about anybody.
    if (url.pathname === '/v1/mold/stations') {
      const flag = env.MOLD_NAB_ENABLED
      return relay(
        env,
        // The flag rides the key. Turning the NAB on and then serving a day of
        // the old menu would be a support ticket nobody could reproduce.
        `mold:stations:v1:${nabEnabled(flag) ? 'nab' : 'local'}`,
        async () =>
          new Response(JSON.stringify(availableStations(flag).map(publicStation)), {
            headers: { 'content-type': 'application/json' },
          }),
        cors,
        STATIONS_TTL,
      )
    }

    if (url.pathname === '/v1/mold') {
      const station = findStation(url.searchParams.get('station') ?? '')
      // An id this relay does not have is a 404 and never an empty reading:
      // the client must be able to tell "your saved station is gone" from
      // "your station has nothing today".
      if (station === null) return json({ error: 'unknown station' }, 404, cors)
      if (station.gated === true && !nabEnabled(env.MOLD_NAB_ENABLED)) {
        return json({ error: 'nab disabled' }, 403, cors)
      }
      // One key per station, six hours: N users of one station cost one fetch,
      // which is the promise made to a health department whose page this is.
      return relay(env, `mold:v1:${station.id}`, () => moldAnswer(station), cors, MOLD_TTL)
    }

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
          // SO₂ joins the three in spec 29: it is the acute asthma trigger
          // with the sharpest controlled-exposure literature behind it, and
          // the New Haven monitor reports it hourly. AirNow serves it in PPB;
          // the client converts (specs/29-sulfur-dioxide.md).
          parameters: 'OZONE,PM25,PM10,SO2',
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
          // v4: the same rows with SO₂ among the parameters. The version
          // rides the key so a shape change never serves an hour of
          // stale-shape cache — and a cached v3 payload is exactly that, a
          // payload with a column missing rather than a column at zero.
          // v3 was aq/data/ without SO₂; v2, the retired reporting-area
          // observation endpoints.
          `airnow:v4:${lat},${lon}`,
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

      // The nearest outdoor PurpleAir sensors, reduced to one corrected
      // median (specs/37-purpleair.md). Gated on the key: the points behind
      // it are a one-time grant, so an unconfigured relay refuses rather
      // than failing upstream. The hour of KV on the answer plus the week on
      // the sensor directory (inside purpleAirAnswer) is the point budget.
      case '/v1/purpleair': {
        if (!env.PURPLEAIR_API_KEY) return json({ error: 'purpleair disabled' }, 403, cors)
        return relay(env, `purpleair:v1:${lat},${lon}`, () => purpleAirAnswer(env, lat, lon), cors)
      }

      // Is there smoke over this cell, and how thick (specs/25-smoke-variable.md).
      // The answer is the densest HMS plume containing the cell centre, with
      // the window that plume was observed in — satellite smoke detection needs
      // daylight, so overnight the newest analysis is yesterday afternoon's and
      // the client has to be able to say "as of".
      //
      // Two caches, one hour each: the national file under one key, this cell's
      // answer under its own. The second is what matters — point-in-polygon
      // over 114 plumes is cheap, but parsing 230 KB of GeoJSON on every home
      // screen is not.
      case '/v1/smoke':
        return relay(env, `smoke:v1:${lat},${lon}`, () => smokeAnswer(env, lat, lon), cors)

      default:
        return json({ error: 'unknown route' }, 404, cors)
    }
  },
}
