/**
 * Every mold station the relay knows how to fetch: one row per station, one
 * source of truth, in the worker rather than in the client.
 *
 * It lives here because it is operational, not editorial. A row names a URL
 * and a parser shape, and both of those break when a publisher redecorates —
 * which is a relay deploy, not an app release. The client asks
 * `GET /v1/mold/stations` and picks the nearest; it never learns a URL and can
 * never be the reason a scraper is pointed somewhere new.
 *
 * Why a list of five publishers rather than an API: there is no API. No vendor
 * sells a trap-derived mold number (`research/mold-sources.md` is the sweep).
 * The measurements exist at counting stations that post a number on a web page
 * once a weekday morning, and this is the list of the ones that post it in a
 * shape a regex can read.
 *
 * Coordinates are the counting station's own building, to two decimals
 * (~1 km). Stations are 50–100 miles apart, so the client's nearest-first sort
 * is not sensitive to the last decimal, and this file has no reason to hold a
 * sharper location than the relay is allowed to be told.
 */

/** Which parser reads this station. One shape, one module under `src/mold/`. */
export type MoldShape = 'rss' | 'houston' | 'kc' | 'canton' | 'nab'

export interface Station {
  /** Stable, client-facing, and the KV cache key. NAB rows are
   * `nab:<station guid>`; the locals are hand-picked slugs. */
  id: string
  name: string
  city: string
  state: string
  lat: number
  lon: number
  shape: MoldShape
  /** The page or endpoint the parser is pointed at. Never sent to the client
   * — see the module header. */
  url: string
  /** `weekdays-seasonal` means the station stops counting in winter and its
   * page goes quiet without breaking, which the client must read as "no
   * reading today", not "station down". */
  cadence: 'weekdays' | 'weekdays-seasonal'
  precision: 'count' | 'category'
  /** `spores/m3` where the publisher names the unit; `count` where it prints a
   * number and does not (St. Louis). Two stations' `count` readings are not
   * comparable with each other. */
  units: 'spores/m3' | 'count'
  /** Whether this source splits the total by genus at all. This is the
   * contract; `genera` below is only evidence. */
  genusLevel: boolean
  /** Genus slugs observed from this source, for a client that wants to know
   * before fetching whether Alternaria is on offer. Indicative, not
   * exhaustive, and empty for a source whose split is genus-level but whose
   * membership changes daily (Children's Mercy publishes a *top five*; NAB
   * reports whatever the slide had on it). */
  genera: string[]
  /** AAAAI National Allergy Bureau rows, which the relay will not fetch unless
   * `MOLD_NAB_ENABLED` is `"1"`. See `nab.ts` for the terms. */
  gated?: true
}

/** Houston's 20 named spore rows, as its daily page lists them — including its
 * own spelling of Drechslera, which is why a genus slug is a slug of what the
 * publisher wrote and not of a canonical taxonomy. */
const HOUSTON_GENERA = [
  'algae',
  'alternaria',
  'ascospores',
  'basidiospores',
  'cercospora',
  'cladosporium',
  'curvularia',
  'dreshslera_helminthosporium',
  'epicoccum',
  'nigrospora',
  'oidium_erysiphe',
  'penicillium_aspergillus',
  'periconia',
  'pithomyces',
  'rusts',
  'smuts_myxomycetes',
  'spegazzinia',
  'stemphilium',
  'tetraploa',
  'torula',
]

/**
 * The four publishers that post a mold number on a page anyone may read.
 *
 * Two of them (Houston, St. Louis) are also NAB stations, so with the NAB flag
 * on the directory holds two rows for one trap. That is not a bug worth
 * deduplicating: the local page and the NAB API disagree about genus spelling
 * and sometimes about the day, and the ungated row is the one that survives
 * the flag going off.
 */
