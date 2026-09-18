/**
 * Measured mold spores, from a counting station the user picked by name.
 *
 * There is no mold API. No vendor sells a trap-derived spore number
 * (`research/mold-sources.md` is the sweep that establishes it), and every
 * pollen API — Google, Ambee, Tomorrow.io, Open-Meteo — is a model with no
 * mold field at all. What exists is a scatter of health departments, hospitals
 * and clinics that post a number on a web page once a weekday morning, so the
 * relay scrapes them, one module per publishing shape, and answers a
 * normalised reading (`worker/src/mold/`). This module is the client half:
 * the directory, the fetch, the nearest-first sort the relay deliberately does
 * not do, and the memory that gives the 3-day window a past to look at.
 *
 * Counting stations are 50–100 miles apart, which is why a station is a
 * *choice* rather than a grid cell. A person in Hamden has no station at all;
 * a person in Houston has one four miles away. There is no honest way to
 * interpolate between those two facts, so Settings asks (specs/28-mold.md §5).
 *
 * Three properties of the relay's contract shape everything below, and each of
 * them is a live case rather than a hypothetical:
 *
 * 1. **Genus keys are the station's own vocabulary, not a taxonomy.** Houston
 *    writes `Dreshslera/Helminthosporium`, the NAB writes `Drechslera`, and
 *    the relay slugs both faithfully rather than picking a winner. So the
 *    client's genus map matches *exact* keys and ignores everything else.
 * 2. **Some keys are combined buckets.** Children's Mercy publishes
 *    `alternaria_aspergillus_penicillium` as one number — 378 spores of three
 *    genera, and no way to know how many were Alternaria. Houston publishes
 *    `penicillium_aspergillus` the same way. A combined bucket must never feed
 *    a genus variable: `mold_alternaria: 378` there would be a number this app
 *    invented.
 * 3. **A total of null with a valid date is a reading.** Canton goes quiet out
 *    of season and says so with a date; that is "nothing counted today", which
 *    is a different claim from "the scraper failed" and a different claim
 *    again from zero spores.
 */
import * as v from 'valibot'
import { RELAY_BASE } from './relay'

/** What the relay's directory says about one station — `publicStation` in
 * `worker/src/mold/stations.ts`, which is every field except how it is
 * fetched. */
export interface MoldStation {
  id: string
  name: string
  city: string
  state: string
  lat: number
  lon: number
  /** `weekdays-seasonal` means the station stops counting in winter and its
   * page goes quiet without breaking — "no reading today", not "station
   * down". */
  cadence: 'weekdays' | 'weekdays-seasonal'
  precision: 'count' | 'category'
  units: 'spores/m3' | 'count'
  genusLevel: boolean
  /** Genus slugs this source has been seen to publish. Indicative and
   * sometimes empty: Children's Mercy publishes a rotating *top five*. */
  genera: string[]
}

/** One station's answer for one day, as that station stated it. */
export interface MoldReading {
  stationId: string
  name: string
  /** `YYYY-MM-DD`, the station's own local day. Never inferred: a page with no
   * date is a failed fetch at the relay and never reaches here. */
  date: string
  /** Null when the station stated a date and no number. Not zero, and not a
   * failure. */
  total: number | null
  /** The publisher's own band ("LOW", "Very High"), verbatim. */
  category: string | null
  /** Genus slug → count, in the station's own vocabulary. */
  genera: Record<string, number>
  precision: 'count' | 'category'
  units: 'spores/m3' | 'count'
  fetchedAt?: string
}

