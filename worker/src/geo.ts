/**
 * Point-in-polygon over NOAA's Hazard Mapping System smoke analysis, and the
 * `YYYYDDD HHMM` stamps it carries.
 *
 * This module exists apart from `index.ts` for one reason: it is the only part
 * of the smoke route with real logic in it, and it should be testable without
 * a Workers runtime. Nothing here imports a Cloudflare type, touches `fetch`,
 * or knows what a request is — it takes the parsed file and a coordinate and
 * answers a question. `src/geo.test.ts` runs it in plain node off the root
 * vitest config.
 *
 * What HMS actually publishes: an analyst-drawn polygon per smoke plume per
 * satellite pass, with `Density` as one of three numeric codes and `Start` /
 * `End` bracketing the imagery the plume was drawn from. Plumes overlap — a
 * point in Chicago on 2026-09-13 sat under two separate Light polygons — so
 * "the density here" is the *worst* polygon containing the point, never the
 * first one found.
 */

/** GeoJSON is [lon, lat], always, and mixing that up is a silent bug. */
type Position = number[]

/** A polygon's rings: the first is the outline, the rest are holes. */
type Rings = Position[][]

interface Geometry {
  type?: string
  coordinates?: unknown
}

interface Feature {
  geometry?: Geometry
  properties?: { Density?: unknown; Start?: unknown; End?: unknown }
}

/** The app's 0–3 scale: 0 is "no plume here", not "no data". */
export type Density = 0 | 1 | 2 | 3

/**
 * HMS's `Density` codes, verified against the live file on 2026-09-14: three
 * values and nothing between them. They are not a scale — 5, 16 and 21 are
 * labels — so they are mapped rather than arithmetic'd, and a code that is
 * none of the three is skipped. Inventing a rank for an unrecognised number
 * would be the one failure mode this whole route cannot afford: a density
 * nobody published, gated into someone's exposure vector.
 */
const DENSITY_CODES: Record<number, Density> = { 5: 1, 16: 2, 21: 3 }

/**
 * Ray casting, with the rings after the first treated as holes. A horizontal
 * ray from the point crosses the outline an odd number of times when the point
 * is inside it; a point inside a hole is inside the outline too, so the holes
 * are checked second and take the answer back.
 *
 * Points exactly on an edge are undefined behaviour here and deliberately not
 * worried about: the polygons are analyst-drawn plume outlines at synoptic
 * scale, and a coordinate rounded to 0.1° (~11 km) before it ever reaches this
 * worker cannot meaningfully land on one.
 */
export function pointInRing(lon: number, lat: number, ring: Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (!a || !b) continue
    const [ax, ay] = [a[0] ?? 0, a[1] ?? 0]
    const [bx, by] = [b[0] ?? 0, b[1] ?? 0]
    if (ay > lat !== by > lat && lon < ((bx - ax) * (lat - ay)) / (by - ay) + ax) {
      inside = !inside
    }
  }
  return inside
}

/** Inside the outline and outside every hole. */
export function pointInPolygon(lon: number, lat: number, rings: Rings): boolean {
  const outline = rings[0]
  if (!outline || !pointInRing(lon, lat, outline)) return false
  return !rings.slice(1).some((hole) => pointInRing(lon, lat, hole))
}

/**
 * Every polygon in a geometry. The live file is all `Polygon`, but HMS is
 * generated rather than hand-typed and a plume that crosses the antimeridian
 * or gets split by a satellite sector boundary comes back as a `MultiPolygon`
 * — which would otherwise read as "no smoke" rather than as an error.
 */
function polygonsOf(geometry: Geometry | undefined): Rings[] {
  const coordinates = geometry?.coordinates
  if (!Array.isArray(coordinates)) return []
  if (geometry?.type === 'Polygon') return [coordinates as Rings]
  if (geometry?.type === 'MultiPolygon') return coordinates as Rings[]
  return []
}

/**
 * `"2026256 1200"` — year, day-of-year, UTC hour and minute — as an ISO
 * instant. Returns null for anything that is not that shape, because the
 * client prints this string to a person as "as of 8 am" and a half-parsed
 * stamp is worse than no stamp.
 */
export function hmsInstant(stamp: unknown): string | null {
  if (typeof stamp !== 'string') return null
  const match = /^(\d{4})(\d{3})\s+(\d{2})(\d{2})$/.exec(stamp.trim())
  if (!match) return null
  const [, year, dayOfYear, hour, minute] = match
  const day = Number(dayOfYear)
  if (day < 1 || day > 366) return null
  const ms =
    Date.UTC(Number(year), 0, 1) +
    (day - 1) * 86_400_000 +
    Number(hour) * 3_600_000 +
    Number(minute) * 60_000
  return new Date(ms).toISOString()
}

export interface SmokeAnswer {
  density: Density
  /** when the imagery this plume was drawn from begins, ISO UTC */
  start: string | null
  /** …and ends. The client says "as of" with it: smoke detection needs
   * daylight, so overnight the newest analysis is yesterday afternoon's. */
  end: string | null
  /** the file was not a feature collection this code recognises */
  stale?: true
}

/**
 * The densest plume over this point, and the window it was observed in.
 *
 * A file that parses to something other than a list of features answers
 * density 0 with `stale` set rather than throwing: an S3 object mid-rewrite,
 * or a bucket serving an error page with a 200, must degrade to "no smoke
 * claim" and not to a broken screen. The client treats a stale answer the way
 * it treats a missing one.
 */
export function smokeAt(file: unknown, lat: number, lon: number): SmokeAnswer {
  const features = (file as { features?: unknown } | null)?.features
  if (!Array.isArray(features) || features.length === 0) {
    return { density: 0, start: null, end: null, stale: true }
  }
  let answer: SmokeAnswer = { density: 0, start: null, end: null }
  for (const feature of features as Feature[]) {
    const code = feature?.properties?.Density
    const density = typeof code === 'number' ? DENSITY_CODES[code] : undefined
    // Overlapping plumes are the norm, so only a *worse* one can replace the
    // standing answer — and its own start/end travel with it, because "Heavy,
    // as of 3 pm" has to describe one polygon and not two.
    if (density === undefined || density <= answer.density) continue
    if (!polygonsOf(feature.geometry).some((rings) => pointInPolygon(lon, lat, rings))) continue
    answer = {
      density,
      start: hmsInstant(feature.properties?.Start),
      end: hmsInstant(feature.properties?.End),
    }
  }
  return answer
}
