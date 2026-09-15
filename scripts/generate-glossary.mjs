// The single source of truth for the /glossary pages. The words live in
// src/content/glossary.ts — the same module the `?` sheet renders from inside
// the app — and this script renders them as static HTML, so the page a crawler
// reads and the sheet a user opens can never carry different text. `--check`
// (wired into `npm test`) is what keeps them from drifting apart.
//
//   node scripts/generate-glossary.mjs           print every page
//   node scripts/generate-glossary.mjs --check    exit 1 if a page has drifted
//   node scripts/generate-glossary.mjs --write    rewrite the pages in place
//
// Thirteen pages now, not one: an index at /glossary/ and a page per term at
// /glossary/<slug>/ (specs/36-glossary-pages.md). They are whole files rather
// than blocks between `begin generated` markers, because twelve hand-kept
// shells around twelve generated blocks is twelve more places for a page to
// disagree with the module. Everything a shell used to hold — the intro line,
// the breadcrumbs, the disclaimer, the footer — is a named constant below.
//
// Same Node ≥ 22.18 type-stripping trick as generate-pollen-tables.mjs, for the
// same reason: the content is TypeScript and the pages must render from it
// rather than from a copy of it.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { register } from 'node:module'

// The module's own imports are extensionless (Vite resolves them); teach this
// process to retry with `.ts` before importing it. Must precede the import,
// hence the dynamic form.
register('./ts-ext-resolver.mjs', import.meta.url)
const { GLOSSARY, GLOSSARY_ORDER, GLOSSARY_PARTS, breathingBullets, glossaryHref, sourceBullets } =
  await import('../src/content/glossary.ts')
// The one disclaimer sentence, from the module every other surface reads it
// from. A second copy of it in this file would be the drift this script exists
// to prevent, one level up.
const { DISCLAIMER } = await import('../src/ui/labels.ts')

const SITE = 'https://breathingindex.com'

/** Text going into markup. The copy has quotes and dashes in it, not tags. */
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The rail every term page carries, and the four headings it groups under.
 * Someone who arrived from a search for one thing should be able to see the
 * other eleven and what kind of thing each one is.
 *
 * Listed here rather than derived, because a grouping is an editorial claim:
 * dry-spore conditions belong beside the spores they stand in for, not beside
 * the weather they are computed from. `coverage()` is what keeps the list
 * honest when an entry is added to the module.
 */
const RAIL = [
  ['Particles', ['pm25', 'pm_coarse', 'smoke']],
  ['Gases', ['o3', 'so2']],
  ['Spores and pollen', ['mold', 'dry_spore_index', 'pollen_tree', 'pollen_grass', 'pollen_weed']],
  ['Weather and you', ['dewpoint', 'viral']],
]

/** The page chrome the hand-kept shell used to hold. */
const WORDMARK = '<a class="wordmark" href="/">Breathing Index 🫁</a>'
const INDEX_TITLE = "What's in the air"
const INDEX_INTRO =
  'One entry for every number the app can show: what the number measures, what it does to breathing, the span it covers, and where it came from.'
const INDEX_DESCRIPTION =
  'Fine particles, ozone, smoke, mold, pollen, dew point: what each does to asthmatic breathing, the window the number covers, and where it comes from.'
// The photographs are Creative Commons. Every term page carries its own credit
// in the figure caption; the index shows twelve of them as thumbnails and has
// no room for twelve captions, so the set is credited once and each picture's
// own credit is one tap away.
const INDEX_CREDIT =
  'The photographs come from Wikimedia Commons, public domain or CC BY / CC BY-SA. Each entry carries its own credit.'
// Every glossary page named the app and never said what it was: a crawler
// could learn what ozone does to asthma here and leave with no idea a tool
// existed. One sentence above the footer, on all thirteen.
const PRODUCT_LINE =
  'Breathing Index is a free logbook for this. You rate your breathing from 1 to 4, it stores every one of these readings alongside the rating, and over time it marks which of them your own days say affect you.'
