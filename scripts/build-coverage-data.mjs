// The harvester behind /coverage (specs/37-coverage-map.md). It asks every
// open station directory we know for the places a thing in the air is actually
// measured, and writes one JSON per layer under public/coverage/data/ plus a
// summary the page generator bakes into prose. The outputs are committed:
// station locations move slowly, and the page must build without the network.
//
//   node scripts/build-coverage-data.mjs        harvest everything, rewrite the data files
//
// This script is deliberately NOT in `npm test` — it is the scheduled-refresh
// job, and a test that needs six live services is a test that fails on
// weather. scripts/../tests/coverage-data.test.ts checks the committed files'
// shape instead.
//
// Sources, and what each one honestly claims (research/data-sources-catalog.md,
// research/mold-sources.md, research/harvest-sources.md are the receipts):
//   - EPA ArcGIS AirNow mirror: monitors REPORTING THIS HOUR, US + Canada,
//     O3 / PM2.5 / PM10. Keyless.
//   - EPA AQS bulk monitor file: every US monitor with a last-sample date;
//     we keep NO2 / SO2 / CO monitors sampled within a year of the file's
//     extraction date. The lag is AQS ingestion, not the monitor.
//   - EEA PanEuropean metadata: Europe's regulatory sampling points; a point
//     with no ObservationDateEnd is operational. Not hour-checked.
//   - AAAAI NAB GraphQL: station locations and report DATES only — never a
//     count. Owner decision 2026-09-17: stations are mapped while written
//     consent is pursued; the readings stay behind the relay's consent gate.
//   - The relay's own mold directory (worker/src/mold/stations.ts): the four
//     publishers whose pages anyone may read.
//   - Montevideo's CKAN feed, plus a curated list of verified European
//     publishers from research/mold-sources.md §4 (city-level coordinates).
// Networks that exist but publish nothing open (EAN, Canada's ARL, SEAIC…)
// become notes, not dots: a gap is labeled, never guessed at.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'
import { register } from 'node:module'

register('./ts-ext-resolver.mjs', import.meta.url)
const { ALL_STATIONS } = await import('../worker/src/mold/stations.ts')

const OUT = new URL('../public/coverage/data/', import.meta.url)
const TODAY = new Date().toISOString().slice(0, 10)
const dayMs = 24 * 3600 * 1000
const daysAgo = (n) => new Date(Date.now() - n * dayMs).toISOString().slice(0, 10)

/** Freshness classes the map colors by. What "fresh" means differs by source
 * and the summary records the basis per source; the class is only the color. */
const FRESH = 0 // reporting now / within the cadence's last two weeks
const LAGGED = 1 // reported this season, quiet lately (or: operational, not hour-checked... no — EEA is FRESH; see sources below)
const noteworthy = [] // {layer, region, text} aggregates rendered beside the map

/** us-ca / europe / world, for the summary's counts. Boxes, not borders: the
 * dot is on the map either way, and the count only feeds a sentence. */
function region(lon, lat) {
  if (lon >= -30 && lon <= 45 && lat >= 34 && lat <= 72) return 'europe'
  if (lon >= -170 && lon <= -50 && lat >= 17 && lat <= 72) return 'us-ca'
  return 'world'
}

async function fetchOk(url, options = {}, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(options.timeout ?? 60000), ...options })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res
    } catch (err) {
      if (attempt >= tries) throw new Error(`${url}: ${err.message ?? err}`)
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
}
const fetchJSON = async (url, options) => (await fetchOk(url, options)).json()
const fetchText = async (url, options) => (await fetchOk(url, options)).text()

/** One station as the layer files carry it: [lon, lat, freshClass, label].
 * Coordinates to 2 decimals (~1 km) — a continental dot needs no more, and
 * several sources only give a city anyway. */
const point = (lon, lat, fresh, label) => [
  Math.round(lon * 100) / 100,
  Math.round(lat * 100) / 100,
  fresh,
  label,
]

// ---------------------------------------------------------------------------
// EPA ArcGIS AirNow mirror — O3 / PM2.5 / PM10, US + Canada, reporting now.
// ---------------------------------------------------------------------------
const ARCGIS = 'https://services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services'
const ARCGIS_SERVICES = {
  o3: 'Air_Now_Current_Monitors_Ozone',
  pm25: 'Air_Now_Current_Monitors_PM25',
  pm10: 'Air_Now_Current_Monitors_PM10',
}

