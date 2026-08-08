// The single source of truth for the pollutant rows of PRIORS in src/engine/config.ts.
//
// The published tables live here in the units their publishers use — ppb/ppm for the
// EPA gases, µg/m³ for particulates and the WHO guidelines — and this script applies the
// volume-to-mass conversion and emits the µg/m³ block that config.ts carries verbatim,
// between its `--- derived by ... ---` markers. The engine imports nothing at runtime:
// its constants stay plain literals, and `--check` (wired into `npm test`) is what keeps
// the literals and this derivation from drifting apart.
//
//   node scripts/derive-breakpoints.mjs           print the block
//   node scripts/derive-breakpoints.mjs --check    exit 1 if config.ts has drifted
//   node scripts/derive-breakpoints.mjs --write    rewrite the block in config.ts
import { readFile, writeFile } from 'node:fs/promises'

const CONFIG = new URL('../src/engine/config.ts', import.meta.url)
const BEGIN = '  // --- derived by scripts/derive-breakpoints.mjs — edit there, not here ---'
const END = '  // --- end derived ---'

/**
 * Gas volume ratio -> mass concentration at the EPA's reference conditions,
 * 25 °C and 1013 hPa (molar volume 24.45 L/mol): µg/m³ = ppb × M / 24.45.
 */
const UG_M3_PER_PPB = {
  o3: 1.96, // M = 48.00 g/mol
  no2: 1.88, // M = 46.01
  so2: 2.62, // M = 64.06
  co: 1.145, // M = 28.01
}

/**
 * US EPA AQI breakpoints as published (40 CFR part 58 appendix G, including the
 * 2024 PM2.5 revision). Each number is the *lower* bound of its category — the
 * exposure at which that category begins. "usg" = Unhealthy for Sensitive Groups.
 */
const EPA = {
  pm25: { unit: 'µg/m³', window: '24-h', moderate: 9.1, usg: 35.5, unhealthy: 55.5 },
  pm10: { unit: 'µg/m³', window: '24-h', moderate: 55, usg: 155, unhealthy: 255 },
  o3: { unit: 'ppb', window: '8-h', moderate: 55, usg: 71, unhealthy: 86 },
  no2: { unit: 'ppb', window: '1-h', moderate: 54, usg: 101, unhealthy: 361 },
  so2: { unit: 'ppb', window: '1-h', moderate: 36, usg: 76, unhealthy: 186 },
  co: { unit: 'ppm', window: '8-h', moderate: 4.5, usg: 9.5, unhealthy: 12.5 },
}

const CATEGORY = { moderate: 'Moderate', usg: 'USG', unhealthy: 'Unhealthy' }

/** An EPA row, converted to µg/m³ when the table publishes a volume ratio. */
function epa(pollutant, category, label = CATEGORY[category]) {
  const table = EPA[pollutant]
  const asPublished = table[category]
  const perPpb = UG_M3_PER_PPB[pollutant]
  const ppb = table.unit === 'ppm' ? asPublished * 1000 : asPublished
  return {
    label,
    value: perPpb ? Math.round(ppb * perPpb) : asPublished,
    published: perPpb ? `${asPublished} ${table.unit}` : null,
    conversion: perPpb ? `×${perPpb}` : null,
  }
}

/** A row from a guideline that is already published in µg/m³ — nothing to convert. */
function asIs(value, label) {
  return { label, value, published: null, conversion: null }
}

/**
 * The rows themselves. `summary` says where the row comes from, in what units, and
 * what happened to them; the generated detail line names the category behind each
 * level. Levels are the Breathing Index's: 2 noticeable, 3 limiting, 4 dangerous.
 */
