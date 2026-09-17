// The /coverage page (specs/37-coverage-map.md): where each thing in the air
// is actually measured, drawn as dots over a basemap, against the flat wash a
// consumer app paints. Rendered from the committed harvest in
// public/coverage/data/ (scripts/build-coverage-data.mjs) — this script never
// touches the network, so `--check` can sit in `npm test` like the other
// generators.
//
//   node scripts/generate-coverage.mjs           print the page
//   node scripts/generate-coverage.mjs --check    exit 1 if it has drifted
//   node scripts/generate-coverage.mjs --write    rewrite it in place
//
// The basemap is hand-rolled SVG, not a tile library: Natural Earth and
// Census geometry from the world-atlas / us-atlas packages (public domain),
// projected here at build time with d3-geo (a devDependency the page never
// ships). The interactive island (public/coverage/map.js) re-projects station
// data with its own small copies of the two projection formulas; the
// parameters it needs are serialized into the page as JSON, and
// tests/coverage.test.ts holds the two implementations to within half a
// pixel of each other.
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { geoNaturalEarth1, geoConicEqualArea, geoPath, geoCircle } from 'd3-geo'
import { feature, mesh } from 'topojson-client'

const SITE = 'https://breathingindex.com'
const here = (p) => new URL(p, import.meta.url)

const world = JSON.parse(await readFile(here('../node_modules/world-atlas/land-110m.json'), 'utf8'))
const countries = JSON.parse(
  await readFile(here('../node_modules/world-atlas/countries-110m.json'), 'utf8'),
)