/**
 * The two genus counts this app grades, and the exact keys that produce them.
 *
 * Alternaria and Cladosporium, and nothing else, because they are the two with
 * an asthma literature behind them: O'Hollaren 1991 put Alternaria sensitivity
 * and near-fatal asthma at OR 190 (a terrible interval and a robust
 * direction), and Cladosporium is the one the UK's 2023 Leicester event
 * centred on. Every other row on a station's page — ascospores,
 * basidiospores, rusts, smuts — is counted, published and, as far as the acute
 * asthma evidence goes, unclaimed. They ride in `total` and get no variable.
 *
 * Matched exactly, never by prefix or substring, and this is the whole reason
 * the map exists rather than a regex:
 *
 * - `ascospores` (Houston) and `ascospores_undifferentiated` (NAB) are the
 *   same taxon under two spellings, which is what "the station's own
 *   vocabulary" means in practice;
 * - `alternaria_aspergillus_penicillium` (Children's Mercy) starts with
 *   "alternaria" and is *three genera in one bucket*. A prefix match would
 *   have filed 378 spores of a mixed bucket as an Alternaria count — a number
 *   nobody measured, standing behind a bound the engine would then learn.
 */
const GENUS_VARIABLES: Readonly<Record<string, string>> = {
  alternaria: 'mold_alternaria',
  cladosporium: 'mold_cladosporium',
}

/** The engine variable for a station's genus key, or null when the key is one
 * this app does not grade — a taxon with no evidence behind it, or a combined
 * bucket that cannot honestly be split. */
export const genusVariable = (key: string): string | null => GENUS_VARIABLES[key] ?? null

/** Genus counts from one reading, keyed by engine variable. Empty for a
 * total-only station, which is most of them. */
export function genusExposure(reading: MoldReading): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, count] of Object.entries(reading.genera)) {
    const variable = genusVariable(key)
    if (variable !== null && Number.isFinite(count)) out[variable] = count
  }
  return out
}

/* --- the directory --- */

const STATIONS_KEY = 'breathing-index.moldStations.v1'

/**
 * How long the directory is good for. A station list changes when a health
 * department stops counting or the relay learns a new shape — a deploy, not a
 * morning — so a day is generous and still means the Settings screen opens
 * without a network round trip.
 */
const STATIONS_TTL_MS = 24 * 3_600_000

interface StationCache {
  at: number
  stations: MoldStation[]
}

/**
 * One directory row. Identity and coordinates are load-bearing; the rest
 * falls back to the same defaults `fetchMold` normalizes to, so a directory
 * from a worker one field ahead of this client still lists its stations
 * rather than hiding them.
 */
const StationSchema = v.object({
  id: v.string(),
  name: v.string(),
  lat: v.pipe(v.number(), v.finite()),
  lon: v.pipe(v.number(), v.finite()),
  city: v.fallback(v.string(), ''),
  state: v.fallback(v.string(), ''),
  cadence: v.fallback(v.picklist(['weekdays', 'weekdays-seasonal']), 'weekdays'),
  precision: v.fallback(v.picklist(['count', 'category']), 'count'),
  units: v.fallback(v.picklist(['spores/m3', 'count']), 'spores/m3'),
  genusLevel: v.fallback(v.boolean(), false),
  genera: v.fallback(v.array(v.string()), []),
})

const StationsSchema = v.array(v.fallback(v.nullable(StationSchema), null))

const parseStations = (body: unknown): MoldStation[] => {
  const parsed = v.safeParse(StationsSchema, body)
  return parsed.success ? parsed.output.filter((s) => s !== null) : []
}

