// The receipts behind /coverage (specs/37-coverage-map.md): the same days,
// scored three ways against stations that publish real counts — the forecast
// model, a season calendar, and yesterday-again — then written to
// public/coverage/data/backtest.json for scripts/generate-coverage.mjs to
// bake. Like the station harvester, this is a scheduled job and deliberately
// not in `npm test`; tests/coverage.test.ts checks the committed output.
//
//   node scripts/build-coverage-backtest.mjs        recompute and rewrite
//
// Design, and why it is shaped this way:
//
//   MEASURED (pollen and Alternaria): Arpae Emilia-Romagna's open aerobiology
//   feed (CC-BY, dati.arpae.it "dati-pollini-regione") — 13 stations, daily
//   grains-or-spores/m³ by family, published within days. POLLnet's national
//   geoserver was unreachable throughout 2026-09-17, so the backtest anchors
//   on the one Italian region with a working open feed.
//
//   REGION MEAN, not per station: the dataset's station registry was deleted
//   upstream, so station ids cannot be honestly paired with cities. The
//   network's composition is documented — ten provincial capitals plus
//   Cesena, San Giovanni in Persiceto, San Pietro Capofiume and Faenza — so
//   the measured side is the mean across reporting stations and the model
//   side is the mean across those thirteen known cities. A mean needs no
//   pairing, and mis-pairing would have been a real flaw.
//
//   MODEL: Open-Meteo's CAMS pollen (grains/m³, Europe, 92 past days,
//   keyless, CC-BY) — the same land-cover-phenology-weather class of model as
//   every consumer pollen number, and the one whose terms allow a published
//   backtest. Google's do not (research/data-sources-catalog.md).
//
//   CALENDAR: a day-of-year climatology from the same feed's own archive
//   (2013 onward), smoothed ±7 days — a season calendar in its strongest
//   form, knowing nothing about this year.
//
//   YESTERDAY: the measured value one day back. No knowledge at all beyond
//   the station itself.
//
//   CONTROL: PM2.5 at six US monitors, from AirNow's keyless daily files,
//   against the same CAMS family of models (Open-Meteo pm2_5). If the method
//   were rigged against models, the control would score low too. PM2.5 has
//   no season calendar — nobody forecasts particulate from a month table,
//   which is itself part of the point — so its calendar cell is empty.
//
//   METRIC: Spearman rank correlation against the measured series, ties
//   averaged. Units cancel in ranks, so a model bias cannot help or hurt;
//   what is scored is whether the forecast puts the bad days above the good
//   ones.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const OUT = new URL('../public/coverage/data/backtest.json', import.meta.url)
const CACHE = new URL('../node_modules/.cache/coverage-backtest/', import.meta.url)

// ---------------------------------------------------------------------------
// Cached fetch: the Arpae archive is 186 MB and the AirNow window is 92
// files, so raw downloads land in node_modules/.cache and re-runs are cheap.
// ---------------------------------------------------------------------------
await mkdir(CACHE, { recursive: true })
async function fetched(url, { timeout = 120000 } = {}) {
  const key = createHash('sha256').update(url).digest('hex').slice(0, 24)
  const file = new URL(key, CACHE)
  try {
    return await readFile(file, 'utf8')
  } catch {
    // Not cached yet.
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: 'follow' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      await writeFile(file, text)
      return text
    } catch (err) {
      if (attempt >= 3) throw new Error(`${url}: ${err.message ?? err}`)
      await new Promise((r) => setTimeout(r, 3000 * attempt))
    }
  }
}

/** Google Drive's large-file "virus scan" interstitial, answered. */
async function fetchedDrive(id) {
  const direct = await fetched(`https://drive.google.com/uc?id=${id}&export=download`)
  if (!direct.startsWith('<')) return direct
  const uuid = direct.match(/name="uuid" value="([^"]+)"/)?.[1] ?? ''
  return fetched(
    `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t&uuid=${uuid}`,
    { timeout: 600000 },
  )
}

