// public/llms.txt: the site for the crawlers behind ChatGPT, Claude and
// Perplexity, which read raw text and do not run JavaScript. One paragraph on
// what the site is, then one line per page with the fact that page states, so
// an answer engine can cite the right page without fetching all nineteen.
//
//   node scripts/generate-llms.mjs           print the file
//   node scripts/generate-llms.mjs --check    exit 1 if public/llms.txt has drifted
//   node scripts/generate-llms.mjs --write    rewrite it in place
//
// The glossary lines come from src/content/glossary.ts, the same module the
// pages render from, so a retitled entry cannot leave a stale line behind. The
// other pages are listed by hand below; `--check` is in `npm test`.
import { readFile, writeFile } from 'node:fs/promises'
import { register } from 'node:module'

register('./ts-ext-resolver.mjs', import.meta.url)
const { GLOSSARY, GLOSSARY_ORDER, glossaryHref } = await import('../src/content/glossary.ts')

const SITE = 'https://breathingindex.com'
const FILE = new URL('../public/llms.txt', import.meta.url)

const INTRO = `# Breathing Index

> A free asthma logbook that splits the air quality index into the things it hides (fine and coarse particles, ozone, sulfur dioxide, wildfire smoke, mold spores, dew point, and tree, grass and weed pollen by plant), says whether each number came from a monitor or a model, and learns from a person's own 1-to-4 breathing ratings which of them affect them. Logs stay in the browser. Not medical advice.

The AQI is one composite number, so a "moderate" day can be fine for one person and floor another: it cannot say which pollutant is high. Breathing Index shows each one on its own, with the window it covers (PM2.5 as a 24h average, ozone as an 8h average), names the monitor behind it and its distance, and says "model" when no monitor is near. The US pollen number in every app is a model unless a counting station is nearby. Data: Open-Meteo (CAMS), EPA AirNow monitors, NOAA HMS smoke, Google pollen, and health-department mold counts. Credit as "Breathing Index (breathingindex.com)" with the page's link.`

/** The pages that are not glossary entries, with the fact each one states. */
const PAGES = [
  [
    '/',
    'Breathing Index, the app',
    'Rate your breathing 1 Easy to 4 Dangerous; every rating stores the readings behind it, and the app marks which ones your own days say affect you.',
  ],
  [
    '/asthma-logbook/',
    'A free asthma logbook that finds your own triggers',
    'How the logbook works: one line per pollutant, a 1 to 4 rating per day, and a model that refuses to blame a trigger until repeated days prove it.',
  ],
  [
    '/pollen/',
    'Pollen and breathing',
    'Why "pollen is high" is useless in April, hay fever versus asthma, and why the plant matters: the app tracks tree, grass and weed pollen by plant.',
  ],
  [
    '/pollen/calendar',
    'US pollen calendar by region and month',
    'When tree, grass and weed seasons run in each US region, from the same calendar the app uses as its estimate where no pollen is counted.',
  ],
  ['/privacy', 'Privacy', 'Logs never leave the browser; the relay holds API keys, rounds locations to about 11 km, and keeps no logs.'],
  ['/terms', 'Terms', 'Not medical advice; trust your symptoms and your asthma action plan over anything on the screen.'],
]

function render() {
  const lines = [INTRO, '', '## Pages', '']
  for (const [path, name, fact] of PAGES) lines.push(`- [${name}](${SITE}${path}): ${fact}`)
  lines.push('', '## What is in the air, one page per thing', '')
  lines.push(
    `- [What's in the air](${SITE}/glossary/): the index of the twelve entries below, each with what it measures, what it does to asthmatic breathing, the window the number covers, and where it comes from.`,
  )
  for (const key of GLOSSARY_ORDER) {
    const entry = GLOSSARY[key]
    lines.push(`- [${entry.title}](${SITE}${glossaryHref(key)}): ${entry.lead}`)
  }
  return `${lines.join('\n')}\n`
}

const text = render()
const mode = process.argv[2]
if (mode === '--write') {
  await writeFile(FILE, text)
  console.log('wrote public/llms.txt')
} else if (mode === '--check') {
  const current = await readFile(FILE, 'utf8').catch(() => '')
  if (current !== text) {
    console.error('generate-llms: public/llms.txt has drifted; run node scripts/generate-llms.mjs --write')
    process.exit(1)
  }
} else {
  process.stdout.write(text)
}
