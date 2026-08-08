import { PRIORS } from '../engine/config'
import type { Exposure } from '../engine/types'

/**
 * The three species the engine carries priors for. Open-Meteo/CAMS serves them
 * live for Europe; everywhere else this module stands in with a calendar.
 */
export const POLLEN_VARIABLES = ['grass_pollen', 'birch_pollen', 'ragweed_pollen'] as const
export type PollenVariable = (typeof POLLEN_VARIABLES)[number]

/**
 * Season strength, in the National Allergy Bureau's own vocabulary. Each band
 * maps to the *low edge* of its NAB count category, per species, so a "high"
 * month claims the least the category allows rather than its middle:
 *
 * | NAB category | trees (birch) | grass | weeds (ragweed) |
 * |---|---|---|---|
 * | low       | 1–14   | 1–4   | 1–9    |
 * | moderate  | 15–89  | 5–19  | 10–49  |
 * | high      | 90–1499| 20–199| 50–499 |
 *
 * A `low` month therefore lands at or under the engine's negligible floor
 * (config.ts): in season, visible in the air table, but never a suspect.
 */
export type Band = 'low' | 'med' | 'high'

const BAND_GRAINS: Record<PollenVariable, Record<Band, number>> = {
  grass_pollen: { low: 1, med: 5, high: 20 },
  birch_pollen: { low: 1, med: 15, high: 90 },
  ragweed_pollen: { low: 1, med: 10, high: 50 },
}

/** month number (1–12) -> band; months absent are out of season */
type MonthBands = Partial<Record<number, Band>>

/**
 * NOAA's nine US climate regions, which is the granularity the seasons below
 * actually differ at. `pollenRegion` approximates them with latitude/longitude
 * boxes rather than state borders — close enough for "is ragweed running in
 * Connecticut in August", wrong within a few tens of km of a region line.
 */
export type RegionId =
  | 'northeast'
  | 'ohio-valley'
  | 'upper-midwest'
  | 'southeast'
  | 'south'
  | 'northern-plains'
  | 'southwest'
  | 'northwest'
  | 'west'

/**
 * Season timing per region, from the AAAAI/NAB picture of North American
 * seasons: tree pollen in early spring, grass in late spring through summer
 * (long and early in the South and West), ragweed from mid-August to first
 * frost. Month granularity is all a calendar can honestly claim.
 *
 * Two admitted gaps, deliberately left as blanks rather than mislabeled:
 * birch does not grow in the South, Southeast, Southwest or California, so
 * those regions carry no tree season at all — their real ones (mountain cedar
 * in Texas, oak and pine in the Southeast) have no variable in the engine yet.
 */
const REGION_SEASONS: Record<RegionId, Partial<Record<PollenVariable, MonthBands>>> = {
  northeast: {
    birch_pollen: { 3: 'low', 4: 'high', 5: 'med' },
    grass_pollen: { 5: 'med', 6: 'high', 7: 'med' },
    ragweed_pollen: { 8: 'med', 9: 'high', 10: 'low' },
  },
  'ohio-valley': {
    birch_pollen: { 3: 'med', 4: 'high', 5: 'low' },
    grass_pollen: { 5: 'high', 6: 'high', 7: 'med' },
    ragweed_pollen: { 8: 'med', 9: 'high', 10: 'med' },
  },
  'upper-midwest': {
    birch_pollen: { 4: 'med', 5: 'high' },
    grass_pollen: { 5: 'med', 6: 'high', 7: 'med' },
    ragweed_pollen: { 8: 'high', 9: 'high', 10: 'low' },
  },
  southeast: {
    grass_pollen: { 3: 'low', 4: 'med', 5: 'high', 6: 'high', 7: 'med', 8: 'med', 9: 'med' },
    ragweed_pollen: { 8: 'med', 9: 'high', 10: 'med', 11: 'low' },
  },
  south: {
    grass_pollen: { 3: 'med', 4: 'high', 5: 'high', 6: 'high', 7: 'med', 8: 'med', 9: 'med' },
    ragweed_pollen: { 8: 'med', 9: 'high', 10: 'med' },
  },
  'northern-plains': {
    birch_pollen: { 4: 'low', 5: 'med' },
    grass_pollen: { 5: 'med', 6: 'high', 7: 'med' },
    ragweed_pollen: { 8: 'med', 9: 'med', 10: 'low' },
  },
  southwest: {
    grass_pollen: { 4: 'med', 5: 'med', 6: 'low', 7: 'low', 8: 'low', 9: 'low' },
    ragweed_pollen: { 8: 'low', 9: 'med', 10: 'low' },
  },
  northwest: {
    birch_pollen: { 3: 'med', 4: 'high', 5: 'med' },
    grass_pollen: { 5: 'high', 6: 'high', 7: 'med' },
    ragweed_pollen: { 9: 'low' },
  },
  west: {
    grass_pollen: { 3: 'med', 4: 'high', 5: 'high', 6: 'med' },
    ragweed_pollen: { 9: 'low', 10: 'low' },
  },
}

