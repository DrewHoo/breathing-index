// The single source of truth for the generated blocks in the /pollen content
// pages. The season data itself lives in src/sources/pollenCalendar.ts — the
// same table the app's fallback estimates come from — and this script renders
// it as static HTML between `begin generated` / `end generated` markers, so a
// crawler and the app can never disagree about a season. `--check` (wired into
// `npm test`) is what keeps the pages and the source from drifting apart.
//
//   node scripts/generate-pollen-tables.mjs           print the blocks
//   node scripts/generate-pollen-tables.mjs --check    exit 1 if a page has drifted
//   node scripts/generate-pollen-tables.mjs --write    rewrite the blocks in place
//
// Runs on plain Node ≥ 22.18: the .ts imports below rely on Node's native
// type stripping, same trick the app's other scripts don't need but this one
// does — the calendar is TypeScript and the pages must render from it, not
// from a copy.
import { readFile, writeFile } from 'node:fs/promises'
import { register } from 'node:module'

// The calendar's own imports are extensionless (Vite resolves them); teach
// this process to retry with `.ts` before importing it. Must precede the
// import, hence the dynamic form.
register('./ts-ext-resolver.mjs', import.meta.url)
const { BAND_INDEX, REGION_SEASONS, calendarPollen, pollenRegion } = await import(
  '../src/sources/pollenCalendar.ts'
)

/** Display names for the NOAA-ish regions, in north-to-south reading order. */
const REGIONS = [
  ['northeast', 'Northeast'],
  ['ohio-valley', 'Ohio Valley'],
  ['upper-midwest', 'Upper Midwest'],
  ['northern-plains', 'Northern Plains'],
  ['southeast', 'Southeast'],
  ['south', 'South'],
  ['southwest', 'Southwest'],
  ['west', 'West (CA/NV)'],
  ['northwest', 'Northwest'],
]

const SPECIES = [
  ['birch', 'Birch (tree)'],
  ['grass', 'Grass'],
  ['ragweed', 'Ragweed (weed)'],
]

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const BAND_CELL = {
  low: { letter: 'L', word: 'Low' },
  med: { letter: 'M', word: 'Moderate' },
  high: { letter: 'H', word: 'High' },
}

/**
 * One sample coordinate inside each region's lat/lon box. The tables render
 * from REGION_SEASONS directly, and these let the script prove the rendered
 * bands equal what calendarPollen() actually returns for a real place —
 * the acceptance is "matches calendarPollen's output", not "matches the
 * table it happens to read from today".
 */
const SAMPLE_POINTS = {
  northeast: [42.4, -71.1],
  'ohio-valley': [39.1, -84.5],
  'upper-midwest': [45.0, -93.3],
  'northern-plains': [46.9, -100.8],
  southeast: [33.7, -84.4],
  south: [32.8, -96.8],
  southwest: [35.1, -106.6],
  west: [36.2, -115.1],
  northwest: [47.6, -122.3],
}

function verifyAgainstCalendarPollen() {
  for (const [region, [lat, lon]] of Object.entries(SAMPLE_POINTS)) {
    if (pollenRegion(lat, lon) !== region) {
      throw new Error(`sample point for ${region} no longer falls in ${region}`)
    }
    for (let month = 1; month <= 12; month++) {
      const day = calendarPollen(lat, lon, month)
      for (const [species] of SPECIES) {
        const band = REGION_SEASONS[region][species]?.[month]
        const variable = { birch: 'pollen_birch', grass: 'pollen_graminales', ragweed: 'pollen_ragweed' }[species]
        const rendered = band ? BAND_INDEX[band] : undefined
        const actual = day.exposure[variable]
        if (rendered !== actual) {
          throw new Error(
            `${region} ${species} month ${month}: table says ${rendered}, calendarPollen says ${actual}`,
          )
        }
      }
    }
  }
}

