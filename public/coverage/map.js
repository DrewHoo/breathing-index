// The /coverage island: layer and region switching, the reach and wash
// toggles, and the what-is-near-you readout. The page is complete without it
// — the pollen layer and its legend are baked by scripts/generate-coverage.mjs
// — so everything here is swap-and-redraw, no first render.
//
// Station data is fetched per layer from /coverage/data/<id>.json on first
// use: [lon, lat, freshClass, label] per station, projected here with the
// parameters the generator serialized into #cov-params (projections.js is the
// math; the build holds it to d3's output).
import { makeProjection, invert, haversineKm, circlePoints } from '/coverage/projections.js'

const params = JSON.parse(document.getElementById('cov-params').textContent)
const projections = Object.fromEntries(
  Object.entries(params.views).map(([id, view]) => [id, makeProjection(view)]),
)
const svgs = Object.fromEntries(
  [...document.querySelectorAll('.cov-svg')].map((svg) => [svg.dataset.view, svg]),
)

const state = { layer: params.defaultLayer, view: 'world' }
const cache = new Map() // layer id -> stations, fetched once
/** Which (layer, view) pair an svg currently shows; the baked default. */
const drawn = Object.fromEntries(Object.keys(svgs).map((v) => [v, params.defaultLayer]))

async function stations(layer) {
  if (!cache.has(layer)) {
    const res = await fetch(`/coverage/data/${layer}.json`)
    if (!res.ok) throw new Error(`layer ${layer}: HTTP ${res.status}`)
    cache.set(layer, (await res.json()).stations)
  }
  return cache.get(layer)
}

const SVG = 'http://www.w3.org/2000/svg'

async function draw(layer, view) {
  const svg = svgs[view]
  if (drawn[view] === layer) return
  const list = await stations(layer)
  if (state.layer !== layer || state.view !== view) return // stale by the time it arrived
  const projection = projections[view]
  const dots = svg.querySelector('.cov-dots')
  const reach = svg.querySelector('.cov-reach')
  let ring = ''
  const next = document.createElementNS(SVG, 'g')
  next.setAttribute('class', 'cov-dots')
  for (const [lon, lat, fresh, label] of list) {
    const p = projection.project(lon, lat)
    if (!projection.inside(p)) continue
    const dot = document.createElementNS(SVG, 'circle')
    dot.setAttribute('cx', p[0].toFixed(1))
    dot.setAttribute('cy', p[1].toFixed(1))
    dot.setAttribute('r', '2.6')
    dot.setAttribute('class', fresh === 1 ? 'cov-dot cov-dot-lagged' : 'cov-dot')
    const title = document.createElementNS(SVG, 'title')
    title.textContent = label
    dot.append(title)
    next.append(dot)
    ring += ringPath(projection, lon, lat)
  }
  reach.setAttribute('d', ring)
  dots.replaceWith(next)
  drawn[view] = layer
  svg.setAttribute(
    'aria-label',
    `${labelFor(view)}: places with a ${params.layers[layer].name.toLowerCase()} measurement`,
  )
}

function ringPath(projection, lon, lat) {
  const points = circlePoints(lon, lat, params.reachKm)
  let d = ''
  for (let i = 0; i < points.length; i++) {
    const p = projection.project(points[i][0], points[i][1])
    d += (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)
  }
  return d + 'Z'
}

const VIEW_LABELS = { world: 'World', na: 'North America', eu: 'Europe' }
const labelFor = (view) => VIEW_LABELS[view] ?? view

// The two legend shapes: the bio layers carry the fresh/quiet split and the
// thesis sentence; the regulated layers carry their own claim and point at
// the table for the per-source basis.
function legendFor(layer) {
  const name = params.layers[layer].name
  if (layer === 'pollen' || layer === 'mold') {
    const what = layer === 'mold' ? 'counts mold spores' : 'counts pollen'
    return `Each dot is a place that ${what} and publishes, or reports it to the NAB — bright when it reported within 30 days, hollow when it has been quiet this season. The circles are ${params.reachKm} km of reach, roughly one forecast-model cell. Everything outside them is a number without a measurement.`
  }
  return `Each dot is a ${name} monitor — a regulatory instrument, not a model. The circles are the same ${params.reachKm} km of reach every layer gets, so the pollen and mold layers can be compared against this one on one footing. The table below says exactly what a dot claims per source.`
}