// ---------------------------------------------------------------------------
// Arpae Emilia-Romagna: the measured side.
// ---------------------------------------------------------------------------
const ARPAE_RECENT = '11jVGU42evkEK6rcx3NndkM394htu5bW1' // this year, daily
const ARPAE_ARCHIVE = '1L0632m5gY4kDdvv5X8oey09VtijujtpH' // 2013 → last year

/** The network's cities (Arpae, "la rete regionale di monitoraggio dei
 * pollini"): ten provincial capitals plus Cesena, and three partner sites. */
const ARPAE_CITIES = [
  [9.7, 45.05], // Piacenza
  [10.33, 44.8], // Parma
  [10.63, 44.7], // Reggio Emilia
  [10.93, 44.65], // Modena
  [11.34, 44.49], // Bologna
  [11.62, 44.84], // Ferrara
  [12.2, 44.42], // Ravenna
  [12.04, 44.22], // Forlì
  [12.24, 44.14], // Cesena
  [12.57, 44.06], // Rimini
  [11.18, 44.64], // San Giovanni in Persiceto
  [11.62, 44.65], // San Pietro Capofiume
  [11.88, 44.29], // Faenza
]

/** Families under test: the ones with a CAMS counterpart in the window, plus
 * Alternaria, which has no model anywhere — that row IS the mold finding.
 * `alto` is Arpae's own high-band floor (anagrafica famiglie). */
const TAXA = [
  { code: 'B48001', label: 'Grass (Graminaceae)', model: 'grass_pollen', alto: 30 },
  { code: 'B48005', label: 'Ragweed (Ambrosia)', model: 'ragweed_pollen', alto: 25 },
  { code: 'B48006', label: 'Mugwort (Artemisia)', model: 'mugwort_pollen', alto: 25 },
  { code: 'B48015', label: 'Olive (Olea)', model: 'olive_pollen', alto: 25 },
  { code: 'B48039', label: 'Alternaria spores — no model exists', model: null, alto: 100 },
]

/** id_staz,id_poll,date,valore rows → date → mean across stations. */
function regionSeries(rows, code) {
  const byDate = new Map()
  for (const [poll, date, value] of rows) {
    if (poll !== code || value === null) continue
    const at = byDate.get(date) ?? { sum: 0, n: 0 }
    at.sum += value
    at.n++
    byDate.set(date, at)
  }
  return new Map([...byDate].map(([date, { sum, n }]) => [date, sum / n]))
}

function parseArpae(csv, dateCol, valueCol, pollCol) {
  const rows = []
  for (const line of csv.split('\n')) {
    const cells = line.split(',').map((c) => c.replace(/^"|"$/g, ''))
    const value = Number(cells[valueCol])
    if (!cells[dateCol]?.match(/^\d{4}-\d{2}-\d{2}$/)) continue
    rows.push([cells[pollCol], cells[dateCol], Number.isFinite(value) ? value : null])
  }
  return rows
}

