import type { Priors } from './types'

/**
 * Background floors: an exposure at or below this can never become a suspect,
 * even with no tolerance evidence. These encode "measurably present," not
 * "harmful" — they sit well below any health-relevant level.
 */
const NEGLIGIBLE: Record<string, number> = {
  pm25: 5, // µg/m³
  pm10: 10,
  o3: 20,
  no2: 10,
  so2: 5,
  co: 300,
  heat_stress: 0, // any positive stress is non-negligible
  cold_dry_stress: 0,
  humidity: 55, // %RH mean72h below this is not a mold-proxy candidate
  grass_pollen: 2, // grains/m³
  ragweed_pollen: 1,
  birch_pollen: 2,
}

export function negligibleFor(variable: string): number {
  return NEGLIGIBLE[variable] ?? 0
}

/**
 * Population priors, ceiling-only: "at this exposure, a sensitive person is
 * *potentially* at this level." Personal diary evidence replaces these.
 *
 * TODO(spec verification note): derive pollutant rows from official breakpoint
 * tables (EPA 2024 PM2.5 revision etc.) at build time instead of these
 * hand-checked approximations. Weather/humidity rows are heuristic starts.
 */
export const PRIORS: Priors = {
  pm25: { 2: 9.1, 3: 35.5, 4: 55.5 }, // µg/m³, EPA breakpoint-shaped
  pm10: { 2: 55, 3: 155, 4: 255 },
  o3: { 2: 100, 3: 160, 4: 200 }, // µg/m³, WHO 8h guideline -> USG-ish
  no2: { 2: 25, 3: 100, 4: 200 },
  so2: { 2: 40, 3: 125, 4: 350 },
  co: { 2: 4000, 3: 10000, 4: 15000 },
  heat_stress: { 2: 7, 3: 12 }, // °C above 25
  cold_dry_stress: { 2: 10, 3: 18 }, // °C below 10, dry air
  humidity: { 2: 70 }, // %RH mean72h, indoor mold/dust-mite proxy
  ragweed_pollen: { 2: 10, 3: 50 }, // grains/m³
  grass_pollen: { 2: 20, 3: 100 },
  birch_pollen: { 2: 30, 3: 90 },
}