function seasonTable(species, label) {
  const rows = REGIONS.map(([id, name]) => {
    const months = REGION_SEASONS[id][species] ?? {}
    const cells = MONTHS.map((_, i) => {
      const band = months[i + 1]
      if (!band) return '        <td></td>'
      const { letter, word } = BAND_CELL[band]
      return `        <td class="band band-${band}"><abbr title="${word} — ${MONTH_NAMES[i]}">${letter}</abbr></td>`
    })
    return [`      <tr>`, `        <th scope="row">${name}</th>`, ...cells, `      </tr>`].join('\n')
  })
  const headerCells = MONTHS.map(
    (m, i) => `        <th scope="col"><abbr title="${MONTH_NAMES[i]}">${m}</abbr></th>`,
  )
  return [
    `<div class="season-table">`,
    `  <table>`,
    `    <caption>${label}</caption>`,
    `    <thead>`,
    `      <tr>`,
    `        <th scope="col">Region</th>`,
    ...headerCells,
    `      </tr>`,
    `    </thead>`,
    `    <tbody>`,
    ...rows,
    `    </tbody>`,
    `  </table>`,
    `</div>`,
  ].join('\n')
}

/**
 * The legend renders from BAND_INDEX so the band -> UPI mapping on the page
 * can never disagree with the mapping the app estimates with.
 */
function legend() {
  return [
    `<p class="season-legend">`,
    `  <span class="band band-low">L</span> low, shown as index ${BAND_INDEX.low} (Very Low) ·`,
    `  <span class="band band-med">M</span> moderate, shown as index ${BAND_INDEX.med} (Moderate) ·`,
    `  <span class="band band-high">H</span> high, shown as index ${BAND_INDEX.high} (High) ·`,
    `  blank = out of season`,
    `</p>`,
  ].join('\n')
}

/** Every generated block, by page. New pages register here as they land. */
const PAGES = {
  'public/pollen/calendar.html': {
    'season-tables': [
      legend(),
      seasonTable('birch', 'Birch — the tree season the calendar can claim'),
      seasonTable('grass', 'Grass'),
      seasonTable('ragweed', 'Ragweed'),
    ].join('\n'),
  },
}

const begin = (id) =>
  `<!-- begin generated: ${id} — by scripts/generate-pollen-tables.mjs; edit src/sources/pollenCalendar.ts, not here -->`
const end = (id) => `<!-- end generated: ${id} -->`

function blockIn(source, id) {
  const start = source.indexOf(begin(id))
  const stop = source.indexOf(end(id))
  return start === -1 || stop === -1 ? null : source.slice(start, stop + end(id).length)
}

verifyAgainstCalendarPollen()

const mode = process.argv[2]
let drifted = false

for (const [file, blocks] of Object.entries(PAGES)) {
  const url = new URL(`../${file}`, import.meta.url)
  for (const [id, body] of Object.entries(blocks)) {
    const wanted = [begin(id), body, end(id)].join('\n')
    if (mode === '--check' || mode === '--write') {
      let source
      try {
        source = await readFile(url, 'utf8')
      } catch {
        console.error(`generate-pollen-tables: ${file} is missing`)
        drifted = true
        continue
      }
      const found = blockIn(source, id)
      if (found === wanted) continue
      if (mode === '--write' && found !== null) {
        await writeFile(url, source.replace(found, wanted))
        console.log(`generate-pollen-tables: wrote ${id} in ${file}`)
      } else {
        console.error(
          found === null
            ? `generate-pollen-tables: ${file} has no "${id}" block (markers missing)`
            : `generate-pollen-tables: ${file} "${id}" has drifted from pollenCalendar.ts`,
        )
        drifted = true
      }
    } else {
      console.log(wanted)
    }
  }
}

if (drifted) {
  if (mode === '--check') console.error('Fix pollenCalendar.ts, then: node scripts/generate-pollen-tables.mjs --write')
  process.exit(1)
}
if (mode === '--check') console.log('generate-pollen-tables: pages match pollenCalendar.ts')
