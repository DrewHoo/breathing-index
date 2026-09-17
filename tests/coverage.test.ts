// The /coverage contracts (specs/37-coverage-map.md, acceptance):
//
//   1. The committed station layers are non-empty and well-formed — every
//      point has a longitude, a latitude, a freshness class and a label.
//      The harvester is not in `npm test` (it needs six live services), so
//      this is what stands between a bad harvest and a shipped page.
//   2. The island's hand-written projection math agrees with the d3-geo
//      projections the generator baked the basemap with, to half a pixel,
//      for the exact parameters serialized into the shipped page. If these
//      drift, station dots land on the wrong coastline.
//
// The page itself is covered by `generate-coverage.mjs --check` in the test
// script, the same drift discipline the glossary uses.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { geoConicEqualArea, geoNaturalEarth1 } from 'd3-geo'
// @ts-expect-error -- plain JS shipped as a static file; no types on purpose.
import { circlePoints, haversineKm, invert, makeProjection } from '../public/coverage/projections.js'

const at = (p: string) => new URL(`../public/coverage/${p}`, import.meta.url)
const LAYERS = ['pm25', 'pm10', 'o3', 'no2', 'so2', 'co', 'pollen', 'mold']

type StationRow = [number, number, number, string]
const layerFile = (id: string) =>
  JSON.parse(readFileSync(at(`data/${id}.json`), 'utf8')) as {
    layer: string
    harvested: string
    stations: StationRow[]
  }

describe('coverage station layers', () => {
  const summary = JSON.parse(readFileSync(at('data/summary.json'), 'utf8'))

  it.each(LAYERS)('%s is non-empty and well-formed', (id) => {
    const { layer, harvested, stations } = layerFile(id)
    expect(layer).toBe(id)
    expect(harvested).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(stations.length).toBeGreaterThan(0)
    for (const [lon, lat, fresh, label] of stations) {
      expect(lon).toBeGreaterThanOrEqual(-180)
      expect(lon).toBeLessThanOrEqual(180)
      expect(lat).toBeGreaterThanOrEqual(-90)
      expect(lat).toBeLessThanOrEqual(90)
      expect([0, 1]).toContain(fresh)
      expect(label.length).toBeGreaterThan(0)
    }
  })

  it('summary counts match the layer files', () => {
    for (const id of LAYERS) {
      expect(summary.layers[id].count).toBe(layerFile(id).stations.length)
    }
  })

  it('the thesis is still true in the data: pollen and mold are sparse', () => {
    // Not a joke assertion. If a harvest ever reports fewer PM2.5 monitors
    // than pollen counters, either the world changed or the harvester broke,
    // and both deserve a failing test before a deploy.
    expect(layerFile('pm25').stations.length).toBeGreaterThan(10 * layerFile('pollen').stations.length)
  })
})

/** The parameters the shipped page carries, parsed out of the page itself:
 * testing a copy would miss the file the browser actually reads. */
function shippedParams() {
  const html = readFileSync(at('index.html'), 'utf8')
  const match = html.match(/<script id="cov-params" type="application\/json">(.*?)<\/script>/s)
  if (!match) throw new Error('cov-params block missing from public/coverage/index.html')
  return JSON.parse(match[1]!)
}

describe('island projections against d3-geo', () => {
  const params = shippedParams()
  const SAMPLES: Array<[number, number]> = [
    [-72.9, 41.4], // Hamden
    [-118.24, 34.05], // Los Angeles
    [-149.88, 61.14], // Anchorage
    [-66.11, 18.47], // San Juan
    [13.4, 52.52], // Berlin
    [-3.7, 40.42], // Madrid
    [24.12, 67.97], // Pallas
    [-56.12, -34.88], // Montevideo
    [151.2, -33.87], // Sydney
  ]

  it.each(Object.keys(params.views))('%s matches to half a pixel', (view) => {
    const p = params.views[view]
    const reference =
      p.type === 'naturalEarth1'
        ? geoNaturalEarth1().scale(p.scale).translate(p.translate)
        : geoConicEqualArea()
            .parallels(p.parallels)
            .rotate([p.rotate, 0])
            .center([0, 0]) // the generator pins the default center away
            .scale(p.scale)
            .translate(p.translate)
    const ours = makeProjection(p)
    for (const [lon, lat] of SAMPLES) {
      const expected = reference([lon, lat])!
      const got = ours.project(lon, lat)
      expect(Math.hypot(got[0] - expected[0], got[1] - expected[1])).toBeLessThan(0.5)
    }
  })

  it('invert round-trips a click', () => {
    for (const view of Object.keys(params.views)) {
      const projection = makeProjection(params.views[view])
      const [lon, lat] = view === 'eu' ? [10, 50] : [-95, 40]
      const [x, y] = projection.project(lon, lat)
      const [lonBack, latBack] = invert(projection, x, y, [lon + 20, lat - 10])
      expect(Math.abs(lonBack - lon)).toBeLessThan(0.01)
      expect(Math.abs(latBack - lat)).toBeLessThan(0.01)
    }
  })

  it('reach rings sit at their radius', () => {
    for (const [lon, lat] of [[-72.9, 41.4], [24.12, 67.97]] as const) {
      for (const [rlon, rlat] of circlePoints(lon, lat, 50, 12)) {
        expect(haversineKm(lon, lat, rlon, rlat)).toBeCloseTo(50, 1)
      }
    }
  })
})

describe('the backtest receipts', () => {
  const backtest = JSON.parse(readFileSync(at('data/backtest.json'), 'utf8'))

  it('carries both baselines for every line scored', () => {
    expect(backtest.results.length).toBeGreaterThan(0)
    for (const r of backtest.results) {
      expect(r.label.length).toBeGreaterThan(0)
      expect(r.days).toBeGreaterThanOrEqual(30)
      // Yesterday-again exists for everything measured.
      expect(typeof r.persistence).toBe('number')
      // The calendar exists for everything except the PM2.5 control, which
      // has no season calendar on purpose (the method note says why).
      if (!r.label.includes('control')) expect(typeof r.calendar).toBe('number')
      // A missing model is a claim ("no model exists") and the label says so.
      if (r.model === null) expect(r.label.includes('no model') || r.label.includes('control')).toBe(true)
    }
  })

  it('has its prose and method baked from real values', () => {
    expect(backtest.prose.length).toBeGreaterThanOrEqual(3)
    expect(backtest.method).toContain('Spearman')
    expect(backtest.window?.[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