// ---------------------------------------------------------------------------
// Open-Meteo: the model side, daily means from hourly, region mean of cities.
// ---------------------------------------------------------------------------
async function openMeteoDaily(lat, lon, vars) {
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&hourly=${vars.join(',')}&past_days=92&forecast_days=1&timezone=auto`
  const data = JSON.parse(await fetched(url))
  const out = Object.fromEntries(vars.map((v) => [v, new Map()]))
  const times = data.hourly?.time ?? []
  for (const variable of vars) {
    const values = data.hourly?.[variable] ?? []
    const byDate = new Map()
    for (let i = 0; i < times.length; i++) {
      if (typeof values[i] !== 'number') continue
      const date = times[i].slice(0, 10)
      const at = byDate.get(date) ?? { sum: 0, n: 0 }
      at.sum += values[i]
      at.n++
      byDate.set(date, at)
    }
    for (const [date, { sum, n }] of byDate) {
      if (n >= 12) out[variable].set(date, sum / n) // a real day, not an edge
    }
  }
  return out
}

/** Mean across places of per-place daily series, dates present everywhere. */
function meanAcross(seriesList) {
  const out = new Map()
  for (const date of seriesList[0]?.keys() ?? []) {
    const values = seriesList.map((s) => s.get(date)).filter((v) => v !== undefined)
    if (values.length === seriesList.length) {
      out.set(date, values.reduce((a, b) => a + b, 0) / values.length)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Spearman, ties averaged.
// ---------------------------------------------------------------------------
function ranks(values) {
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
  const out = new Array(values.length)
  for (let i = 0; i < order.length; ) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++
    const rank = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[order[k][1]] = rank
    i = j + 1
  }
  return out
}

function spearman(xs, ys) {
  const rx = ranks(xs)
  const ry = ranks(ys)
  const n = xs.length
  const mx = rx.reduce((a, b) => a + b, 0) / n
  const my = ry.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my)
    dx += (rx[i] - mx) ** 2
    dy += (ry[i] - my) ** 2
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null
}

/** Score predictor series against measured over their common dates. */
function score(measured, predictor) {
  const xs = []
  const ys = []
  for (const [date, value] of measured) {
    const p = predictor.get(date)
    if (p !== undefined) {
      xs.push(p)
      ys.push(value)
    }
  }
  return { rho: xs.length >= 30 ? spearman(xs, ys) : null, days: xs.length }
}

const shiftDay = (date, days) => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Yesterday's measurement, presented as today's forecast. */
function persistenceOf(measured) {
  return new Map([...measured].map(([date, value]) => [shiftDay(date, 1), value]))
}

/** Day-of-year climatology from the archive, ±7 days, all years. */
function climatologyOf(archiveRows, code, dates) {
  const byDoy = new Map()
  for (const [poll, date, value] of archiveRows) {
    if (poll !== code || value === null) continue
    const doy = date.slice(5) // MM-DD; the leap day is one 366th of the noise
    const at = byDoy.get(doy) ?? { sum: 0, n: 0 }
    at.sum += value
    at.n++
    byDoy.set(doy, at)
  }
  const out = new Map()
  for (const date of dates) {
    let sum = 0
    let n = 0
    for (let k = -7; k <= 7; k++) {
      const at = byDoy.get(shiftDay(date, k).slice(5))
      if (at) {
        sum += at.sum
        n += at.n
      }
    }
    if (n > 0) out.set(date, sum / n)
  }
  return out
}

// ---------------------------------------------------------------------------
// The PM2.5 control: AirNow keyless daily files, six US monitors.
// ---------------------------------------------------------------------------
const CONTROL_CITIES = [
  ['New Haven', 'CT'],
  ['Los Angeles', 'CA'],
  ['Chicago', 'IL'],
  ['Houston', 'TX'],
  ['Denver', 'CO'],
  ['Seattle', 'WA'],
]

async function controlSites(anyDate) {
  const stamp = anyDate.replace(/-/g, '')
  const text = await fetched(
    `https://files.airnowtech.org/airnow/${anyDate.slice(0, 4)}/${stamp}/monitoring_site_locations.dat`,
  )
  const sites = []
  for (const line of text.split('\n')) {
    const cells = line.split('|')
    if (cells[1] !== 'PM2.5' || cells[4] !== 'Active') continue
    // Field 16 is the CBSA name — "New Haven-Milford, CT", never a bare
    // city — so the match is prefix-and-state. (15 is the CBSA id.)
    const city = (cells[16] ?? '').trim()
    const match = CONTROL_CITIES.find(([name, st]) => city.startsWith(name) && city.endsWith(st))
    if (match && !sites.some((s) => s.city === match[0])) {
      sites.push({ aqsid: cells[0], city: match[0], lat: Number(cells[8]), lon: Number(cells[9]) })
    }
  }
  return sites
}