async function arcgisLayer(service) {
  const stations = []
  for (let offset = 0; ; offset += 2000) {
    const page = await fetchJSON(
      `${ARCGIS}/${service}/FeatureServer/0/query?where=1%3D1&outFields=SiteName,AQSID&outSR=4326&resultRecordCount=2000&resultOffset=${offset}&f=json`,
    )
    for (const f of page.features ?? []) {
      const { x, y } = f.geometry ?? {}
      if (typeof x !== 'number' || typeof y !== 'number') continue
      // A handful of sites report with a blank SiteName; the AQS id is the
      // honest fallback label.
      const name = (f.attributes?.SiteName ?? '').trim() || `monitor ${f.attributes?.AQSID ?? '?'}`
      stations.push(point(x, y, FRESH, name))
    }
    if (!page.exceededTransferLimit) break
  }
  return stations
}

// ---------------------------------------------------------------------------
// EPA AQS bulk monitors — NO2 / SO2 / CO, US, sampled within a year.
// ---------------------------------------------------------------------------
const AQS_ZIP = 'https://aqs.epa.gov/aqsweb/airdata/aqs_monitors.zip'
const AQS_PARAMETERS = { 42602: 'no2', 42401: 'so2', 42101: 'co' }

/** The one file inside a stored-or-deflated zip, without a zip dependency:
 * read sizes off the central directory, inflate the entry raw. */
function unzipSingle(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const cd = buffer.readUInt32LE(eocd + 16)
  const method = buffer.readUInt16LE(cd + 10)
  const compressed = buffer.readUInt32LE(cd + 20)
  const nameLen = buffer.readUInt16LE(cd + 28)
  const extraLen = buffer.readUInt16LE(cd + 30)
  const local = buffer.readUInt32LE(cd + 42)
  const localName = buffer.readUInt16LE(local + 26)
  const localExtra = buffer.readUInt16LE(local + 28)
  void nameLen, void extraLen
  const start = local + 30 + localName + localExtra
  const raw = buffer.subarray(start, start + compressed)
  return method === 0 ? raw.toString('utf8') : inflateRawSync(raw).toString('utf8')
}

/** A CSV line, quotes honoured. AQS quotes fields that contain commas. */
function csvSplit(line) {
  const out = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (field += '"'), i++
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') out.push(field), (field = '')
    else field += ch
  }
  out.push(field)
  return out
}

async function aqsLayers() {
  const res = await fetchOk(AQS_ZIP, { timeout: 180000 })
  const csv = unzipSingle(Buffer.from(await res.arrayBuffer()))
  const lines = csv.split('\n')
  const header = csvSplit(lines[0].replace(/^﻿/, '').trim())
  const col = Object.fromEntries(header.map((name, i) => [name, i]))
  const layers = { no2: [], so2: [], co: [] }
  const seen = new Set()
  let cutoff = null
  for (let i = 1; i < lines.length; i++) {
    const row = csvSplit(lines[i])
    const layer = AQS_PARAMETERS[row[col['Parameter Code']]]
    if (layer === undefined) continue
    // Active means sampled within a year of the file's own extraction date:
    // AQS ingests about six months behind, so "this year" is the honest bar.
    cutoff ??= new Date(new Date(row[col['Extraction Date']]).getTime() - 365 * dayMs)
      .toISOString()
      .slice(0, 10)
    const lastSample = row[col['Last Sample Date']]
    if (!lastSample || lastSample < cutoff) continue
    // One dot per site per pollutant; the POC column multiplies monitors.
    const site = `${layer}:${row[col['State Code']]}-${row[col['County Code']]}-${row[col['Site Number']]}`
    if (seen.has(site)) continue
    seen.add(site)
    const lon = Number(row[col['Longitude']])
    const lat = Number(row[col['Latitude']])
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || (lon === 0 && lat === 0)) continue
    const label = row[col['Local Site Name']] || `${row[col['County Name']]}, ${row[col['State Name']]}`
    layers[layer].push(point(lon, lat, FRESH, label))
  }
  return layers
}