/**
 * Which calendar region a place falls in, or null where this table has nothing
 * to say — everywhere outside the contiguous US. Null means no pollen row at
 * all: a made-up season is worse than an admitted blank.
 */
export function pollenRegion(lat: number, lon: number): RegionId | null {
  if (lat < 24 || lat > 49.5 || lon < -125 || lon > -66.5) return null
  if (lon <= -114) return lat >= 42 ? 'northwest' : 'west'
  if (lon <= -102) return lat >= 41 ? 'northern-plains' : 'southwest'
  if (lon <= -95) return lat >= 40 ? 'northern-plains' : 'south'
  if (lon <= -89) {
    if (lat >= 40.5) return 'upper-midwest'
    return lat >= 36.5 ? 'ohio-valley' : 'south'
  }
  if (lon <= -84) {
    if (lat >= 41.5) return 'upper-midwest'
    return lat >= 35 ? 'ohio-valley' : 'southeast'
  }
  if (lon <= -75) {
    if (lat >= 41) return 'northeast'
    return lat >= 38 ? 'ohio-valley' : 'southeast'
  }
  return 'northeast'
}

/**
 * The calendar's estimate of what is in the air at a place in a given month, in
 * grains/m³. Empty when the region has no season running (or is off the table)
 * — an out-of-season species is left out of the vector rather than written as a
 * zero, because "no ragweed in January" and "measured zero" are different
 * claims and only one of them is ours to make.
 *
 * Every value this returns is an *estimate*: entries built from it carry the
 * variable names in `DiaryEntry.estimated`, and the engine refuses to confirm a
 * bound from them.
 */
export function calendarPollen(lat: number, lon: number, month: number): Exposure {
  const region = pollenRegion(lat, lon)
  if (!region) return {}
  const seasons = REGION_SEASONS[region]
  const exposure: Exposure = {}
  for (const variable of POLLEN_VARIABLES) {
    const band = seasons[variable]?.[month]
    if (band) exposure[variable] = BAND_GRAINS[variable][band]
  }
  return exposure
}

/** The month a local API timestamp ("2026-08-07T13:00") falls in, 1–12. */
export const monthOf = (localTime: string): number => Number(localTime.slice(5, 7))

/**
 * The species the pollen row names: the one furthest into its own prior, not
 * the biggest number. Birch counts run an order of magnitude above ragweed
 * counts, so raw comparison would name birch every spring day regardless of
 * which species is actually at a level that matters.
 */
export function dominantPollen(exposure: Exposure): { variable: PollenVariable; value: number } | null {
  let best: { variable: PollenVariable; value: number; ratio: number } | null = null
  for (const variable of POLLEN_VARIABLES) {
    const value = exposure[variable]
    if (value === undefined) continue
    const ratio = value / (PRIORS[variable]?.[2] ?? 1)
    if (!best || ratio > best.ratio) best = { variable, value, ratio }
  }
  return best ? { variable: best.variable, value: best.value } : null
}
