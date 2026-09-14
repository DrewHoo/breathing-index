/**
 * The AAAAI National Allergy Bureau, through the undocumented public GraphQL
 * endpoint behind pollen.aaaai.org.
 *
 * ## Read this before switching it on
 *
 * The NAB landing page states that any use of this information, in whole or in
 * part, without the prior written consent of the American Academy of Allergy,
 * Asthma & Immunology is prohibited, and the AAAAI's data-release document is
 * blunter still: as a 501(c)(3) it chooses not to release data for commercial
 * or for-profit use. The endpoint has no key, no auth and no observed rate
 * limit, and none of that is permission.
 *
 * So this module is written and shipped switched off. `MOLD_NAB_ENABLED`
 * defaults to `"0"` in `wrangler.toml` and production is expected to stay
 * there until written consent from the Scientific Director is on file. The
 * code exists now because it is small and because the licensing conversation
 * goes better with a working thing to point at, not because it is waiting for
 * someone to forget why it is off. Spec 28 §1 has the ask and the precedent to
 * cite (The Weather Company sells a licensed relay of this same data).
 *
 * ## What it returns
 *
 * Genus-level spore counts in spores/m³ for 19 mold-active US stations, back
 * to 1998 — roughly 55–60% of the world's retrievable public mold behind one
 * endpoint, and more than the NAB's own website shows: stations whose public
 * page renders only Low/High still return raw counts here.
 *
 * ## The two sharp edges
 *
 * `filter` is a dynamic-LINQ *string*, not a GraphQL argument tree. It is
 * concatenated into the query, so the station id is validated as a GUID before
 * it goes anywhere near it — every id in this relay comes from
 * `stations.ts`, and that is exactly the kind of invariant that stops being
 * true one refactor later. Quoted ISO dates break the LINQ parser, hence
 * `DateTime(y,m,d)`.
 *
 * A collection set is a day's whole slide, so pollen and mold rows arrive
 * interleaved and only `allergen.category == "MOLD"` is a spore.
 */
import { type MoldObservation, genusSlug } from './reading'

export const NAB_ENDPOINT = 'https://pollen.aaaai.org/graphql/public'

/** The endpoint's own id shape. A station id that is not this never reaches
 * the filter string. */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * How far back to look for a set. Wide enough that a station counting mold
 * weekly, or one whose reader was out on Monday, still answers; the reading
 * carries the date it actually has, and the client's own staleness rule
 * (spec 28 §6: older than 3 days is `estimated`, and the row shows the date)
 * is what decides whether that is worth showing.
 */
export const NAB_LOOKBACK_DAYS = 30

/**
 * How many sets to ask for. Not one: the newest set for a station can be a
 * pollen-only day at a station that counts mold most days, and answering
 * "no mold reading" because the most recent slide happened to have none would
 * be wrong in a way nobody would ever notice. Five days back covers a
 * weekend plus a holiday.
 */
const SET_LIMIT = 5

/** `2026-08-15` → `DateTime(2026,8,15)`, the only date literal the LINQ parser
 * accepts here. */
export function nabQuery(stationId: string, since: Date): string {
  if (!GUID.test(stationId)) throw new Error('nab station id is not a guid')
  const y = since.getUTCFullYear()
  const m = since.getUTCMonth() + 1
  const d = since.getUTCDate()
  const filter = `stationId == Guid(\\"${stationId}\\") && date >= DateTime(${y},${m},${d})`
  return `{ allergenCollectionSets(limit: ${SET_LIMIT}, order: "date desc", filter: "${filter}") { date station { name } allergenCollections { value allergen { name commonName category type } } } }`
}

interface NabCollection {
  value?: unknown
  allergen?: { name?: unknown; category?: unknown } | null
}

interface NabSet {
  date?: unknown
  allergenCollections?: unknown
}

/**
 * The newest set that actually carries mold, as a reading.
 *
 * Null when the response holds no dated mold set — a station that has gone
 * quiet, a filter that matched nothing, or a GraphQL error document. The route
 * turns that into a 502 rather than a reading, for the reason `reading.ts`
 * gives: an undated number is indistinguishable from a page frozen four years
 * ago.
 */
export function parseNabSets(payload: unknown): MoldObservation | null {
  const sets = (payload as { data?: { allergenCollectionSets?: unknown } } | null)?.data
    ?.allergenCollectionSets
  if (!Array.isArray(sets)) return null

  for (const set of sets as NabSet[]) {
    const date = typeof set?.date === 'string' ? set.date.slice(0, 10) : ''
    // The API has at least one record dated `0202-11-05`. A date that is not
    // a plausible ISO day is not a date.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1990-01-01') continue

    const rows = set.allergenCollections
    if (!Array.isArray(rows)) continue

    const genera: Record<string, number> = {}
    let total: number | null = null
    for (const row of rows as NabCollection[]) {
      if (row?.allergen?.category !== 'MOLD') continue
      const name = typeof row.allergen.name === 'string' ? row.allergen.name : ''
      const value = typeof row.value === 'number' ? row.value : Number.NaN
      if (name === '' || !Number.isFinite(value)) continue
      genera[genusSlug(name)] = value
      total = (total ?? 0) + value
    }
    if (total === null) continue

    return { date, total, category: null, genera }
  }
  return null
}

/**
 * One station's newest mold set. Returns the upstream response unchanged when
 * it fails, so `relay()` passes the status through uncached the way it does
 * for a dead AirNow.
 */
export async function fetchNab(stationId: string, now = Date.now()): Promise<Response> {
  const since = new Date(now - NAB_LOOKBACK_DAYS * 86_400_000)
  const upstream = await fetch(NAB_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: nabQuery(stationId, since) }),
  })
  return upstream
}