// ---------------------------------------------------------------------------
// EEA PanEuropean metadata — Europe's regulatory network, operational points.
// ---------------------------------------------------------------------------
const EEA_CSV = 'https://discomap.eea.europa.eu/map/fme/metadata/PanEuropean_metadata.csv'
const EEA_POLLUTANTS = {
  'http://dd.eionet.europa.eu/vocabulary/aq/pollutant/6001': 'pm25',
  'http://dd.eionet.europa.eu/vocabulary/aq/pollutant/5': 'pm10',
  'http://dd.eionet.europa.eu/vocabulary/aq/pollutant/7': 'o3',
  'http://dd.eionet.europa.eu/vocabulary/aq/pollutant/8': 'no2',
  'http://dd.eionet.europa.eu/vocabulary/aq/pollutant/1': 'so2',
  'http://dd.eionet.europa.eu/vocabulary/aq/pollutant/10': 'co',
}

async function eeaLayers() {
  const text = await fetchText(EEA_CSV, { timeout: 180000 })
  const lines = text.split('\n')
  const header = lines[0].replace(/^﻿/, '').trim().split('\t')
  const col = Object.fromEntries(header.map((name, i) => [name, i]))
  const layers = { pm25: [], pm10: [], o3: [], no2: [], so2: [], co: [] }
  const seen = new Set()
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split('\t')
    const layer = EEA_POLLUTANTS[row[col['AirPollutantCode']]]
    if (layer === undefined) continue
    if ((row[col['ObservationDateEnd']] ?? '').trim() !== '') continue // closed point
    const station = `${layer}:${row[col['AirQualityStationEoICode']]}`
    if (seen.has(station)) continue
    seen.add(station)
    const lon = Number(row[col['Longitude']])
    const lat = Number(row[col['Latitude']])
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
    layers[layer].push(point(lon, lat, FRESH, row[col['AirQualityStationEoICode']]))
  }
  return layers
}

// ---------------------------------------------------------------------------
// AAAAI NAB — locations and report dates only. Never a count.
// ---------------------------------------------------------------------------
const NAB = 'https://pollen.aaaai.org/graphql/public'

async function nabGraphQL(query, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetchJSON(NAB, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      timeout: 90000,
    })
    // The endpoint 200s its failures: a GraphQL errors array with the data
    // null. Observed 2026-09-17, resolver-side and transient — retry.
    if (!res.errors) return res.data
    if (attempt >= tries) throw new Error(`NAB GraphQL: ${JSON.stringify(res.errors).slice(0, 300)}`)
    await new Promise((r) => setTimeout(r, 5000 * attempt))
  }
}

/**
 * When the NAB endpoint is down, the last committed harvest of its dots is
 * better than either failing the whole run or drawing the layers without
 * them: freshness classes go at most one refresh stale, and the summary
 * carries the date they are from. Everything NAB-sourced is labeled "(NAB)",
 * which is also what makes it separable here.
 */
async function nabFromLastHarvest(reason) {
  console.warn(`build-coverage-data: NAB unreachable (${reason}); reusing the last committed NAB dots`)
  const read = async (id) => JSON.parse(await readFile(new URL(`${id}.json`, OUT), 'utf8'))
  const [pollen, mold, prior] = await Promise.all([read('pollen'), read('mold'), read('summary')])
  const nabOnly = (layer) => layer.stations.filter(([, , , label]) => label.endsWith('(NAB)'))
  return {
    pollen: nabOnly(pollen),
    mold: nabOnly(mold),
    registered: prior.nab.registered,
    reporting: prior.nab.reporting,
    asOf: prior.nab.asOf ?? pollen.harvested,
  }
}

