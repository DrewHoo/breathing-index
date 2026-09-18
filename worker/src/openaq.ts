/**
 * The pure half of `/v1/openaq` (specs/38-openaq.md): station selection from
 * a /v3/locations payload, and the sensor-id join that /v3/locations/{id}/latest
 * makes necessary — its rows carry a `sensorsId` and a value, and nothing
 * else, so the pollutant and its units come from the directory built here.
 * The fetch half lives in index.ts; this file stays Workers-type-free so the
 * root tsconfig can include it and vitest can cover it, like geo.ts and
 * purpleair.ts.
 *
 * Wire shapes are valibot schemas: every row is wrapped in a null fallback
 * so one odd element never rejects the payload, and the schema validates
 * only the fields this module reads. Business filtering — dead stations,
 * restricted licenses, the distance sort — stays in code below.
 *
 * Values pass through in the provider's own units. The same gas arrives as
 * µg/m³ from the EEA and ppm from AirNow-via-OpenAQ (research/openaq-v3.md,
 * Units), and conversion lives in the client, where it has tests.
 */
import * as v from 'valibot'

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

const finiteNumber = v.pipe(v.number(), v.finite())
const nullishString = v.fallback(v.nullish(v.string(), null), null)
/** A row that fails its schema becomes null and is skipped, never fatal. */
const rowOf = <const S extends v.GenericSchema>(schema: S) => v.fallback(v.nullable(schema), null)

const LocationSchema = v.object({
  // id and distance are load-bearing: without either the row is useless,
  // so their failure nulls the row instead of falling back.
  id: finiteNumber,
  distance: finiteNumber,
  name: nullishString,
  isMonitor: v.fallback(v.boolean(), false),
  isMobile: v.fallback(v.boolean(), false),
  datetimeLast: v.fallback(v.nullish(v.object({ utc: v.string() }), null), null),
  provider: v.fallback(v.nullish(v.object({ name: nullishString }), null), null),
  licenses: v.fallback(
    v.nullish(
      v.array(
        rowOf(
          v.object({
            id: v.fallback(v.nullish(finiteNumber, null), null),
            name: nullishString,
            attribution: v.fallback(
              v.nullish(v.object({ name: nullishString, url: nullishString }), null),
              null,
            ),
          }),
        ),
      ),
      [],
    ),
    [],
  ),
  sensors: v.fallback(
    v.nullish(
      v.array(rowOf(v.object({ id: finiteNumber, parameter: v.object({ name: v.string(), units: v.string() }) }))),
      [],
    ),
    [],
  ),
})

const LocationsPayload = v.object({ results: v.array(rowOf(LocationSchema)) })

const LatestPayload = v.object({
  results: v.array(
    rowOf(
      v.object({
        sensorsId: finiteNumber,
        value: finiteNumber,
        datetime: v.object({ utc: v.string() }),
      }),
    ),
  ),
})

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

/**
 * The nearest usable reference monitors from a /v3/locations payload:
 * `monitor=true` was on the request, so what's filtered here is what the API
 * can't filter — mobile units, restricted licenses, stations dead for a
 * week — plus the distance sort the API refuses to do (its only sort field
 * is `id`).
 */
export function pickStations(body: unknown, nowMs: number): OaqStation[] {
  const parsed = v.safeParse(LocationsPayload, body)
  if (!parsed.success) return []
  const picked: OaqStation[] = []
  for (const raw of parsed.output.results) {
    if (raw === null || !raw.isMonitor || raw.isMobile) continue
    const last = raw.datetimeLast?.utc ?? null
    if (last === null || nowMs - Date.parse(last) > DEAD_STATION_MS) continue

    const licenses = raw.licenses.filter((l) => l !== null)
    if (licenses.some((l) => l.id !== null && RESTRICTED_LICENSE_IDS.has(l.id))) continue
    const license = licenses[0] ?? null

    const sensors: OaqSensor[] = []
    for (const s of raw.sensors) {
      if (s === null) continue
      const variable = VARIABLES[s.parameter.name]
      if (!variable) continue
      sensors.push({ id: s.id, variable, units: s.parameter.units })
    }
    if (sensors.length === 0) continue

    picked.push({
      id: raw.id,
      name: raw.name ?? 'monitoring station',
      provider: raw.provider?.name ?? null,
      attribution: license?.attribution?.name ?? null,
      attributionUrl: license?.attribution?.url ?? null,
      license: license?.name ?? null,
      km: Math.round((raw.distance / 1000) * 10) / 10,
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
  const parsed = v.safeParse(LatestPayload, body)
  if (!parsed.success) return []
  const byId = new Map(station.sensors.map((s) => [s.id, s]))
  const newest = new Map<string, OaqValue>()
  for (const raw of parsed.output.results) {
    if (raw === null || raw.value < 0) continue
    const sensor = byId.get(raw.sensorsId)
    if (!sensor) continue
    const utc = raw.datetime.utc
    if (nowMs - Date.parse(utc) > STALE_VALUE_MS) continue
    const cur = newest.get(sensor.variable)
    if (!cur || utc > cur.utc) {
      newest.set(sensor.variable, { variable: sensor.variable, value: raw.value, units: sensor.units, utc })
    }
  }
  return [...newest.values()]
}
