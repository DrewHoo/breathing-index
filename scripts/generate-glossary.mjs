// The single source of truth for the generated block in /glossary. The words
// live in src/content/glossary.ts — the same module the `?` sheet renders from
// inside the app — and this script renders them as static HTML between
// `begin generated` / `end generated` markers, so the page a crawler reads and
// the sheet a user opens can never carry different text. `--check` (wired into
// `npm test`) is what keeps them from drifting apart.
//
//   node scripts/generate-glossary.mjs           print the block
//   node scripts/generate-glossary.mjs --check    exit 1 if the page has drifted
//   node scripts/generate-glossary.mjs --write    rewrite the block in place
//
// Same shape and the same Node ≥ 22.18 type-stripping trick as
// generate-pollen-tables.mjs, for the same reason: the content is TypeScript
// and the page must render from it rather than from a copy of it.
import { readFile, writeFile } from 'node:fs/promises'
import { register } from 'node:module'

// The module's own imports are extensionless (Vite resolves them); teach this
// process to retry with `.ts` before importing it. Must precede the import,
// hence the dynamic form.
register('./ts-ext-resolver.mjs', import.meta.url)
const { GLOSSARY, GLOSSARY_ORDER, GLOSSARY_PARTS, breathingBullets, sourceBullets } = await import(
  '../src/content/glossary.ts',
)

/** Text going into markup. The copy has quotes and dashes in it, not tags. */
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The same shapes the sheet draws (src/ui/help.tsx): a paragraph, or a list. */
function part(label, body) {
  return [`        <div class="gl-part">`, `          <span class="gl-label">${label}</span>`, ...body, `        </div>`]
}
const paragraph = (text) => [`          <p>${esc(text)}</p>`]
const list = (items) => [
  `          <ul class="gl-list">`,
  ...items.map(({ lead, text }) =>
    lead
      ? `            <li><strong>${esc(lead)}.</strong> ${esc(text)}</li>`
      : `            <li>${esc(text)}</li>`,
  ),
  `          </ul>`,
]

function section(key) {
  const entry = GLOSSARY[key]
  const head = [
    `        <h2>${esc(entry.name)}</h2>`,
    ...(entry.meta ? [`        <p class="gl-meta">${esc(entry.meta)}</p>`] : []),
    ...(entry.image
      ? [
          `        <figure class="gl-figure">`,
          `          <img src="/glossary/img/${entry.image.src}" alt="${esc(entry.image.alt)}" width="720" height="480" loading="lazy" />`,
          `          <figcaption>${esc(entry.image.caption)}</figcaption>`,
          `        </figure>`,
        ]
      : []),
  ]
  // A part the entry leaves out is skipped, not labelled over nothing.
  const parts = GLOSSARY_PARTS.filter(([field]) => entry[field] !== undefined).flatMap(([field, label]) => {
    if (field === 'breathing') return part(label, list(breathingBullets(entry)))
    if (field === 'source') {
      const bullets = sourceBullets(entry)
      return part(label, bullets.length > 1 ? list(bullets.map((text) => ({ text }))) : paragraph(bullets[0]))
    }
    return part(label, paragraph(entry[field]))
  })
  return [`      <section class="gl-entry" id="${key}">`, ...head, ...parts, `      </section>`].join('\n')
}

/** Every generated block, by page. New pages register here as they land. */
const PAGES = {
  'public/glossary/index.html': {
    'glossary-entries': GLOSSARY_ORDER.map(section).join('\n'),
  },
}

const begin = (id) =>
  `<!-- begin generated: ${id} — by scripts/generate-glossary.mjs; edit src/content/glossary.ts, not here -->`
const end = (id) => `<!-- end generated: ${id} -->`

function blockIn(source, id) {
  const start = source.indexOf(begin(id))
  const stop = source.indexOf(end(id))
  return start === -1 || stop === -1 ? null : source.slice(start, stop + end(id).length)
}

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
        console.error(`generate-glossary: ${file} is missing`)
        drifted = true
        continue
      }
      const found = blockIn(source, id)
      if (found === wanted) continue
      if (mode === '--write' && found !== null) {
        await writeFile(url, source.replace(found, wanted))
        console.log(`generate-glossary: wrote ${id} in ${file}`)
      } else {
        console.error(
          found === null
            ? `generate-glossary: ${file} has no "${id}" block (markers missing)`
            : `generate-glossary: ${file} "${id}" has drifted from src/content/glossary.ts`,
        )
        drifted = true
      }
    } else {
      console.log(wanted)
    }
  }
}

if (drifted) {
  if (mode === '--check') console.error('Fix src/content/glossary.ts, then: node scripts/generate-glossary.mjs --write')
  process.exit(1)
}
if (mode === '--check') console.log('generate-glossary: pages match src/content/glossary.ts')