async function nabLayers() {
  const { stations } = await nabGraphQL(
    '{ stations(limit: 500) { id name city state country latitude longitude } }',
  )
  // Report dates for the trailing 120 days — enough to tell fresh from
  // seasonal-quiet — with only the allergen TYPE beside each date: POLLEN or
  // SPORE, which is the pollen/mold split (categories are TREE/GRASS/WEED/
  // MOLD and pollen has no category of its own). The filter argument is
  // dynamic LINQ; a quoted ISO date breaks its parser.
  const [y, m, d] = daysAgo(120).split('-').map(Number)
  const { allergenCollectionSets } = await nabGraphQL(
    `{ allergenCollectionSets(limit: 8000, order: "date desc", filter: "date>=DateTime(${y},${m},${d})") { date station { id } allergenCollections { allergen { type } } } }`,
  )
  const last = new Map() // station id -> { POLLEN: date, SPORE: date }
  for (const set of allergenCollectionSets) {
    const at = last.get(set.station.id) ?? {}
    const date = set.date.slice(0, 10)
    for (const c of set.allergenCollections ?? []) {
      const type = c.allergen?.type
      if (type !== 'POLLEN' && type !== 'SPORE') continue
      if (!(at[type] >= date)) at[type] = date
    }
    last.set(set.station.id, at)
  }
  const cut30 = daysAgo(30)
  const layer = (type) => {
    const out = []
    for (const s of stations) {
      const date = last.get(s.id)?.[type]
      if (date === undefined) continue // registered but silent: prose, not a dot
      if (typeof s.latitude !== 'number' || typeof s.longitude !== 'number') continue
      const label = `${s.name} — ${[s.city, s.state].filter(Boolean).join(', ')} (NAB)`
      out.push(point(s.longitude, s.latitude, date >= cut30 ? FRESH : LAGGED, label))
    }
    return out
  }
  return { pollen: layer('POLLEN'), mold: layer('SPORE'), registered: stations.length, reporting: last.size }
}

// ---------------------------------------------------------------------------
// The relay's own mold publishers, and Montevideo.
// ---------------------------------------------------------------------------
function relayPublishers() {
  // The ungated rows of the relay directory: the four publishers whose pages
  // anyone may read. They count pollen off the same slide, so they appear on
  // both layers. NAB's Houston and St. Louis rows duplicate two of these
  // traps; the NAB guids are dropped so one trap is one dot.
  const locals = ALL_STATIONS.filter((s) => s.gated !== true)
  return locals.map((s) => point(s.lon, s.lat, FRESH, `${s.name} — ${s.city}, ${s.state}`))
}
const NAB_DUPLICATE_LABELS = ['City of Houston —', 'Saint Louis County Health Department —']

// Montevideo's station metadata gives UTM (X 580653, Y 6139610, zone 21S) for
// its one trap at Malvín Norte, Facultad de Ciencias. A projection library
// for one point is not worth it: the campus is at 34.88° S, 56.12° W, and a
// continental dot needs two decimals.
const MONTEVIDEO = point(-56.12, -34.88, FRESH, 'Laboratorio de Palinología, UdelaR — Montevideo, UY (open CSV)')

// ---------------------------------------------------------------------------
// Verified European publishers, curated from research/mold-sources.md §4.
// City-level coordinates: these publish for a city or a small region, and a
// continental dot is bigger than the error.
// ---------------------------------------------------------------------------
const EU_PUBLISHERS = [
  // [lon, lat, label, pollen?, mold?]
  [4.35, 50.85, 'Sciensano AirAllergy — Brussels, BE', true, true],
  [3.85, 50.48, 'Sciensano AirAllergy — Baudour, BE', true, true],
  [5.5, 50.97, 'Sciensano AirAllergy — Genk, BE', true, true],
  [3.03, 51.27, 'Sciensano AirAllergy — De Haan, BE', true, true],
  [5.34, 50.23, 'Sciensano AirAllergy — Marche-en-Famenne, BE', true, true],
  [-3.7, 40.42, 'Red PALINOCAM (4 stations) — Madrid, ES', true, true],
  [12.57, 55.68, 'Astma-Allergi Danmark — Copenhagen, DK', true, true],
  [9.4, 56.45, 'Astma-Allergi Danmark — Viborg, DK', true, true],
  [-6.26, 53.35, 'Met Éireann (4 provinces) — Dublin, IE', true, true],
  [19.94, 50.06, 'Jagiellonian University — Kraków, PL', true, true],
  [16.37, 48.21, 'polleninformation.at — Vienna, AT', true, true],
  [-2.22, 52.19, 'University of Worcester NPARU — Worcester, UK', true, true],
  [11.88, 43.46, 'ARPAT — Arezzo, IT', false, true],
  [11.25, 43.77, 'ARPAT — Firenze, IT', false, true],
  [11.11, 42.76, 'ARPAT — Grosseto, IT', false, true],
  [11.33, 43.32, 'ARPAT — Siena, IT', false, true],
]