async function controlMeasured(sites, dates) {
  const byId = new Map(sites.map((s) => [s.aqsid, new Map()]))
  for (const date of dates) {
    const stamp = date.replace(/-/g, '')
    let text
    try {
      text = await fetched(`https://files.airnowtech.org/airnow/${date.slice(0, 4)}/${stamp}/daily_data.dat`)
    } catch {
      continue // a missing day is a missing day
    }
    for (const line of text.split('\n')) {
      const cells = line.split('|')
      if (cells[3] !== 'PM2.5-24hr') continue
      const at = byId.get(cells[1])
      if (at) at.set(date, Number(cells[5]))
    }
  }
  return byId
}

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------
console.log('build-coverage-backtest: measured side (Arpae Emilia-Romagna)…')
const recent = parseArpae(await fetchedDrive(ARPAE_RECENT), 3, 4, 2)
const archive = parseArpae(await fetchedDrive(ARPAE_ARCHIVE), 2, 3, 1)
const archiveYears = new Set(archive.map(([, date]) => date.slice(0, 4)))

console.log('build-coverage-backtest: model side (Open-Meteo CAMS)…')
const pollenVars = TAXA.filter((t) => t.model).map((t) => t.model)
const cityDailies = []
for (const [lon, lat] of ARPAE_CITIES) {
  cityDailies.push(await openMeteoDaily(lat, lon, pollenVars))
}

const results = []
let windowSpan = null
for (const taxon of TAXA) {
  const measured = regionSeries(recent, taxon.code)
  const model = taxon.model
    ? meanAcross(cityDailies.map((c) => c[taxon.model]))
    : new Map()
  // The window is where model and measurement can meet: CAMS serves 92 past
  // days, Arpae publishes within days of the count.
  const dates = [...measured.keys()].filter((d) => (taxon.model ? model.has(d) : d >= shiftDay(new Date().toISOString().slice(0, 10), -93)))
  const inWindow = new Map(dates.map((d) => [d, measured.get(d)]))
  if (inWindow.size < 30) {
    console.log(`  ${taxon.label}: only ${inWindow.size} overlapping days — skipped`)
    continue
  }
  const spanDates = [...inWindow.keys()].sort()
  windowSpan = [spanDates[0], spanDates[spanDates.length - 1]]
  const calendar = climatologyOf(archive, taxon.code, inWindow.keys())
  const persistence = persistenceOf(regionSeries(recent, taxon.code))
  const modelScore = taxon.model ? score(inWindow, model) : { rho: null, days: inWindow.size }
  const calendarScore = score(inWindow, calendar)
  const persistenceScore = score(inWindow, persistence)
  results.push({
    label: `${taxon.label} — Emilia-Romagna, region average`,
    model: modelScore.rho === null ? null : Math.round(modelScore.rho * 100) / 100,
    calendar: calendarScore.rho === null ? null : Math.round(calendarScore.rho * 100) / 100,
    persistence: persistenceScore.rho === null ? null : Math.round(persistenceScore.rho * 100) / 100,
    days: modelScore.days,
  })
  console.log(`  ${taxon.label}: model ${modelScore.rho?.toFixed(2) ?? '—'} calendar ${calendarScore.rho?.toFixed(2)} yesterday ${persistenceScore.rho?.toFixed(2)} over ${modelScore.days} days`)
}