const LOCAL_STATIONS: Station[] = [
  {
    id: 'stl-county',
    name: 'St. Louis County Department of Public Health',
    city: 'St. Louis',
    state: 'MO',
    lat: 38.75,
    lon: -90.34,
    shape: 'rss',
    // The RSS feed rather than the ASP.NET page it summarises: one <item>,
    // ~1 KB, and it carries the numeric count in its title where the page
    // wraps it in a decade of WebForms markup.
    url: 'https://pollenandmold.stlouisco.com/Feed/RSS.aspx',
    cadence: 'weekdays',
    precision: 'count',
    // The page prints "Mold Count: 54862" and never says per what. It is
    // almost certainly spores/m³ and this file will not assume so.
    units: 'count',
    genusLevel: false,
    genera: [],
  },
  {
    id: 'houston-hhd',
    name: 'Houston Health Department',
    city: 'Houston',
    state: 'TX',
    lat: 29.71,
    lon: -95.39,
    shape: 'houston',
    // The index, not a daily page: the slugs are inconsistent
    // (`september-112026` one day, `september-9-2026` the next, and the path
    // is `/Services/` about a quarter of the time), so the newest day is found
    // by crawling links and never by constructing a URL.
    url: 'https://www.houstonhealth.org/services/pollen-mold',
    cadence: 'weekdays',
    precision: 'count',
    units: 'spores/m3',
    genusLevel: true,
    genera: HOUSTON_GENERA,
  },
  {
    id: 'kc-childrens-mercy',
    name: "Children's Mercy Kansas City",
    city: 'Kansas City',
    state: 'MO',
    lat: 39.09,
    lon: -94.58,
    shape: 'kc',
    url: 'https://pollen.childrensmercy.org/',
    cadence: 'weekdays',
    precision: 'count',
    units: 'spores/m3',
    genusLevel: true,
    // A daily top five, so the membership rotates; these are the five of
    // 2026-09-11 and the list is evidence rather than a promise.
    genera: [],
  },
  {
    id: 'canton-oh',
    name: 'Canton City Public Health',
    city: 'Canton',
    state: 'OH',
    lat: 40.8,
    lon: -81.38,
    shape: 'canton',
    url: 'https://www.cantonohio.gov/2295/Daily-Spore-and-Pollen-Counts',
    cadence: 'weekdays-seasonal',
    precision: 'count',
    units: 'spores/m3',
    genusLevel: true,
    genera: ['cladosporium', 'alternaria', 'unidentified_molds'],
  },
]

/** The AAAAI's GraphQL endpoint. Every NAB row points at the same URL; the
 * station guid rides in the query, not the path. */
const NAB_URL = 'https://pollen.aaaai.org/graphql/public'

/**
 * The NAB stations that reported mold within 30 days, as of the 2026-09-14
 * sweep in `research/mold-sources.md` — 19 of 219 station records. Ids and
 * coordinates come from the endpoint's own `stations` query.
 *
 * Every one of these is `gated`: see `nab.ts`. They are in the directory so
 * that the day consent arrives the change is a config flag, and out of the
 * `/v1/mold/stations` answer until it does, because a station the relay will
 * refuse to fetch is not a choice to offer anyone.
 */
