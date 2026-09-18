/**
 * The pure half of `/v1/openaq` (specs/38-openaq.md): station selection from
 * a /v3/locations payload, and the sensor-id join that /v3/locations/{id}/latest
 * makes necessary — its rows carry a `sensorsId` and a value, and nothing
 * else, so the pollutant and its units come from the directory built here.
 * The fetch half lives in index.ts; this file stays Workers-type-free so the
 * root tsconfig can include it and vitest can cover it, like geo.ts and
 * purpleair.ts.
 *
 * Values pass through in the provider's own units. The same gas arrives as
 * µg/m³ from the EEA and ppm from AirNow-via-OpenAQ (research/openaq-v3.md,
 * Units), and conversion lives in the client, where it has tests.
 */

/** The four monitor variables the app tracks, by OpenAQ's parameter name. */
const VARIABLES: Record<string, string> = {
  pm25: 'pm25',
  pm10: 'pm10',
  o3: 'o3',
  so2: 'so2',
}

/**
 * Licenses whose terms the relay won't carry: today only the ACT
 * Government's (no modification, no commercial use). Extend from
 * /v3/licenses if more `modificationAllowed: false` rows appear there —
 * dropping a station is cheaper than reasoning about its license at
 * display time.
 */
export const RESTRICTED_LICENSE_IDS: ReadonlySet<number> = new Set([37])

/** Three stations per cell: enough that the nearest being stale doesn't
 * empty the cell, few enough that a cold cell is 4 upstream calls against
 * the 2,000/hour key limit. */
export const STATIONS_PER_CELL = 3

/** A station silent this long at discovery never enters the directory —
 * /latest happily serves a value from 2019 otherwise. */
const DEAD_STATION_MS = 7 * 24 * 3_600_000

/** A value older than this at read time is dropped: "latest" is the last
 * value in the series, which is not a claim about recency. */
const STALE_VALUE_MS = 24 * 3_600_000

export interface OaqSensor {
  id: number
  variable: string
  units: string
}

/** One directory entry, precomputed so the reading phase joins locally.
 * Station ids are stable (research/openaq-v3.md, Gotchas) and this whole
 * shape lives only in KV. */
export interface OaqStation {
  id: number
  name: string
  provider: string | null
  attribution: string | null
  attributionUrl: string | null
  license: string | null
  km: number
  sensors: OaqSensor[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

const finite = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/**
 * The nearest usable reference monitors from a /v3/locations payload:
 * `monitor=true` was on the request, so what's filtered here is what the API
 * can't filter — mobile units, null coordinates, restricted licenses,
 * stations dead for a week — plus the distance sort the API refuses to do
 * (its only sort field is `id`).
 */
export function pickStations(body: unknown, nowMs: number): OaqStation[] {
  if (!isRecord(body) || !Array.isArray(body.results)) return []
  const picked: OaqStation[] = []
  for (const raw of body.results) {
    if (!isRecord(raw)) continue
    if (raw.isMonitor !== true || raw.isMobile === true) continue
    const id = finite(raw.id)
    const distance = finite(raw.distance)
    if (id === null || distance === null) continue
    const last = isRecord(raw.datetimeLast) ? str(raw.datetimeLast.utc) : null
    if (last === null || nowMs - Date.parse(last) > DEAD_STATION_MS) continue

    const licenses = Array.isArray(raw.licenses) ? raw.licenses.filter(isRecord) : []
    if (licenses.some((l) => typeof l.id === 'number' && RESTRICTED_LICENSE_IDS.has(l.id))) continue
    const license = licenses[0]
    const attribution = license && isRecord(license.attribution) ? license.attribution : null

    const sensors: OaqSensor[] = []
    for (const s of Array.isArray(raw.sensors) ? raw.sensors : []) {
      if (!isRecord(s) || !isRecord(s.parameter)) continue
      const sensorId = finite(s.id)
      const name = str(s.parameter.name)
      const units = str(s.parameter.units)
      if (sensorId === null || name === null || units === null) continue
      const variable = VARIABLES[name]
      if (!variable) continue
      sensors.push({ id: sensorId, variable, units })
    }
    if (sensors.length === 0) continue

    picked.push({
      id,
      name: str(raw.name) ?? 'monitoring station',
      provider: isRecord(raw.provider) ? str(raw.provider.name) : null,
      attribution: attribution ? str(attribution.name) : null,
      attributionUrl: attribution ? str(attribution.url) : null,
      license: license ? str(license.name) : null,
      km: Math.round((distance / 1000) * 10) / 10,
      sensors,
    })
  }
  picked.sort((a, b) => a.km - b.km)
  return picked.slice(0, STATIONS_PER_CELL)
}

export interface OaqValue {
  variable: string
  value: number
  units: string
  utc: string
}

/**
 * One station's /latest rows joined against its directory sensors: newest
 * fresh value per variable, in the provider's units. Rows for sensors the
 * directory doesn't carry (co, no2, humidity…) fall out here.
 */
export function latestValues(body: unknown, station: OaqStation, nowMs: number): OaqValue[] {
  if (!isRecord(body) || !Array.isArray(body.results)) return []
  const byId = new Map(station.sensors.map((s) => [s.id, s]))
  const newest = new Map<string, OaqValue>()
  for (const raw of body.results) {
    if (!isRecord(raw)) continue
    const sensor = byId.get(finite(raw.sensorsId) ?? -1)
    const value = finite(raw.value)
    const utc = isRecord(raw.datetime) ? str(raw.datetime.utc) : null
    if (!sensor || value === null || value < 0 || utc === null) continue
    if (nowMs - Date.parse(utc) > STALE_VALUE_MS) continue
    const cur = newest.get(sensor.variable)
    if (!cur || utc > cur.utc) {
      newest.set(sensor.variable, { variable: sensor.variable, value, units: sensor.units, utc })
    }
  }
  return [...newest.values()]
}