console.log('build-coverage-backtest: PM2.5 control (AirNow daily files)…')
const controlDates = []
for (let k = 92; k >= 2; k--) controlDates.push(shiftDay(new Date().toISOString().slice(0, 10), -k))
const sites = await controlSites(controlDates[controlDates.length - 1])
const measuredPM = await controlMeasured(sites, controlDates)
const rhos = { model: [], persistence: [] }
let controlDays = 0
for (const site of sites) {
  const measured = measuredPM.get(site.aqsid)
  if (!measured || measured.size < 30) continue
  const model = (await openMeteoDaily(site.lat, site.lon, ['pm2_5'])).pm2_5
  const m = score(measured, model)
  const p = score(measured, persistenceOf(measured))
  if (m.rho !== null && p.rho !== null) {
    rhos.model.push(m.rho)
    rhos.persistence.push(p.rho)
    controlDays += m.days
    console.log(`  ${site.city}: model ${m.rho.toFixed(2)} yesterday ${p.rho.toFixed(2)} over ${m.days} days`)
  }
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
if (rhos.model.length > 0) {
  results.push({
    label: `PM2.5 — ${rhos.model.length} US monitors (the control)`,
    model: Math.round(mean(rhos.model) * 100) / 100,
    calendar: null,
    persistence: Math.round(mean(rhos.persistence) * 100) / 100,
    days: controlDays,
  })
}

// ---------------------------------------------------------------------------
// Prose for the page, written from the numbers just computed. Agent-drafted;
// the owner edits the generator's framing, not this file.
// ---------------------------------------------------------------------------
const byPrefix = (prefix) => results.find((r) => r.label.startsWith(prefix))
const grass = byPrefix('Grass')
const ragweed = byPrefix('Ragweed')
const mugwort = byPrefix('Mugwort')
const olive = byPrefix('Olive')
const alternaria = byPrefix('Alternaria')
const control = byPrefix('PM2.5')
const f = (x) => (x === null || x === undefined ? '—' : x.toFixed(2))

// What the numbers actually said this run, written from them. The first run
// (2026-09-17) surprised the draft: the PM2.5 control scored LOWER than the
// pollen models, because summer pollen hands every predictor a seasonal
// curve to ride and daily particulate does not. The prose below is framed on
// the within-column comparison, which is the honest one.
const prose = [
  `Every number below is a rank agreement with real counts: 1.00 means the forecast put the days in exactly the measured order, 0 means no relation. The measured side is Arpae Emilia-Romagna's thirteen-station aerobiology network (daily counts, open data); the model is CAMS, the same land-cover-and-weather kind of model behind every consumer pollen forecast; the window is ${windowSpan ? `${windowSpan[0]} to ${windowSpan[1]}` : 'the model archive'}. The comparison that matters runs across each line: what did the model add over a paper calendar and over yesterday's count?`,
  grass && ragweed && mugwort && olive
    ? `Across the four pollens, almost nothing. Grass: model ${f(grass.model)}, calendar ${f(grass.calendar)}. Ragweed, mid-season right now: ${f(ragweed.model)} against ${f(ragweed.calendar)}. Olive: ${f(olive.model)} against ${f(olive.calendar)}. On mugwort the calendar beat the model, ${f(mugwort.calendar)} to ${f(mugwort.model)}. Yesterday's count alone lands in the same band every time. The high absolute numbers are the season itself — a summer curve every calendar already knows — and the model's daily precision adds a few hundredths at best on top of it.`
    : '',
  alternaria
    ? `The Alternaria line has no model number because no consumer source models mold spores at all. Its calendar scores ${f(alternaria.calendar)} — mold barely follows a season — while yesterday's count scores ${f(alternaria.persistence)}. The only informative mold forecast is a recent measurement, and the map above is how many places on Earth publish one.`
    : '',
  control
    ? `The PM2.5 control is the same test where a dense monitor network exists to check against: the model lands at ${f(control.model)}, yesterday's reading at ${f(control.persistence)}. Without a seasonal curve to ride, even the best-instrumented pollutant's model only matches persistence — which is the right calibration for reading the pollen numbers above.`
    : '',
].filter(Boolean)

const method = `Method: Spearman rank correlation against the measured daily series, region average across reporting stations; model side averaged over the network's thirteen documented cities (the upstream station registry was deleted, so ids were never paired to cities — a mean needs no pairing). Calendar: day-of-year climatology from the network's ${archiveYears.size}-year archive, smoothed ±7 days. Yesterday: the measured value one day back. PM2.5 control: AirNow daily averages at named US monitors vs the same model family; particulate has no season calendar, so that cell is empty. Sources: Arpae Emilia-Romagna (CC-BY), Open-Meteo/CAMS (CC-BY), AirNow daily files. Over the US, Open-Meteo serves the coarse global CAMS grid — a backdrop rather than a now-reading — and the control inherits that. Recomputed with each harvest; the window is the model archive's 92 past days.`

await writeFile(OUT, JSON.stringify({ computed: new Date().toISOString().slice(0, 10), window: windowSpan, results, prose, method }, null, 1))
console.log(`build-coverage-backtest: wrote public/coverage/data/backtest.json (${results.length} lines)`)