const PRODUCT_SLUG = 'asthma-logbook'
const PRODUCT_TITLE = 'A free asthma logbook that finds your own triggers'
const PRODUCT_DESCRIPTION =
  'Rate your breathing 1 to 4. It stores the ozone, particles, pollen and dew point behind each rating, then marks which ones your own days say affect you.'

const FOOTER = [
  '      <p class="gl-product">',
  `        ${esc(PRODUCT_LINE)} <a href="/${PRODUCT_SLUG}/">What this is</a> · <a href="/">Open it</a>`,
  '      </p>',
  '      <footer>',

  '        <a href="/">Breathing Index</a><a href="/pollen/">Pollen</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>',
  '      </footer>',
]

const PROVENANCE = [
  '  Generated by scripts/generate-glossary.mjs from src/content/glossary.ts —',
  '  the same module the `?` sheet inside the app reads — so this page and that',
  '  sheet cannot carry different words. Edit the module, then:',
  '  node scripts/generate-glossary.mjs --write. `npm test` fails if they drift.',
  '',
  '  Served straight off disk by GitHub Pages, same as /privacy, /terms and the',
  '  /pollen pages: no bundle, no JS, no router. The service worker leaves',
  '  /glossary alone (navigateFallbackDenylist in vite.config.ts).',
  '',
  '  Provenance: the entry copy is an agent’s draft, written from',
  '  research/asthma-triggers-evidence.md and the draft table in',
  '  specs/30-glossary.md, for Drew to edit. It has not been through his hand yet.',
]

/** Every entry is grouped exactly once, or the rail is silently short a term. */
function coverage() {
  const railed = RAIL.flatMap(([, keys]) => keys)
  const complaints = [
    ['ungrouped in RAIL', GLOSSARY_ORDER.filter((key) => !railed.includes(key))],
    ['grouped but not in GLOSSARY_ORDER', railed.filter((key) => !GLOSSARY_ORDER.includes(key))],
    ['grouped twice', railed.filter((key, i) => railed.indexOf(key) !== i)],
  ]
  for (const [what, keys] of complaints) {
    if (keys.length === 0) continue
    console.error(`generate-glossary: ${keys.join(', ')} ${what} (scripts/generate-glossary.mjs)`)
    process.exit(1)
  }
}

/** The same shapes the sheet draws (src/ui/help.tsx): a paragraph, or a list. */
const PAD = '            '
function part(label, body) {
  return [`${PAD}<div class="gl-part">`, `${PAD}  <span class="gl-label">${label}</span>`, ...body, `${PAD}</div>`]
}
const paragraph = (text) => [`${PAD}  <p>${esc(text)}</p>`]
const list = (items) => [
  `${PAD}  <ul class="gl-list">`,
  ...items.map(({ lead, text }) =>
    lead
      ? `${PAD}    <li><strong>${esc(lead)}.</strong> ${esc(text)}</li>`
      : `${PAD}    <li>${esc(text)}</li>`,
  ),
  `${PAD}  </ul>`,
]

/**
 * One entry, as the article a term page is. The name is the page's `h1` now
 * rather than one `h2` among twelve: the page is about this one thing, and a
 * crawler should be told so once, at the top.
 */