function readStationCache(): StationCache | null {
  try {
    const raw = localStorage.getItem(STATIONS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StationCache>
    if (!Array.isArray(parsed.stations) || typeof parsed.at !== 'number') return null
    return { at: parsed.at, stations: parseStations(parsed.stations) }
  } catch {
    // No storage, private mode, or a shape written by a version that thought
    // differently. The directory is one fetch away.
    return null
  }
}

/**
 * The station directory, cached for a day.
 *
 * A stale cache beats an empty menu: on a failed fetch this answers with
 * whatever it last saw, however old, because the alternative is a Settings
 * screen that forgets the station the user already picked. Only a browser that
 * has never seen the directory gets an empty list, and that one is honestly
 * empty.
 */
export async function fetchMoldStations(): Promise<MoldStation[]> {
  const cached = readStationCache()
  if (cached && Date.now() - cached.at < STATIONS_TTL_MS) return cached.stations
  try {
    const res = await fetch(`${RELAY_BASE}/v1/mold/stations`)
    if (!res.ok) return cached?.stations ?? []
    const stations = parseStations(await res.json())
    if (stations.length === 0) return cached?.stations ?? []
    try {
      localStorage.setItem(STATIONS_KEY, JSON.stringify({ at: Date.now(), stations }))
    } catch {
      /* quota, or no storage: the list still answers this session */
    }
    return stations
  } catch {
    return cached?.stations ?? []
  }
}

/* --- nearest first --- */

/** A station with how far away it is. */
export interface NearbyStation extends MoldStation {
  km: number
}

const EARTH_RADIUS_KM = 6371

const radians = (deg: number): number => (deg * Math.PI) / 180

/** Great-circle distance in kilometres. Stations are 50–100 miles apart, so
 * nothing here is sensitive to the ellipsoid the sphere is standing in for. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = radians(lat2 - lat1)
  const dLon = radians(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * How close two rows have to be before they are one trap. Station coordinates
 * are published to two decimals (~1 km), so two rows describing the same
 * building can differ by a kilometre of rounding without being two places.
 */
const SAME_TRAP_KM = 2

/** Gated rows are the AAAAI National Allergy Bureau's, and the relay spells
 * them `nab:<guid>`. The client has no `gated` field — the flag answers by
 * presence — so the id prefix is how it knows. */
const isNab = (station: MoldStation): boolean => station.id.startsWith('nab:')

/**
 * Every station, nearest first, with one row per trap.
 *
 * Houston and St. Louis are both a local health department *and* an NAB
 * station: with `MOLD_NAB_ENABLED` on, the directory holds two rows for one
 * microscope, and they disagree about genus spelling and occasionally about
 * which day they are reporting. Offering both would be asking the user a
 * question about the relay's plumbing. The ungated row wins, because it is the
 * one that survives the flag going off — a user whose saved station vanished
 * on a config change would lose their mold history to a scale change they
 * never made (see the station-switch note in engine/config.ts).
 */
export function nearestStations(
  stations: readonly MoldStation[],
  lat: number,
  lon: number,
): NearbyStation[] {
  const ranked = stations
    .map((station) => ({ ...station, km: haversineKm(lat, lon, station.lat, station.lon) }))
    // Distance decides; on a tie — which is exactly what two rows for one trap
    // produce — the ungated row sorts first, so it is the one that gets kept.
    .sort((a, b) => a.km - b.km || Number(isNab(a)) - Number(isNab(b)))
  const kept: NearbyStation[] = []
  for (const station of ranked) {
    const twin = kept.some((k) => haversineKm(k.lat, k.lon, station.lat, station.lon) <= SAME_TRAP_KM)
    if (!twin) kept.push(station)
  }
  return kept
}

const KM_PER_MILE = 1.609344

/** Distance for the Settings row. Miles because every station in the directory
 * is in the US. */
export const milesOf = (km: number): number => Math.round(km / KM_PER_MILE)

/* --- one station's reading --- */

/**
 * One station's reading. Identity, the dated day, and a total that is a
 * number or an honest null are load-bearing; a genus row that isn't a finite
 * number falls out of the record rather than failing the reading.
 */
const ReadingSchema = v.object({
  stationId: v.string(),
  name: v.string(),
  date: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)),
  total: v.nullable(v.pipe(v.number(), v.finite())),
  category: v.fallback(v.nullish(v.string(), null), null),
  genera: v.record(v.string(), v.fallback(v.nullable(v.pipe(v.number(), v.finite())), null)),
  precision: v.fallback(v.picklist(['count', 'category']), 'count'),
  units: v.fallback(v.picklist(['spores/m3', 'count']), 'spores/m3'),
  fetchedAt: v.fallback(v.optional(v.string()), undefined),
})

/** The history store's read gate reuses the wire schema: a stored day that
 * would not parse off the network does not get to parse off disk either. */
const isReading = (x: unknown): x is MoldReading => v.safeParse(ReadingSchema, x).success

