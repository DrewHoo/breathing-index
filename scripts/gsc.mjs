// Search Console for breathingindex.com: queries, pages, or days.
//
//   node scripts/gsc.mjs query [--from 2026-10-13] [--to 2026-10-19] [--page /glossary/] [--rows 50]
//   node scripts/gsc.mjs page  ...     one row per page
//   node scripts/gsc.mjs date  ...     one row per day
//   node scripts/gsc.mjs query,page    two dimensions
//   node scripts/gsc.mjs sitemap       resubmit public/sitemap.xml and print the sitemaps list
//   node scripts/gsc.mjs inspect <url> [<url>...]   index coverage per URL (about 5 s each)
//
// Auth is gcloud's application-default credentials with the webmasters scope
// and the quota project drewhoover-site:
//   gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/webmasters
//   gcloud auth application-default set-quota-project drewhoover-site
// --json prints the raw rows; otherwise a table sorted by clicks, then impressions.
//
// Two things make the numbers look wrong at first (specs/39-place-pages.md §6):
// with a page filter, the query dimension only sees the queries Google doesn't
// anonymize, so `date` and `page` are the totals and `query` is a sample; and
// the data lags about two days.
import { execFileSync } from 'node:child_process'

const PROPERTY = 'sc-domain:breathingindex.com'
const PREFIX = 'https://breathingindex.com/'
const QUOTA_PROJECT = 'drewhoover-site'
const SITEMAP = `${PREFIX}sitemap.xml`

const args = process.argv.slice(2)
const command = args.find((a) => !a.startsWith('--')) ?? 'query'
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const today = new Date()
const iso = (d) => d.toISOString().slice(0, 10)
const daysAgo = (n) => iso(new Date(today.getTime() - n * 864e5))

const token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], {
  encoding: 'utf8',
}).trim()
const headers = {
  authorization: `Bearer ${token}`,
  'x-goog-user-project': QUOTA_PROJECT,
  'content-type': 'application/json',
}
const site = encodeURIComponent(PROPERTY)

async function call(url, init = {}) {
  const res = await fetch(url, { ...init, headers })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) {
    console.error(JSON.stringify(data, null, 2))
    process.exit(1)
  }
  return data
}

if (command === 'sitemap') {
  await call(`https://www.googleapis.com/webmasters/v3/sites/${site}/sitemaps/${encodeURIComponent(SITEMAP)}`, {
    method: 'PUT',
  })
  await new Promise((r) => setTimeout(r, 3000))
  const list = await call(`https://www.googleapis.com/webmasters/v3/sites/${site}/sitemaps`)
  for (const s of list.sitemap ?? []) {
    const web = (s.contents ?? []).find((c) => c.type === 'web') ?? {}
    console.log(
      `${s.path}: submitted ${s.lastSubmitted}, downloaded ${s.lastDownloaded}, ${web.submitted ?? '?'} URLs submitted, ${web.indexed ?? '?'} indexed, ${s.errors} errors, ${s.warnings} warnings`,
    )
  }
  process.exit(0)
}

if (command === 'inspect') {
  const urls = args.slice(args.indexOf('inspect') + 1).filter((a) => !a.startsWith('--'))
  for (const url of urls) {
    const data = await call('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method: 'POST',
      body: JSON.stringify({ inspectionUrl: url, siteUrl: PROPERTY }),
    })
    const r = data.inspectionResult?.indexStatusResult ?? {}
    console.log(
      `${url.replace(PREFIX, '/')}: ${r.coverageState ?? r.verdict ?? '?'}${r.lastCrawlTime ? `, crawled ${r.lastCrawlTime.slice(0, 10)}` : ''}${r.googleCanonical && r.googleCanonical !== url ? `, canonical ${r.googleCanonical}` : ''}`,
    )
  }
  process.exit(0)
}

const dims = command.split(',')
const from = opt('from', daysAgo(10))
const to = opt('to', daysAgo(1))
const page = opt('page', null)
const rows = Number(opt('rows', 50))
const body = {
  startDate: from,
  endDate: to,
  dimensions: dims,
  type: opt('type', 'web'),
  rowLimit: Math.min(rows, 25000),
  ...(page
    ? { dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'contains', expression: PREFIX.replace(/\/$/, '') + page }] }] }
    : {}),
}
const data = await call(`https://www.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, {
  method: 'POST',
  body: JSON.stringify(body),
})
const out = (data.rows ?? []).map((r) => ({
  keys: r.keys,
  clicks: r.clicks,
  impressions: r.impressions,
  ctr: r.ctr ?? 0,
  position: r.position ?? 0,
}))
if (args.includes('--json')) {
  console.log(JSON.stringify(out, null, 1))
  process.exit(0)
}
console.log(`${PROPERTY} ${from}..${to} ${dims.join(',')}${page ? ` page~${page}` : ''}  (${out.length} rows)`)
const total = out.reduce(
  (a, r) => ({ clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions }),
  { clicks: 0, impressions: 0 },
)
console.log(`total clicks ${total.clicks}, impressions ${total.impressions}`)
console.log(`clicks  impr   ctr   pos  ${dims.join(' | ')}`)
for (const r of out) {
  const keys = r.keys.map((k) => k.replace(PREFIX, '/')).join(' | ')
  console.log(
    `${String(r.clicks).padStart(6)} ${String(r.impressions).padStart(5)} ${(r.ctr * 100).toFixed(1).padStart(5)}% ${r.position.toFixed(1).padStart(5)}  ${keys}`,
  )
}