function renderMeta() {
  document.getElementById('cov-legend').textContent = legendFor(state.layer)
  const notes = document.getElementById('cov-notes')
  notes.replaceChildren(
    ...(params.layers[state.layer].notes ?? []).map(({ region, text }) => {
      const li = document.createElement('li')
      const tag = document.createElement('span')
      tag.className = 'cov-note-region'
      tag.textContent = { 'us-ca': 'US + Canada', europe: 'Europe', world: 'Elsewhere' }[region]
      li.append(tag, ` ${text}`)
      return li
    }),
  )
}

function setPressed(group, attr, value) {
  for (const button of document.querySelectorAll(group)) {
    button.classList.toggle('cov-on', button.dataset[attr] === value)
  }
}

async function update() {
  setPressed('.cov-chip[data-layer]', 'layer', state.layer)
  setPressed('.cov-tab[data-view]', 'view', state.view)
  // toggleAttribute, not `.hidden`: SVG elements have no `hidden` IDL
  // property, so assigning it is an expando that changes nothing on screen.
  for (const [view, svg] of Object.entries(svgs)) {
    svg.toggleAttribute('hidden', view !== state.view)
  }
  renderMeta()
  await draw(state.layer, state.view)
}

for (const button of document.querySelectorAll('.cov-chip[data-layer]')) {
  button.addEventListener('click', () => {
    state.layer = button.dataset.layer
    update()
  })
}
for (const button of document.querySelectorAll('.cov-tab[data-view]')) {
  button.addEventListener('click', () => {
    state.view = button.dataset.view
    update()
  })
}
document.getElementById('cov-reach-toggle').addEventListener('change', (event) => {
  document.body.classList.toggle('cov-no-reach', !event.target.checked)
})
document.getElementById('cov-wash-toggle').addEventListener('change', (event) => {
  document.body.classList.toggle('cov-washed', event.target.checked)
})

// ---------------------------------------------------------------------------
// The readout: a click on the map, or the browser's own location, answered
// with the nearest station per layer. All local — the station lists are
// static files and the distances are computed here.
// ---------------------------------------------------------------------------
const readout = document.getElementById('cov-readout')

async function nearest(lon, lat) {
  const lines = []
  for (const [id, meta] of Object.entries(params.layers)) {
    const list = await stations(id)
    let best = null
    for (const [slon, slat, , label] of list) {
      const km = haversineKm(lon, lat, slon, slat)
      if (best === null || km < best.km) best = { km, label }
    }
    if (best !== null) lines.push({ id, name: meta.name, ...best })
  }
  return lines
}

function showReadout(lon, lat, placed) {
  readout.hidden = false
  readout.textContent = 'Measuring…'
  nearest(lon, lat).then((lines) => {
    readout.replaceChildren()
    const heading = document.createElement('p')
    heading.className = 'cov-readout-at'
    heading.textContent = placed
    readout.append(heading)
    const list = document.createElement('ul')
    for (const line of lines) {
      const li = document.createElement('li')
      const km = Math.round(line.km)
      const strong = document.createElement('strong')
      strong.textContent = `${line.name}: ${km} km`
      li.append(strong, ` — ${line.label}`)
      list.append(li)
    }
    readout.append(list)
    readout.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

for (const [view, svg] of Object.entries(svgs)) {
  svg.addEventListener('click', (event) => {
    const rect = svg.getBoundingClientRect()
    const p = params.views[view]
    const x = ((event.clientX - rect.left) / rect.width) * p.width
    const y = ((event.clientY - rect.top) / rect.height) * p.height
    const guess = view === 'na' ? [-95, 40] : view === 'eu' ? [10, 50] : [0, 20]
    const [lon, lat] = invert(projections[view], x, y, guess)
    showReadout(
      lon,
      lat,
      `Around ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}:`,
    )
  })
}

const locate = document.getElementById('cov-locate')
if ('geolocation' in navigator) {
  locate.disabled = false
  locate.addEventListener('click', () => {
    locate.disabled = true
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locate.disabled = false
        // Rounded before use: the readout is honest at ~1 km and this page
        // has no business holding anything sharper.
        const lon = Math.round(position.coords.longitude * 100) / 100
        const lat = Math.round(position.coords.latitude * 100) / 100
        showReadout(lon, lat, 'Around your location:')
      },
      () => {
        locate.disabled = false
        readout.hidden = false
        readout.textContent = 'Location was refused or unavailable — tap the map instead.'
      },
      { timeout: 15000 },
    )
  })
}