// EUMETNET AutoPollen's five spore-publishing automatic stations (NILU
// THREDDS). Months stale at the 2026-09 survey: drawn LAGGED.
const AUTOPOLLEN_SPORES = [
  [10.98, 47.42, 'AutoPollen BAA500 — Zugspitze, DE'],
  [24.12, 67.97, 'AutoPollen BAA500 — Pallas, FI'],
  [13.4, 52.47, 'AutoPollen BAA500 — Berlin Tempelhof, DE'],
  [-4.78, 37.89, 'AutoPollen BAA500 — Córdoba, ES'],
  [11.58, 48.16, 'AutoPollen BAA500 — München, DE'],
]

function curatedNotes(nab) {
  noteworthy.push(
    {
      layer: 'pollen',
      region: 'us-ca',
      text: `The NAB registry lists ${nab.registered} station records; ${nab.reporting} have reported in the last four months. The silent ones are not drawn.`,
    },
    {
      layer: 'pollen',
      region: 'europe',
      text: 'The European Aeroallergen Network counts 600+ sites, ~400 active, across 38 countries — login-gated, no public API. Not drawn.',
    },
    {
      layer: 'pollen',
      region: 'europe',
      text: "Italy's POLLnet publishes ~58 stations as open data (CC-BY); its geoserver was unreachable at harvest time, so its dots are pending.",
    },
    {
      layer: 'pollen',
      region: 'europe',
      text: 'Switzerland runs ~14 automatic stations with open data (MeteoSwiss); France dissolved its counting network (RNSA) in 2026 and the successors publish index layers, not counts.',
    },
    {
      layer: 'pollen',
      region: 'us-ca',
      text: "Canada's 31-station network (Aerobiology Research Laboratories) counts pollen and spores daily and sells the numbers. Nothing public to draw.",
    },
    {
      layer: 'pollen',
      region: 'world',
      text: 'South Africa (SAPNET, 9 cities, weekly words not numbers), Tokyo (weekly, seasonal), Mexico (REMA, 13 stations, categories): published, thinly. Most of the world publishes nothing.',
    },
    {
      layer: 'mold',
      region: 'europe',
      text: 'Spain’s SEAIC charts Alternaria at ~70 stations behind a websocket; Germany’s ~45 stations and the Czech and Hungarian networks publish prose, not numbers. Not drawn.',
    },
    {
      layer: 'mold',
      region: 'us-ca',
      text: "Canada's ARL counts spores at 31 stations and sells the numbers. Nothing public to draw.",
    },
  )
}

// ---------------------------------------------------------------------------
// Assemble, count, write.
// ---------------------------------------------------------------------------
console.log('build-coverage-data: harvesting…')
const [arcO3, arcPM25, arcPM10, aqs, eea, nab] = await Promise.all([
  arcgisLayer(ARCGIS_SERVICES.o3),
  arcgisLayer(ARCGIS_SERVICES.pm25),
  arcgisLayer(ARCGIS_SERVICES.pm10),
  aqsLayers(),
  eeaLayers(),
  nabLayers().catch((err) => nabFromLastHarvest(err.message)),
])
const mvd = MONTEVIDEO
curatedNotes(nab)

const publishers = relayPublishers()
const nabMold = nab.mold.filter(([, , , label]) => !NAB_DUPLICATE_LABELS.some((dup) => label.startsWith(dup)))
const nabPollen = nab.pollen.filter(([, , , label]) => !NAB_DUPLICATE_LABELS.some((dup) => label.startsWith(dup)))

const euPollen = EU_PUBLISHERS.filter(([, , , p]) => p).map(([lon, lat, label]) => point(lon, lat, FRESH, label))
const euMold = EU_PUBLISHERS.filter(([, , , , m]) => m).map(([lon, lat, label]) => point(lon, lat, FRESH, label))
const autopollen = AUTOPOLLEN_SPORES.map(([lon, lat, label]) => point(lon, lat, LAGGED, label))