function article(key) {
  const entry = GLOSSARY[key]
  const head = [
    `${PAD}<h1>${esc(entry.name)}</h1>`,
    ...(entry.meta ? [`${PAD}<p class="gl-meta">${esc(entry.meta)}</p>`] : []),
    ...(entry.image
      ? [
          // Not lazy, unlike the index's thumbnails: on a term page this
          // picture is the first thing under the name and is usually what the
          // browser paints last, so deferring it defers the page.
          `${PAD}<figure class="gl-figure">`,
          `${PAD}  <img src="/glossary/img/${entry.image.src}" alt="${esc(entry.image.alt)}" width="720" height="480" />`,
          `${PAD}  <figcaption>${esc(entry.image.caption)}</figcaption>`,
          `${PAD}</figure>`,
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
  return [`          <article class="gl-entry">`, ...head, ...parts, `          </article>`]
}

/**
 * All twelve terms, on every term page. A column beside the text on a wide
 * screen and a scrolling row of chips under the header on a phone — one list
 * of markup either way, because the arrangement is CSS and these pages are
 * served off disk with no script behind them. The current term is marked and
 * not linked: there is nowhere for it to go.
 */
function rail(current) {
  const chips = RAIL.flatMap(([group, keys]) => [
    `          <span class="gl-group">${esc(group)}</span>`,
    ...keys.map((key) =>
      key === current
        ? `          <span class="gl-chip gl-here" aria-current="page">${esc(GLOSSARY[key].name)}</span>`
        : `          <a class="gl-chip" href="${glossaryHref(key)}">${esc(GLOSSARY[key].name)}</a>`,
    ),
  ])
  return [
    `        <nav class="gl-rail" aria-label="${esc(INDEX_TITLE)}">`,
    `          <a class="gl-all" href="/glossary/">All twelve</a>`,
    ...chips,
    `        </nav>`,
  ]
}

/** Previous and next along GLOSSARY_ORDER, which is the air table's own order. */
function updown(key) {
  const at = GLOSSARY_ORDER.indexOf(key)
  const link = (neighbour, side, word) =>
    neighbour === undefined
      ? []
      : [
          `            <a class="gl-${side}" href="${glossaryHref(neighbour)}">`,
          `              <span class="gl-updown-label">${word}</span>`,
          `              <span class="gl-updown-name">${esc(GLOSSARY[neighbour].name)}</span>`,
          `            </a>`,
        ]
  return [
    `          <nav class="gl-updown" aria-label="The entries either side">`,
    ...link(GLOSSARY_ORDER[at - 1], 'prev', 'Previous'),
    ...link(GLOSSARY_ORDER[at + 1], 'next', 'Next'),
    `          </nav>`,
  ]
}

/** One card on the index: the photograph, the name, the mono line. */
function card(key) {
  const entry = GLOSSARY[key]
  return [
    // The key and not the slug: the sheet that shipped links to /glossary#pm25,
    // and anything else out there pointing at an anchor points at the key too.
    `        <li class="gl-card" id="${key}">`,
    `          <a href="${glossaryHref(key)}">`,
    ...(entry.image
      ? [
          `            <img src="/glossary/img/${entry.image.src}" alt="${esc(entry.image.alt)}" width="720" height="480" loading="lazy" />`,
        ]
      : [`            <span class="gl-card-blank" aria-hidden="true"></span>`]),
    `            <span class="gl-card-name">${esc(entry.name)}</span>`,
    ...(entry.meta ? [`            <span class="gl-meta">${esc(entry.meta)}</span>`] : []),
    `          </a>`,
    `        </li>`,
  ]
}

/** The trail, in the shape the two documents that already carry one write it. */
function breadcrumb(trail) {
  const item = ([name, url], i) =>
    `          { "@type": "ListItem", "position": ${i + 1}, "name": ${JSON.stringify(name)}${url === undefined ? '' : `, "item": ${JSON.stringify(url)}`} }`
  return [
    '    <script type="application/ld+json">',
    '      {',
    '        "@context": "https://schema.org",',
    '        "@type": "BreadcrumbList",',
    '        "itemListElement": [',
    trail.map(item).join(',\n'),
    '        ]',
    '      }',
    '    </script>',
  ]
}

/** The shell all thirteen of these pages are, down to the stylesheets. */
function page({ title, description, canonical, trail, body }) {
  return [
    '<!doctype html>',
    '<!--',
    ...PROVENANCE,
    '-->',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />',
    `    <title>${esc(title)} — Breathing Index</title>`,
    `    <meta name="description" content="${esc(description)}" />`,
    `    <link rel="canonical" href="${canonical}" />`,
    '    <meta name="theme-color" content="#F3F6F7" />',
    '    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
    '    <link rel="stylesheet" href="/legal.css" />',
    '    <link rel="stylesheet" href="/glossary.css" />',
    ...breadcrumb(trail),
    '  </head>',
    ...body,
    '</html>',
    '',
  ].join('\n')
}

function termPage(key) {
  const entry = GLOSSARY[key]
  return page({
    title: entry.title,
    description: entry.description,
    canonical: SITE + glossaryHref(key),
    trail: [['Breathing Index', `${SITE}/`], [INDEX_TITLE, `${SITE}/glossary/`], [entry.name]],
    body: [
      '  <body class="gl-term">',
      '    <main>',
      `      ${WORDMARK}`,
      `      <nav class="crumbs"><a href="/glossary/">${esc(INDEX_TITLE)}</a> · ${esc(entry.name)}</nav>`,
      '',
      '      <div class="gl-layout">',
      ...rail(key),
      '        <div class="gl-column">',
      ...article(key),
      ...updown(key),
      '          <p class="callout">',
      `            <strong>${esc(DISCLAIMER)}</strong>`,
      '          </p>',
      '        </div>',
      '      </div>',
      '',
      ...FOOTER,
      '    </main>',
      '  </body>',
    ],
  })
}

function indexPage() {
  return page({
    title: INDEX_TITLE,
    description: INDEX_DESCRIPTION,
    canonical: `${SITE}/glossary/`,
    trail: [['Breathing Index', `${SITE}/`], [INDEX_TITLE]],
    body: [
      '  <body class="gl-index">',
      '    <main>',
      `      ${WORDMARK}`,
      '      <nav class="crumbs">Glossary</nav>',
      '',
      `      <h1>${esc(INDEX_TITLE)}</h1>`,
      '',
      `      <p class="gl-intro">${esc(INDEX_INTRO)}</p>`,
      '',
      '      <ul class="gl-cards">',
      ...GLOSSARY_ORDER.flatMap(card),
      '      </ul>',
      '',
      `      <p class="gl-credit">${esc(INDEX_CREDIT)}</p>`,
      '',
      '      <p class="callout">',
      `        <strong>${esc(DISCLAIMER)}</strong>`,
      '      </p>',
      '',
      ...FOOTER,
      '    </main>',
      '  </body>',
    ],
  })
}

function productPage() {
  const para = (t) => ['      <p>', `        ${esc(t)}`, '      </p>', '']
  return page({
    title: PRODUCT_TITLE,
    description: PRODUCT_DESCRIPTION,
    canonical: `${SITE}/${PRODUCT_SLUG}/`,
    trail: [['Breathing Index', `${SITE}/`], [PRODUCT_TITLE]],
    body: [
      '  <body class="gl-page">',
      '    <main>',
      `      ${WORDMARK}`,
      '      <nav class="crumbs">What this is</nav>',
      '',
      `      <h1>${esc(PRODUCT_TITLE)}</h1>`,
      '',
      ...para(
        'A “moderate” air quality index can floor you one day and be fine the next. That is not the index being wrong. It is one composite number standing in for a dozen different things, and it cannot tell you which of them is high today, so it cannot tell you whether today is one of your bad ones.',
      ),
      ...para(
        'Breathing Index takes it apart. Fine particles, coarse particles, ozone, sulphur dioxide, wildfire smoke, mold, dew point, and pollen split into tree, grass and weed, each on its own row with its own trace across the last two days.',
      ),
      '      <h2>How it learns</h2>',
      '',
      ...para(
        'You rate your breathing on four levels: 1 Easy, 2 Noticeable, 3 Limiting, 4 Dangerous. Every rating is stored with the full set of readings for that moment. An easy day is evidence that everything in that air was fine for you. A bad day with several things elevated is ambiguous, and it stays ambiguous until later days settle it.',
      ),
      ...para(
        'After enough entries each row carries a verdict drawn from your own days rather than a population average, and the dashed line on it becomes your level instead of the public guidance. It tells you how today compares to the days you have already logged.',
      ),
      '      <h2>What it costs, and what it keeps</h2>',
      '',
      ...para(
        'It is free, there is no account, and there is nothing to install from a store. It is a web app, so it opens in a browser and can be added to a home screen. Your diary is written to that browser and is never uploaded, which also means it is yours to lose: there is an export in Settings. The source is public.',
      ),
      '      <h2>Where the numbers come from</h2>',
      '',
      ...para(
        'In the United States, readings come from the EPA AirNow monitoring station nearest you when there is one in reach. Everywhere else, and for anything no station measures, they come from Open-Meteo’s model. Mold comes from the health departments that publish a spore count. Every row says which source produced it, because a measurement and a model are not the same claim.',
      ),
      '      <h2>What it is not</h2>',
      '',
      ...para(
        'It is not a diagnosis, not a treatment plan, and not a substitute for a clinician or an asthma action plan. It does not know about your medication. It cannot see indoor air, which is where most people spend most of their day. Coverage is strongest in the United States because the monitoring network is.',
      ),
      '      <p class="callout">',
      `        <strong>${esc(DISCLAIMER)}</strong>`,
      '      </p>',
      '',
      ...para(
        `Every measurement has its own page explaining what it is, what it does to breathing, and where the number comes from. They start at the glossary.`,
      ),
      '      <p><a href="/glossary/">What\u2019s in the air</a> · <a href="/">Open Breathing Index</a></p>',
      '',
      ...FOOTER.slice(3),
      '    </main>',
      '  </body>',
    ],
  })
}

/** Every page this script owns, whole, by the file it is written to. */
const PAGES = {
  [`public/${PRODUCT_SLUG}/index.html`]: productPage(),
  'public/glossary/index.html': indexPage(),
  ...Object.fromEntries(
    GLOSSARY_ORDER.map((key) => [`public/glossary/${GLOSSARY[key].slug}/index.html`, termPage(key)]),
  ),
}

/**
 * A slug that gets renamed leaves its old directory on disk, and Pages goes on
 * serving a page nothing links to and no canonical claims. Only directories
 * directly under public/glossary are looked at, only ones holding a lone
 * index.html count, and img/ is the one that was never a page.
 */
async function strays() {
  const here = new URL('../public/glossary/', import.meta.url)
  const slugs = GLOSSARY_ORDER.map((key) => GLOSSARY[key].slug)
  const found = []
  for (const dirent of await readdir(here, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.name === 'img' || slugs.includes(dirent.name)) continue
    const inside = await readdir(new URL(`${dirent.name}/`, here))
    if (inside.length === 1 && inside[0] === 'index.html') found.push(dirent.name)
  }
  return found
}

coverage()

const mode = process.argv[2]
let drifted = false

for (const [file, wanted] of Object.entries(PAGES)) {
  const url = new URL(`../${file}`, import.meta.url)
  if (mode !== '--check' && mode !== '--write') {
    console.log(`<!-- ${file} -->`)
    console.log(wanted)
    continue
  }
  let found = null
  try {
    found = await readFile(url, 'utf8')
  } catch {
    // Missing is drift too: the page a slug promises has to be there.
  }
  if (found === wanted) continue
  if (mode === '--write') {
    await mkdir(new URL('.', url), { recursive: true })
    await writeFile(url, wanted)
    console.log(`generate-glossary: wrote ${file}`)
  } else {
    console.error(
      found === null
        ? `generate-glossary: ${file} is missing`
        : `generate-glossary: ${file} has drifted from src/content/glossary.ts`,
    )
    drifted = true
  }
}

if (mode === '--check' || mode === '--write') {
  for (const stray of await strays()) {
    const at = new URL(`../public/glossary/${stray}/`, import.meta.url)
    if (mode === '--write') {
      await rm(at, { recursive: true })
      console.log(`generate-glossary: removed public/glossary/${stray}/, which no slug claims`)
    } else {
      console.error(`generate-glossary: public/glossary/${stray}/ is a page no slug claims`)
      drifted = true
    }
  }
}

if (drifted) {
  if (mode === '--check') console.error('Fix src/content/glossary.ts, then: node scripts/generate-glossary.mjs --write')
  process.exit(1)
}
if (mode === '--check') {
  console.log(`generate-glossary: ${Object.keys(PAGES).length} pages match src/content/glossary.ts`)
}
