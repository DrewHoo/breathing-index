import type { PollenDay, PollenType } from './googlePollen'

/**
 * The fallback pollen source: a season calendar, for the hours and places the
 * measured feed (googlePollen.ts) does not cover — dates before today, relay
 * outages, spent quotas. It speaks the same three type variables on the same
 * 0–5 index scale, so a fallback day and a measured day are comparable — but
 * every value it produces is an *estimate*: entries built from it carry the
 * variable names in `DiaryEntry.estimated`, and the engine refuses to confirm
 * a bound from them.
 */

/**
 * Season strength bands, mapped to the conservative low edge of the matching
 * index category: a `low` month sits at Very Low (1) — the negligible floor,
 * visible but never a suspect, exactly as the grains version of this table
 * behaved; `med` claims Moderate (3), `high` claims High (4), and the calendar
 * never claims Very High — a peak is a measurement's claim to make.
 */
export type Band = 'low' | 'med' | 'high'

const BAND_INDEX: Record<Band, number> = { low: 1, med: 3, high: 4 }

/**
 * The calendar reasons in the species the AAAAI/NAB season picture is written
 * in, then reports as the type that species belongs to — birch is the tree
 * season, ragweed the weed season. The species name rides along for the row's
 * sub-label, so a fallback row still says what plant the season is about.
 */
const SPECIES: Record<string, { type: PollenType; plant: string }> = {
  birch: { type: 'pollen_tree', plant: 'birch' },
  grass: { type: 'pollen_grass', plant: 'grass' },
  ragweed: { type: 'pollen_weed', plant: 'ragweed' },
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
 * in Texas, oak and pine in the Southeast) are exactly what the measured feed
 * knows and this calendar does not.
 */
const REGION_SEASONS: Record<RegionId, Partial<Record<keyof typeof SPECIES, MonthBands>>> = {
  northeast: {
    birch: { 3: 'low', 4: 'high', 5: 'med' },
    grass: { 5: 'med', 6: 'high', 7: 'med' },
    ragweed: { 8: 'med', 9: 'high', 10: 'low' },
  },
  'ohio-valley': {
    birch: { 3: 'med', 4: 'high', 5: 'low' },
    grass: { 5: 'high', 6: 'high', 7: 'med' },
    ragweed: { 8: 'med', 9: 'high', 10: 'med' },
  },
  'upper-midwest': {
    birch: { 4: 'med', 5: 'high' },
    grass: { 5: 'med', 6: 'high', 7: 'med' },
    ragweed: { 8: 'high', 9: 'high', 10: 'low' },
  },
  southeast: {
    grass: { 3: 'low', 4: 'med', 5: 'high', 6: 'high', 7: 'med', 8: 'med', 9: 'med' },
    ragweed: { 8: 'med', 9: 'high', 10: 'med', 11: 'low' },
  },
  south: {
    grass: { 3: 'med', 4: 'high', 5: 'high', 6: 'high', 7: 'med', 8: 'med', 9: 'med' },
    ragweed: { 8: 'med', 9: 'high', 10: 'med' },
  },
  'northern-plains': {
    birch: { 4: 'low', 5: 'med' },
    grass: { 5: 'med', 6: 'high', 7: 'med' },
    ragweed: { 8: 'med', 9: 'med', 10: 'low' },
  },
  southwest: {
    grass: { 4: 'med', 5: 'med', 6: 'low', 7: 'low', 8: 'low', 9: 'low' },
    ragweed: { 8: 'low', 9: 'med', 10: 'low' },
  },
  northwest: {
    birch: { 3: 'med', 4: 'high', 5: 'med' },
    grass: { 5: 'high', 6: 'high', 7: 'med' },
    ragweed: { 9: 'low' },
  },
  west: {
    grass: { 3: 'med', 4: 'high', 5: 'high', 6: 'med' },
    ragweed: { 9: 'low', 10: 'low' },
  },
}

/**
 * Which calendar region a place falls in, or null where this table has nothing
 * to say — everywhere outside the contiguous US. Null means no fallback rows
 * at all: a made-up season is worse than an admitted blank.
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
 * The calendar's estimate of a place's pollen in a given month, in the same
 * shape a measured day arrives in. Empty when no season is running (or the
 * place is off the table) — an out-of-season type is left out rather than
 * written as a zero, because "no ragweed in January" and "measured zero" are
 * different claims and only one of them is ours to make.
 */
export function calendarPollen(lat: number, lon: number, month: number): PollenDay {
  const region = pollenRegion(lat, lon)
  if (!region) return {}
  const seasons = REGION_SEASONS[region]
  const day: PollenDay = {}
  for (const [species, { type, plant }] of Object.entries(SPECIES)) {
    const band = seasons[species as keyof typeof SPECIES]?.[month]
    if (band) day[type] = { value: BAND_INDEX[band], plants: [plant] }
  }
  return day
}

/** The month a local API timestamp ("2026-08-07T13:00") falls in, 1–12. */
export const monthOf = (localTime: string): number => Number(localTime.slice(5, 7))