const LAYERS = {
  pm25: { name: 'PM2.5', stations: [...arcPM25, ...eea.pm25] },
  pm10: { name: 'PM10', stations: [...arcPM10, ...eea.pm10] },
  o3: { name: 'Ozone', stations: [...arcO3, ...eea.o3] },
  no2: { name: 'NO₂', stations: [...aqs.no2, ...eea.no2] },
  so2: { name: 'SO₂', stations: [...aqs.so2, ...eea.so2] },
  co: { name: 'CO', stations: [...aqs.co, ...eea.co] },
  pollen: { name: 'Pollen', stations: [...nabPollen, ...publishers, ...euPollen, mvd] },
  mold: { name: 'Mold', stations: [...nabMold, ...publishers, ...euMold, ...autopollen, mvd] },
}

/** Where each layer's dots came from, for the page's provenance line. The
 * "basis" is what a dot on that layer claims, which differs by source. */
const SOURCES = {
  pm25: [
    { name: 'EPA AirNow mirror (US + Canada)', n: arcPM25.length, basis: 'reporting this hour' },
    { name: 'EEA (Europe)', n: eea.pm25.length, basis: 'operational regulatory sampling point' },
  ],
  pm10: [
    { name: 'EPA AirNow mirror (US + Canada)', n: arcPM10.length, basis: 'reporting this hour' },
    { name: 'EEA (Europe)', n: eea.pm10.length, basis: 'operational regulatory sampling point' },
  ],
  o3: [
    { name: 'EPA AirNow mirror (US + Canada)', n: arcO3.length, basis: 'reporting this hour' },
    { name: 'EEA (Europe)', n: eea.o3.length, basis: 'operational regulatory sampling point' },
  ],
  no2: [
    { name: 'EPA AQS (US)', n: aqs.no2.length, basis: 'sampled within a year of the AQS extract' },
    { name: 'EEA (Europe)', n: eea.no2.length, basis: 'operational regulatory sampling point' },
  ],
  so2: [
    { name: 'EPA AQS (US)', n: aqs.so2.length, basis: 'sampled within a year of the AQS extract' },
    { name: 'EEA (Europe)', n: eea.so2.length, basis: 'operational regulatory sampling point' },
  ],
  co: [
    { name: 'EPA AQS (US)', n: aqs.co.length, basis: 'sampled within a year of the AQS extract' },
    { name: 'EEA (Europe)', n: eea.co.length, basis: 'operational regulatory sampling point' },
  ],
  pollen: [
    { name: 'AAAAI NAB (locations and dates only)', n: nabPollen.length, basis: 'reported pollen within 4 months; bright when within 30 days' },
    { name: 'Open publishers', n: publishers.length + euPollen.length + 1, basis: 'a page or feed anyone may read' },
  ],
  mold: [
    { name: 'AAAAI NAB (locations and dates only)', n: nabMold.length, basis: 'reported mold within 4 months; bright when within 30 days' },
    { name: 'Open publishers', n: publishers.length + euMold.length + autopollen.length + 1, basis: 'a page or feed anyone may read' },
  ],
}

await mkdir(OUT, { recursive: true })
const summary = { harvested: TODAY, layers: {} }
for (const [id, { name, stations }] of Object.entries(LAYERS)) {
  const counts = { 'us-ca': 0, europe: 0, world: 0 }
  for (const [lon, lat] of stations) counts[region(lon, lat)]++
  summary.layers[id] = {
    name,
    count: stations.length,
    regions: counts,
    sources: SOURCES[id],
    notes: noteworthy.filter((n) => n.layer === id).map(({ region: r, text }) => ({ region: r, text })),
  }
  await writeFile(new URL(`${id}.json`, OUT), JSON.stringify({ layer: id, harvested: TODAY, stations }))
  console.log(`  ${id}: ${stations.length} stations (us-ca ${counts['us-ca']}, europe ${counts.europe}, world ${counts.world})`)
}
summary.nab = { registered: nab.registered, reporting: nab.reporting, asOf: nab.asOf ?? TODAY }
await writeFile(new URL('summary.json', OUT), JSON.stringify(summary, null, 1))
console.log(`build-coverage-data: wrote public/coverage/data/ (${Object.keys(LAYERS).length} layers + summary)`)