const NAB_MOLD_STATIONS: ReadonlyArray<{
  guid: string
  name: string
  city: string
  state: string
  lat: number
  lon: number
}> = [
  { guid: '39ad34be-177c-47dd-acd7-99b67d1e2afb', name: 'Medical Sciences Campus, U.P.R.', city: 'San Juan', state: 'PR', lat: 18.47, lon: -66.11 },
  { guid: '42db6483-6773-4a48-8755-da3d01efab20', name: 'Caguas Station', city: 'Caguas', state: 'PR', lat: 18.23, lon: -66.03 },
  { guid: 'de57b11e-d034-48f8-86b1-6193f7593de4', name: 'Theodore J. Chu, M.D.', city: 'San Jose', state: 'CA', lat: 37.33, lon: -121.94 },
  { guid: '747be372-8c20-4b90-82b2-30ee3c8f5961', name: 'STAAMP Research', city: 'San Antonio', state: 'TX', lat: 29.51, lon: -98.57 },
  { guid: '9eec5ce0-6c54-4f8e-bd16-2c9e85ae9820', name: 'City of Houston', city: 'Houston', state: 'TX', lat: 29.71, lon: -95.39 },
  { guid: '77c9eb75-609b-4cf7-80f5-e3708ad1c70e', name: 'Saint Louis County Health Department', city: 'Berkeley', state: 'MO', lat: 38.75, lon: -90.34 },
  { guid: 'd49c2673-09c8-48ed-a8c7-64d4a6760024', name: 'Fred H Lewis, MD FAAAAI', city: 'Olean', state: 'NY', lat: 42.09, lon: -78.43 },
  { guid: 'a5373fe8-6339-4b24-ae91-a983904e6f45', name: 'Allergy & Asthma Center of Georgetown', city: 'Georgetown', state: 'TX', lat: 30.61, lon: -97.68 },
  { guid: 'b52dbac2-7b3f-495a-b479-7548a138dfa6', name: 'US Army Centralized Allergen Extract Lab.', city: 'Silver Spring', state: 'MD', lat: 39.01, lon: -77.05 },
  { guid: '5bcd73ec-84c5-42e4-bf32-60422b75f2f6', name: 'University of Nevada Las Vegas', city: 'Las Vegas', state: 'NV', lat: 36.11, lon: -115.14 },
  { guid: '2c2e4860-e9e1-4398-93f5-51c4b66db9f5', name: 'Oklahoma Allergy & Asthma Clinic, Inc.', city: 'Oklahoma City', state: 'OK', lat: 35.47, lon: -97.52 },
  { guid: '6a660b77-ea62-47f6-9600-1724c1ec1117', name: 'Allergy, Sinus, and Asthma Professionals', city: 'Melrose Park', state: 'IL', lat: 41.91, lon: -87.84 },
  { guid: '11fb5164-9840-4e99-b73d-9bff4ab53734', name: 'Wilford Hall Ambulatory Surgical Center', city: 'San Antonio', state: 'TX', lat: 29.4, lon: -98.62 },
  { guid: 'e23c5c5d-f0d0-4ea7-af60-5ea065dcc406', name: 'Allergy Clinic of Tulsa', city: 'Tulsa', state: 'OK', lat: 36.03, lon: -95.87 },
  { guid: '68af54c8-21ad-4e46-b79f-2162ccf3e543', name: 'University of Nebraska Medical Center', city: 'Omaha', state: 'NE', lat: 41.25, lon: -95.97 },
  { guid: '3862323c-682d-493e-9ad6-97f3318ee96e', name: 'Kagen Allergy Clinic', city: 'Appleton', state: 'WI', lat: 44.26, lon: -88.41 },
  { guid: 'c509b9cd-b57d-4f4d-948f-5a721740845d', name: 'Allergy Partners of Charleston', city: 'Charleston', state: 'SC', lat: 32.96, lon: -80.16 },
  { guid: '136005cd-70cc-4e6e-8a0e-8a5b413a9b85', name: 'Allergy & Asthma Care of Waco', city: 'Waco', state: 'TX', lat: 31.5, lon: -97.2 },
  { guid: '62f56574-633c-48bb-83ea-58a0c52106ed', name: 'Mayo Clinic Arizona', city: 'Scottsdale', state: 'AZ', lat: 33.59, lon: -111.79 },
]

const NAB_STATIONS: Station[] = NAB_MOLD_STATIONS.map((s) => ({
  id: `nab:${s.guid}`,
  name: s.name,
  city: s.city,
  state: s.state,
  lat: s.lat,
  lon: s.lon,
  shape: 'nab' as const,
  url: NAB_URL,
  cadence: 'weekdays' as const,
  precision: 'count' as const,
  units: 'spores/m3' as const,
  genusLevel: true,
  // The API returns whatever taxa the reader identified that morning, which
  // varies by station (1 at Waco Station 1, 30 at UNLV) and by day. Listing a
  // set here would be a promise the endpoint does not make.
  genera: [],
  gated: true as const,
}))

/** Every station the relay knows, gated or not. */
export const ALL_STATIONS: readonly Station[] = [...LOCAL_STATIONS, ...NAB_STATIONS]

/** Is the AAAAI client switched on? Exactly `"1"`; anything else, including
 * the unset variable, is off. A flag that reads "true", "yes" and "on" is a
 * flag that turns itself on by accident, and this one is a licence term. */
export const nabEnabled = (flag: string | undefined): boolean => flag === '1'

/** The station with this id, or null. Unknown ids are a 404 and never a
 * silently-empty reading. */
export function findStation(id: string): Station | null {
  return ALL_STATIONS.find((station) => station.id === id) ?? null
}

/** The stations the relay will actually serve right now. With the NAB flag off
 * the gated rows are absent rather than listed-and-disabled: the directory is
 * a menu, and an item the kitchen will refuse to cook does not belong on it. */
export function availableStations(flag: string | undefined): Station[] {
  const nab = nabEnabled(flag)
  return ALL_STATIONS.filter((station) => nab || station.gated !== true)
}

/** What a station looks like to the client: everything except how it is
 * fetched. `url` and `shape` are the relay's business, and `gated` is
 * answered by presence. */
export type PublicStation = Omit<Station, 'url' | 'shape' | 'gated'>

export const publicStation = ({ url: _url, shape: _shape, gated: _gated, ...rest }: Station): PublicStation =>
  rest
