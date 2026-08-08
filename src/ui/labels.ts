import type { Rating } from '../engine/types'

/**
 * The one sentence. Written here, reused verbatim by every surface that runs
 * on the bundle. `index.html`, `public/privacy.html` and `public/terms.html`
 * carry literal copies because they are served without it — if this changes,
 * change those three too.
 */
export const DISCLAIMER =
  'Breathing Index is a diary lens on public air data — not medical advice. Trust your symptoms and your asthma action plan over anything on this screen.'

/**
 * The extra clause a *predicted* 4 carries. A logged 4 is the user reporting
 * their own day; a predicted one is this app guessing, and a wrong guess in
 * that direction is the only one that can hurt someone.
 */
export const RESCUE_CLAUSE =
  '— if breathing feels dangerous, use your rescue plan and get help, whatever this app says.'

export const BI_LABELS: Record<Rating, { label: string; meaning: string }> = {
  1: { label: 'Easy', meaning: "The air isn't a factor. Do anything." },
  2: { label: 'Noticeable', meaning: "You'll feel it, but carry on as planned." },
  3: { label: 'Limiting', meaning: 'Change the plan: shorter, slower, later.' },
  4: { label: 'Dangerous', meaning: 'Outside is unsafe for you. Stay in filtered air.' },
}

/**
 * The forecast meaning line, keyed by the ceiling level. Deliberately *not*
 * BI_LABELS.meaning: those are behavioral anchors for rating a day you have
 * already lived, and they read as instructions when a guess wears them. A
 * prediction resting partly on population breakpoints has no standing to tell
 * anyone to "do anything", so the low end describes and only the high end —
 * where being wrong is expensive — still advises.
 */
export const FORECAST_MEANING: Record<Rating, string> = {
  1: "The air isn't expected to be a factor.",
  2: "You'll feel it, but you can carry on as planned.",
  3: 'Enough to change the plan: shorter, slower, later.',
  4: 'Outside could be unsafe for you. Plan around filtered air.',
}

export const levelWord = (r: Rating): string => BI_LABELS[r].label.toLowerCase()

export interface VariableLabel {
  /** display name ("Smoke") */
  name: string
  /** tiny sublabel next to the name ("PM2.5"), if any */
  sub?: string
  /** lowercase short name for diary exposure lines ("smoke") */
  short: string
  unit: string
}

export const VARIABLE_LABELS: Record<string, VariableLabel> = {
  pm25: { name: 'Smoke', sub: 'PM2.5', short: 'smoke', unit: 'µg/m³' },
  pm10: { name: 'Dust', sub: 'PM10', short: 'dust', unit: 'µg/m³' },
  o3: { name: 'Ozone', sub: 'O₃', short: 'ozone', unit: 'µg/m³' },
  no2: { name: 'NO₂', short: 'NO₂', unit: 'µg/m³' },
  so2: { name: 'SO₂', short: 'SO₂', unit: 'µg/m³' },
  co: { name: 'CO', short: 'CO', unit: 'µg/m³' },
  heat_stress: { name: 'Heat', short: 'heat', unit: '°' },
  cold_dry_stress: { name: 'Cold, dry', short: 'cold', unit: '°' },
  humidity: { name: 'Humidity', sub: '3-day', short: 'humidity', unit: '%' },
  // The three species share one "Pollen" row; `sub` is filled in per hour with
  // the species actually being shown, and where the figure came from.
  grass_pollen: { name: 'Grass', short: 'grass', unit: 'grains/m³' },
  birch_pollen: { name: 'Birch', short: 'birch', unit: 'grains/m³' },
  ragweed_pollen: { name: 'Ragweed', short: 'ragweed', unit: 'grains/m³' },
}

/** The words the air table's pollen sub-label is built from. */
export const CALENDAR_ESTIMATE = 'calendar estimate'

export const variableName = (v: string): string => VARIABLE_LABELS[v]?.name ?? v