const ROWS = [
  {
    variable: 'pm25',
    summary: ['EPA AQI table (2024 PM2.5 revision), 24-h mean, published in µg/m³ — no conversion.'],
    levels: {
      2: epa('pm25', 'moderate'),
      3: epa('pm25', 'usg'),
      4: epa('pm25', 'unhealthy'),
    },
  },
  {
    variable: 'pm10',
    summary: ['EPA AQI table, 24-h mean, published in µg/m³ — no conversion.'],
    levels: {
      2: epa('pm10', 'moderate'),
      3: epa('pm10', 'usg'),
      4: epa('pm10', 'unhealthy'),
    },
  },
  {
    variable: 'o3',
    summary: [
      'EPA AQI table, 8-h mean, published in ppb -> µg/m³ at 25 °C / 1013 hPa. Level 2 is',
      'the WHO 2021 8-h guideline instead: stricter than EPA Moderate (55 ppb ≈ 108 µg/m³),',
      'which is what a sensitive-user ceiling wants.',
    ],
    levels: {
      2: asIs(100, 'WHO 8-h AQG'),
      3: epa('o3', 'usg', 'EPA USG'),
      4: epa('o3', 'unhealthy', 'EPA Unhealthy'),
    },
  },
  {
    variable: 'no2',
    summary: [
      'WHO 2021 air quality guidelines, published in µg/m³ — not EPA, and deliberately',
      'stricter than it: EPA 1-h USG starts at 101 ppb ≈ 190 µg/m³. Level 3 is a hand-set',
      'step between the two WHO numbers, not a published breakpoint.',
    ],
    levels: {
      2: asIs(25, 'WHO 24-h AQG'),
      3: asIs(100, 'hand-set'),
      4: asIs(200, 'WHO 1-h guideline'),
    },
  },
  {
    variable: 'so2',
    summary: [
      'WHO / EU guidelines, published in µg/m³ — not EPA, and stricter than it: EPA 1-h USG',
      'starts at 76 ppb ≈ 199 µg/m³.',
    ],
    levels: {
      2: asIs(40, 'WHO 2021 24-h AQG'),
      3: asIs(125, 'WHO 2005 24-h IT-1'),
      4: asIs(350, 'EU 1-h limit'),
    },
  },
  {
    variable: 'co',
    summary: [
      'WHO guidelines, published in mg/m³, written here in µg/m³ (×1000) to match the rest',
      'of the engine. Level 4 is hand-set and sits just *above* EPA 8-h Unhealthy',
      '(12.5 ppm ≈ 14313 µg/m³) — the one row that is not conservative against EPA.',
    ],
    levels: {
      2: asIs(4000, 'WHO 24-h AQG'),
      3: asIs(10000, 'WHO 8-h guideline'),
      4: asIs(15000, 'hand-set'),
    },
  },
]

const LEVELS = [2, 3, 4]

function renderRow(row) {
  const levels = LEVELS.filter((level) => row.levels[level])
  const detail = levels
    .map((level) => {
      const { label, value, published, conversion } = row.levels[level]
      const derivation = published ? `${published} ${conversion} = ${value}` : value
      return `${level} = ${label} ${derivation}`
    })
    .join(' · ')
  const body = levels.map((level) => `${level}: ${row.levels[level].value}`).join(', ')
  return [
    ...row.summary.map((line) => `  // ${line}`),
    `  //   ${detail}`,
    `  ${row.variable}: { ${body} }, // µg/m³`,
  ].join('\n')
}

/** The block config.ts must contain verbatim. */
const block = [BEGIN, ...ROWS.map(renderRow), END].join('\n')

function blockIn(source) {
  const start = source.indexOf(BEGIN)
  const end = source.indexOf(END)
  return start === -1 || end === -1 ? null : source.slice(start, end + END.length)
}

const source = await readFile(CONFIG, 'utf8')
const mode = process.argv[2]

if (mode === '--check') {
  const found = blockIn(source)
  if (found === block) {
    console.log('derive-breakpoints: config.ts matches the derivation')
  } else {
    console.error(
      found === null
        ? 'derive-breakpoints: config.ts has no derived block (markers missing).'
        : 'derive-breakpoints: config.ts has drifted from the derivation.\n\n' +
            `--- config.ts ---\n${found}\n`,
    )
    console.error(`--- derive-breakpoints.mjs ---\n${block}\n`)
    console.error('Fix the tables here, then: node scripts/derive-breakpoints.mjs --write')
    process.exit(1)
  }
} else if (mode === '--write') {
  const found = blockIn(source)
  if (found === null) throw new Error('config.ts has no derived block (markers missing)')
  await writeFile(CONFIG, source.replace(found, block))
  console.log('derive-breakpoints: wrote src/engine/config.ts')
} else {
  console.log(block)
}
