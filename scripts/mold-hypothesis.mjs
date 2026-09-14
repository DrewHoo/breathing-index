// Does mold explain the bad days nothing else does? (specs/28-mold.md §8)
//
// An `unmodeled-trigger` conflict is a bad day on which every variable the app
// tracks had already been proven tolerable at those exposures — the engine's
// own missing-variable detector. If those days pile up in July–October, that is
// the signature of an outdoor mold season, because that is when Alternaria and
// Cladosporium are in the air and it is not when much else the app misses is.
// This is a question about a diary that already exists, so it is a script over
// an export and not a feature.
//
//   node scripts/mold-hypothesis.mjs ~/Downloads/breathing-index-2026-09-14.json
//
// Reads the JSON that Settings → Export backup writes: a plain array of diary
// entries. It changes nothing and writes nothing.
import { readFile } from 'node:fs/promises'
import { register } from 'node:module'

// The engine is TypeScript with extensionless imports; Node strips the types
// and this teaches it the paths (same trick as generate-pollen-tables.mjs).
register('./ts-ext-resolver.mjs', import.meta.url)
const { buildModel } = await import('../src/engine/infer.ts')

/** Northern-hemisphere dry-spore season, the months the proxy is live in. */
const SEASON = [7, 8, 9, 10]
const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const path = process.argv[2]
if (!path) {
  console.error('usage: node scripts/mold-hypothesis.mjs <diary-export.json>')
  process.exit(1)
}

const parsed = JSON.parse(await readFile(path, 'utf8'))
if (!Array.isArray(parsed)) throw new Error(`${path} is not a diary export (expected an array)`)

// Entries logged with no air attached carry an empty vector, and an empty
// vector is unknown air rather than clean air: inference must not see them.
const entries = parsed.filter((e) => !e.pendingExposure && e.exposure && e.time)
const model = buildModel(entries)

const unexplained = model.conflicts
  .filter((c) => c.kind === 'unmodeled-trigger')
  .map((c) => entries[c.entryIndex])
  .filter(Boolean)
  .map((e) => ({
    date: e.time.slice(0, 10),
    month: Number(e.time.slice(5, 7)),
    rating: e.rating,
    note: e.note ?? '',
  }))
  .sort((a, b) => a.date.localeCompare(b.date))

const inSeason = unexplained.filter((d) => SEASON.includes(d.month))
const rest = unexplained.filter((d) => !SEASON.includes(d.month))

console.log(`${entries.length} entries read from ${path}`)
const n = unexplained.length
console.log(`${n} bad ${n === 1 ? 'day' : 'days'} nothing tracked explains`)
if (n === 0) {
  console.log('Nothing to look at: no unmodeled-trigger conflicts in this diary.')
  process.exit(0)
}

const share = ((inSeason.length / n) * 100).toFixed(0)
console.log(`  Jul–Oct: ${inSeason.length} (${share} %)`)
console.log(`  the rest of the year: ${rest.length}`)

// By month, so a pile-up is visible without counting rows by hand.
const byMonth = new Map()
for (const day of unexplained) byMonth.set(day.month, (byMonth.get(day.month) ?? 0) + 1)
for (const month of [...byMonth.keys()].sort((a, b) => a - b)) {
  const days = byMonth.get(month)
  const bar = '█'.repeat(days)
  console.log(`  ${MONTHS[month].padEnd(4)}${bar} ${days}${SEASON.includes(month) ? ' ←' : ''}`)
}

// And the dates themselves, because the next step is eyeballing them against
// the weather: a dry warm windy week after a wet one is the shape to look for.
console.log('\nThe days, to check against dry spells:')
for (const day of unexplained) {
  console.log(`  ${day.date}  rated ${day.rating}${day.note ? `  “${day.note}”` : ''}`)
}