/**
 * This station's newest reading, or null.
 *
 * Null for every way this can fail and for all of them alike: 404 for a
 * station id the relay does not know, 403 for a gated one with the flag off,
 * 502 for a page that parsed with no date on it, a dead network, or a body
 * that is not the shape above. The caller is feature extraction, and a mold
 * answer is one column of the exposure vector — it must never be able to take
 * the screen down with it. Absent, `mold` is simply not in the vector, which
 * is the honest state: nothing was counted.
 */
export async function fetchMold(stationId: string): Promise<MoldReading | null> {
  try {
    const res = await fetch(`${RELAY_BASE}/v1/mold?station=${encodeURIComponent(stationId)}`)
    if (!res.ok) return null
    const parsed = v.safeParse(ReadingSchema, await res.json())
    if (!parsed.success) return null
    const body = parsed.output
    const genera: Record<string, number> = {}
    for (const [key, value] of Object.entries(body.genera)) {
      if (value !== null) genera[key] = value
    }
    return {
      stationId: body.stationId,
      name: body.name,
      date: body.date,
      total: body.total,
      category: body.category,
      genera,
      precision: body.precision,
      units: body.units,
      ...(body.fetchedAt !== undefined ? { fetchedAt: body.fetchedAt } : {}),
    }
  } catch {
    return null
  }
}

/* --- what the app remembers of the days already counted --- */

const HISTORY_KEY = 'breathing-index.moldHistory.v1'

/**
 * Days kept per station. The window wants three station days; fourteen covers
 * a fortnight of weekends, holidays and a page that was down on Tuesday.
 */
const DAYS_PER_STATION = 14

/** Stations kept at all. Least recently written is the one that goes — the
 * same shape, and the same reasoning, as the pollen and smoke stores. */
const STATIONS = 4

interface StoredStation {
  station: string
  /** station-local date ("2026-09-11") → that day's reading */
  days: Record<string, MoldReading>
}

/** Most recently written last, so trimming is "drop from the front". */
type Store = StoredStation[]

function read(): Store {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is StoredStation =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as StoredStation).station === 'string' &&
        typeof (entry as StoredStation).days === 'object',
    )
  } catch {
    // No storage, private mode, or a shape written by a version that thought
    // differently. The newest reading still answers for itself; the window
    // behind it goes back to being one day deep.
    return []
  }
}

/**
 * File a reading under its station.
 *
 * Nobody backfills mold. The relay serves one station's *newest* reading and
 * nothing behind it — the pages themselves mostly publish one day and replace
 * it — so the only way to have Wednesday's count on Friday is to have written
 * it down on Wednesday. Same bind as pollen and smoke, same answer.
 *
 * A reading with a date and a null total is filed like any other: "Canton
 * counted nothing today" is a fact worth remembering, and the window knows to
 * skip it (`moldWindow` in openMeteo.ts, where every window lives).
 */
export function rememberMoldReading(reading: MoldReading): void {
  const store = read()
  const existing = store.find((entry) => entry.station === reading.stationId)
  const merged: Record<string, MoldReading> = { ...existing?.days, [reading.date]: reading }
  // Newest dates win the cap: the window looks backwards from today, so the
  // oldest date is always the first thing that stops mattering.
  const kept = Object.keys(merged).sort().slice(-DAYS_PER_STATION)
  const next: Store = [
    ...store.filter((entry) => entry.station !== reading.stationId),
    { station: reading.stationId, days: Object.fromEntries(kept.map((d) => [d, merged[d]!])) },
  ].slice(-STATIONS)
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  } catch {
    // Quota, or no storage at all. Today's reading is still live; the days
    // behind it go back to being absent, which they honestly are.
  }
}

/** Everything remembered about this station, empty when that is nothing. */
export function recallMoldReadings(stationId: string): Map<string, MoldReading> {
  const days = read().find((entry) => entry.station === stationId)?.days
  return new Map(Object.entries(days ?? {}).filter(([, r]) => isReading(r)))
}