const LAYER_ORDER = ['pollen', 'mold', 'pm25', 'pm10', 'o3', 'no2', 'so2', 'co']
const DATA = {}
for (const id of LAYER_ORDER) {
  DATA[id] = JSON.parse(await readFile(here(`../public/coverage/data/${id}.json`), 'utf8'))
}
const SUMMARY = JSON.parse(await readFile(here('../public/coverage/data/summary.json'), 'utf8'))
let BACKTEST = null
try {
  BACKTEST = JSON.parse(await readFile(here('../public/coverage/data/backtest.json'), 'utf8'))
} catch {
  // Not run yet; the section renders its pending state.
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fmt = (n) => n.toLocaleString('en-US')

// ---------------------------------------------------------------------------
// The three views. Each is a projection with rotation in longitude only and
// no .center() call, so the runtime copy needs just four or five numbers.
// fitExtent against a MultiPoint of the region's corners and edge midpoints:
// fitting a whole-world polygon trips over the antimeridian, and the extreme
// projected points of a lat/lon box are always on its edges.
// ---------------------------------------------------------------------------
const corners = ([w, e], [s, n]) => ({
  type: 'MultiPoint',
  coordinates: [
    [w, s], [w, n], [e, s], [e, n],
    [(w + e) / 2, s], [(w + e) / 2, n], [w, (s + n) / 2], [e, (s + n) / 2],
  ],
})

const VIEWS = {
  world: {
    label: 'World',
    width: 960,
    height: 500,
    make: () => geoNaturalEarth1(),
    fit: corners([-179.9, 179.9], [-56, 78]),
    detail: { land: world, borders: countries },
  },
  na: {
    label: 'North America',
    width: 960,
    height: 640,
    // d3's conic ships center [0, 33.6442]; pinned to the origin so the
    // serialized {parallels, rotate, scale, translate} fully describe it.
    make: () => geoConicEqualArea().parallels([20, 60]).rotate([100, 0]).center([0, 0]),
    fit: corners([-168, -52], [15, 74]),
    detail: { land: world, borders: countries },
  },
  eu: {
    label: 'Europe',
    width: 960,
    height: 700,
    make: () => geoConicEqualArea().parallels([40, 62]).rotate([-12, 0]).center([0, 0]),
    fit: corners([-24, 42], [34, 71.5]),
    detail: { land: world, borders: countries },
  },
}

/** One decimal place in path data: a tenth of a pixel, half the bytes. */
const round2 = (d) => d.replace(/(\d+\.\d)\d+/g, '$1')

const PROJECTION_PARAMS = {}
for (const [id, view] of Object.entries(VIEWS)) {
  const projection = view.make().fitExtent(
    [
      [8, 8],
      [view.width - 8, view.height - 8],
    ],
    view.fit,
  )
  projection.clipExtent([
    [0, 0],
    [view.width, view.height],
  ])
  view.projection = projection
  view.path = geoPath(projection)
  PROJECTION_PARAMS[id] = {
    type: id === 'world' ? 'naturalEarth1' : 'conicEqualArea',
    ...(id === 'world' ? {} : { parallels: view.make().parallels(), rotate: view.make().rotate()[0] }),
    scale: projection.scale(),
    translate: projection.translate(),
    width: view.width,
    height: view.height,
  }
}

/** The default layer, baked into the SVGs so the page argues with JS off. */
const DEFAULT_LAYER = 'pollen'
const REACH_KM = 50

function bakedView(id) {
  const view = VIEWS[id]
  const land = view.path(feature(view.detail.land, view.detail.land.objects.land))
  const borders = view.path(
    mesh(view.detail.borders, view.detail.borders.objects.countries, (a, b) => a !== b),
  )
  const stations = DATA[DEFAULT_LAYER].stations
  // Reach circles as one combined geodesic path: the same 50 km everywhere,
  // so sparse and dense layers are compared on one footing.
  const circle = geoCircle().radius(REACH_KM / 111.32).precision(10)
  const reach = stations
    .map(([lon, lat]) => view.path(circle.center([lon, lat])()))
    .filter(Boolean)
    .join('')
  const dots = stations
    .map(([lon, lat, fresh, label]) => {
      const p = view.projection([lon, lat])
      if (!p || p[0] < 0 || p[0] > view.width || p[1] < 0 || p[1] > view.height) return ''
      return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" class="cov-dot${fresh === 1 ? ' cov-dot-lagged' : ''}"><title>${esc(label)}</title></circle>`
    })
    .filter(Boolean)
    .join('')
  return [
    `        <svg class="cov-svg" data-view="${id}" viewBox="0 0 ${view.width} ${view.height}" role="img"`,
    `          aria-label="${esc(`${view.label}: places with a ${SUMMARY.layers[DEFAULT_LAYER].name.toLowerCase()} measurement`)}"${id === 'world' ? '' : ' hidden'}>`,
    `          <path class="cov-land" d="${round2(land ?? '')}"/>`,
    `          <path class="cov-borders" d="${round2(borders ?? '')}"/>`,
    `          <path class="cov-reach" d="${round2(reach)}"/>`,
    `          <g class="cov-dots">${dots}</g>`,
    `        </svg>`,
  ]
}

// ---------------------------------------------------------------------------
// Copy. Numbers are interpolated from the harvest, never typed: a re-harvest
// must never leave the prose contradicting the map under it.
// ---------------------------------------------------------------------------
const n = (id) => SUMMARY.layers[id].count
const REGION_LABEL = { 'us-ca': 'US + Canada', europe: 'Europe', world: 'Elsewhere' }

const PROVENANCE = [
  '  Generated by scripts/generate-coverage.mjs from the committed harvest in',
  '  public/coverage/data/ (scripts/build-coverage-data.mjs is the harvester).',
  '  Edit the generator, then: node scripts/generate-coverage.mjs --write.',
  '  `npm test` fails if this file drifts from the generator.',
  '',
  '  Basemap: Natural Earth (public domain) via the world-atlas package,',
  '  projected at build time. No tiles, no map library in the page.',
  '',
  '  NAB station locations and report dates appear by owner decision',
  '  2026-09-17 while written consent from the AAAAI is pursued; no NAB',
  '  reading (no count, no index) is present anywhere in this page or its',
  '  data files. See specs/37-coverage-map.md, licensing.',
  '',
  '  Provenance: the prose is an agent draft from specs/37-coverage-map.md',
  '  and research/mold-sources.md, for Drew to edit. Not through his hand yet.',
]

const TITLE = 'Where the air is actually measured'
const DESCRIPTION = `${fmt(n('pm25'))} places measure PM2.5 across the US, Canada and Europe. ${fmt(n('pollen'))} count pollen. ${fmt(n('mold'))} count mold spores. A map of the difference between a measurement and a model.`

const INTRO = [
  `Air quality apps answer for every point on the map. Ask for a pollen number in any US ZIP code and one arrives, to one decimal, with a five-day forecast. The map on this page shows what that confidence is standing on: the places where someone actually measures the thing, against the everywhere that gets a number anyway.`,
  `The gap depends on which thing. PM2.5 is measured at ${fmt(n('pm25'))} stations across the US, Canada and Europe, ozone at ${fmt(n('o3'))} — regulatory networks, calibrated instruments, a monitor probably within an hour of you. Pollen is counted at ${fmt(n('pollen'))} places on this map, mold spores at ${fmt(n('mold'))}. Not per state — total, across three continents. Every pollen and mold number you have ever seen in an app was produced without a measurement, from a model of vegetation, season and weather. The stations here are where such a model could even be checked.`,
  `That is the honest split this page keeps returning to: for the regulated pollutants the number you see traces back to instruments, and the question is only how far away the nearest one is. For pollen and mold there is mostly nothing to trace back to.`,
]

/** The per-layer table: the whole map, readable without the map. */
function numbersTable() {
  const row = (id) => {
    const layer = SUMMARY.layers[id]
    const basis = layer.sources.map((s) => `${s.name}: ${s.basis}`).join('; ')
    return [
      '        <tr>',
      `          <th scope="row">${esc(layer.name)}</th>`,
      `          <td>${fmt(layer.regions['us-ca'])}</td>`,
      `          <td>${fmt(layer.regions.europe)}</td>`,
      `          <td>${fmt(layer.regions.world)}</td>`,
      `          <td>${fmt(layer.count)}</td>`,
      `          <td class="cov-basis">${esc(basis)}</td>`,
      '        </tr>',
    ]
  }
  return [
    '      <table class="cov-table">',
    '        <thead><tr><th>Measured</th><th>US + CA</th><th>Europe</th><th>Elsewhere</th><th>Total</th><th>What a dot claims</th></tr></thead>',
    '        <tbody>',
    ...LAYER_ORDER.flatMap(row),
    '        </tbody>',
    '      </table>',
  ]
}

function notesFor(id) {
  return (SUMMARY.layers[id].notes ?? []).map(
    ({ region, text }) =>
      `          <li><span class="cov-note-region">${esc(REGION_LABEL[region])}</span> ${esc(text)}</li>`,
  )
}

function backtestSection() {
  if (BACKTEST === null) {
    return [
      '      <p>',
      '        The receipts are being computed: the same days, scored three ways against stations that',
      '        publish real counts — the forecast model, a season calendar, and yesterday-again. This',
      '        section fills in when the first run lands.',
      '      </p>',
    ]
  }
  const rows = BACKTEST.results.map((r) => [
    '        <tr>',
    `          <th scope="row">${esc(r.label)}</th>`,
    `          <td>${r.model === null ? '—' : r.model.toFixed(2)}</td>`,
    `          <td>${r.calendar.toFixed(2)}</td>`,
    `          <td>${r.persistence.toFixed(2)}</td>`,
    `          <td>${fmt(r.days)}</td>`,
    '        </tr>',
  ])
  return [
    ...BACKTEST.prose.map((p) => ['      <p>', `        ${esc(p)}`, '      </p>']).flat(),
    '      <table class="cov-table">',
    '        <thead><tr><th></th><th>Model</th><th>Calendar</th><th>Yesterday</th><th>Days</th></tr></thead>',
    '        <tbody>',
    ...rows.flat(),
    '        </tbody>',
    '      </table>',
    `      <p class="cov-fine">${esc(BACKTEST.method)}</p>`,
  ]
}

// ---------------------------------------------------------------------------
// The page.
// ---------------------------------------------------------------------------
const chips = LAYER_ORDER.map(
  (id) =>
    `          <button class="cov-chip${id === DEFAULT_LAYER ? ' cov-on' : ''}" data-layer="${id}">${esc(SUMMARY.layers[id].name)} <span class="cov-chip-n">${fmt(n(id))}</span></button>`,
)
const viewTabs = Object.entries(VIEWS).map(
  ([id, view]) =>
    `          <button class="cov-tab${id === 'world' ? ' cov-on' : ''}" data-view="${id}">${esc(view.label)}</button>`,
)

const defaultNotes = notesFor(DEFAULT_LAYER)

const page = [
  '<!doctype html>',
  '<!--',
  ...PROVENANCE,
  '-->',
  '<html lang="en">',
  '  <head>',
  '    <meta charset="UTF-8" />',
  '    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />',
  `    <title>${esc(TITLE)} — Breathing Index</title>`,
  `    <meta name="description" content="${esc(DESCRIPTION)}" />`,
  `    <link rel="canonical" href="${SITE}/coverage" />`,
  '    <meta name="theme-color" content="#F3F6F7" />',
  '    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
  '    <link rel="stylesheet" href="/legal.css" />',
  '    <link rel="stylesheet" href="/coverage.css" />',
  '    <script type="application/ld+json">',
  '      {',
  '        "@context": "https://schema.org",',
  '        "@type": "BreadcrumbList",',
  '        "itemListElement": [',
  `          { "@type": "ListItem", "position": 1, "name": "Breathing Index", "item": "${SITE}/" },`,
  `          { "@type": "ListItem", "position": 2, "name": ${JSON.stringify(TITLE)} }`,
  '        ]',
  '      }',
  '    </script>',
  '  </head>',
  '  <body class="cov">',
  '    <main>',
  '      <a class="wordmark" href="/">Breathing Index 🫁</a>',
  '      <nav class="crumbs">Coverage</nav>',
  '',
  `      <h1>${esc(TITLE)}</h1>`,
  `      <p class="updated">Station data harvested ${esc(SUMMARY.harvested)} · every count on this page comes from that harvest</p>`,
  '',
  ...INTRO.flatMap((p) => ['      <p>', `        ${esc(p)}`, '      </p>', '']),
  '      <section class="cov-wide" id="map">',
  '        <div class="cov-chips" role="group" aria-label="Pick a measurement">',
  ...chips,
  '        </div>',
  '        <div class="cov-tabs" role="group" aria-label="Pick a region">',
  ...viewTabs,
  '          <label class="cov-toggle"><input type="checkbox" id="cov-reach-toggle" checked /> 50 km reach</label>',
  '          <label class="cov-toggle"><input type="checkbox" id="cov-wash-toggle" /> what your app paints</label>',
  '        </div>',
  ...Object.keys(VIEWS).flatMap(bakedView),
  `        <p class="cov-legend" id="cov-legend">Each dot is a place that counts pollen and publishes, or reports it to the NAB — bright when it reported within 30 days, hollow when it has been quiet this season. The circles are ${REACH_KM} km of reach, roughly one forecast-model cell. Everything outside them is a number without a measurement.</p>`,
  '        <ul class="cov-notes" id="cov-notes">',
  ...defaultNotes,
  '        </ul>',
  '        <noscript><p class="cov-fine">Switching layers and regions needs JavaScript; with it off, the map shows pollen and the table below carries every layer.</p></noscript>',
  '      </section>',
  '',
  '      <section class="cov-wide">',
  '        <h2>Every layer, in numbers</h2>',
  ...numbersTable(),
  `        <p class="cov-fine">The NAB registry lists ${fmt(SUMMARY.nab.registered)} station records; ${fmt(SUMMARY.nab.reporting)} reported anything in the last four months, and only those are drawn. Dots for the regulated pollutants claim different things in different regions — the last column says which claim each source supports.</p>`,
  '      </section>',
  '',
  '      <section id="near">',
  '        <h2>What is measured near you</h2>',
  '      <p>',
  '        Tap the map, or use your location, and this section answers with the distance to the',
  '        nearest station for each layer: how far your PM2.5 number travels to reach you, and how',
  '        far a pollen count would have to.',
  '      </p>',
  '        <p class="cov-readout-controls"><button id="cov-locate" class="cov-chip" disabled>Use my location</button> <span class="cov-fine">Nothing is sent anywhere: the station list is already in the page, and the distance math runs in your browser.</span></p>',
  '        <div class="cov-readout" id="cov-readout" hidden></div>',
  '        <noscript><p class="cov-fine">This needs JavaScript; the map and table above do not.</p></noscript>',
  '      </section>',
  '',
  '      <section id="receipts">',
  '        <h2>Does the model beat a calendar?</h2>',
  ...backtestSection(),
  '      </section>',
  '',
  '      <section id="method">',
  '        <h2>Sources and method</h2>',
  '      <p>',
  '        Regulated-pollutant stations come from the EPA’s AirNow monitor feed (US and Canada,',
  '        reporting at harvest time), the EPA AQS monitor registry (US monitors sampled within a',
  '        year of its extract), and the European Environment Agency’s sampling-point registry',
  '        (operational points). Pollen and mold stations come from the AAAAI National Allergy',
  '        Bureau’s directory — locations and report dates only, no readings, credited here while',
  '        written consent for more is sought — and from the counting stations that publish where',
  '        anyone can read: Houston, St. Louis County, Children’s Mercy Kansas City, Canton,',
  '        Montevideo, and the European publishers each dot names. Networks that measure but do not',
  '        publish openly are described beside the map instead of drawn, and a region with no dots',
  '        and no note is a region where we found no public feed — which is not a claim that nothing',
  '        is measured there.',
  '      </p>',
  '      <p>',
  '        The basemap is Natural Earth, public domain, drawn at build time; there are no map tiles',
  '        and no tracking on this page. Station lists are refreshed on a schedule, and the harvest',
  '        date at the top is the promise. The full method, the raw layer files, and every source',
  '        URL are in the repository.',
  '      </p>',
  `        <p class="cov-fine">Layer data: <a href="/coverage/data/summary.json">summary</a>${LAYER_ORDER.map((id) => ` · <a href="/coverage/data/${id}.json">${esc(SUMMARY.layers[id].name)}</a>`).join('')}</p>`,
  '      </section>',
  '',
  '      <p class="gl-product">',
  '        Breathing Index is a free logbook that stores these measurements beside your own 1–4',
  '        breathing ratings, and over time marks which of them your days say affect you.',
  '        <a href="/asthma-logbook/">What this is</a> · <a href="/">Open it</a>',
  '      </p>',
  '      <footer>',
  '        <a href="/">Breathing Index</a><a href="/pollen/">Pollen</a><a href="/glossary/">Glossary</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>',
  '      </footer>',
  '    </main>',
  `    <script id="cov-params" type="application/json">${JSON.stringify({ views: PROJECTION_PARAMS, defaultLayer: DEFAULT_LAYER, reachKm: REACH_KM, layers: Object.fromEntries(LAYER_ORDER.map((id) => [id, { name: SUMMARY.layers[id].name, notes: SUMMARY.layers[id].notes, count: n(id) }])) })}</script>`,
  '    <script>',
  '      // The island loads when the map nears the viewport, not before: the',
  '      // page above it is complete without it (specs/37-coverage-map.md).',
  "      const mount = document.getElementById('map')",
  "      const load = () => import('/coverage/map.js')",
  "      if ('IntersectionObserver' in window) {",
  '        const seen = new IntersectionObserver((entries) => {',
  '          if (entries.some((entry) => entry.isIntersecting)) { seen.disconnect(); load() }',
  "        }, { rootMargin: '200px' })",
  '        seen.observe(mount)',
  '      } else load()',
  '    </script>',
  '  </body>',
  '</html>',
  '',
].join('\n')

// ---------------------------------------------------------------------------
// Write / check, the shape every generator here shares.
// ---------------------------------------------------------------------------
const FILE = 'public/coverage/index.html'
const mode = process.argv[2]
if (mode !== '--check' && mode !== '--write') {
  console.log(page)
  process.exit(0)
}
const url = here(`../${FILE}`)
let found = null
try {
  found = await readFile(url, 'utf8')
} catch {
  // Missing counts as drift.
}
if (found === page) {
  if (mode === '--check') console.log(`generate-coverage: ${FILE} matches the harvest`)
  process.exit(0)
}
if (mode === '--write') {
  await mkdir(new URL('.', url), { recursive: true })
  await writeFile(url, page)
  console.log(`generate-coverage: wrote ${FILE}`)
} else {
  console.error(
    found === null
      ? `generate-coverage: ${FILE} is missing`
      : `generate-coverage: ${FILE} has drifted from the harvest`,
  )
  console.error('Then: node scripts/generate-coverage.mjs --write')
  process.exit(1)
}
