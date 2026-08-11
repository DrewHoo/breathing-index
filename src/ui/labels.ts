import type { Rating } from '../engine/types'
import { POLLEN_PLANTS } from '../sources/pollenPlants'

/**
 * The one sentence. Written here, reused verbatim by every surface that runs
 * on the bundle. `index.html`, `public/privacy.html` and `public/terms.html`
 * carry literal copies because they are served without it — if this changes,
 * change those three too.
 */
export const DISCLAIMER =
  'Breathing Index is a logbook lens on public air data — not medical advice. Trust your symptoms and your asthma action plan over anything on this screen.'

/**
 * The extra clause a *predicted* 4 carries. A logged 4 is the user reporting
 * their own day; a predicted one is this app guessing, and a wrong guess in
 * that direction is the only one that can hurt someone.
 */
export const RESCUE_CLAUSE =
  '— if breathing feels dangerous, use your rescue plan and get help, whatever this app says.'

export const BI_LABELS: Record<Rating, { label: string; meaning: string }> = {
  1: { label: 'Easy', meaning: "You're not thinking about breathing; it's like how breathing is supposed to be" },
  2: { label: 'Noticeable', meaning: "You feel it, but can carry on as planned." },
  3: { label: 'Limiting', meaning: 'You\'re prevented from doing stuff you want to do.' },
  4: { label: 'Dangerous', meaning: 'You\'re taking your inhaler and following a rescue plan.' },
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
  /** display name ("Fine particles") */
  name: string
  /** tiny sublabel next to the name ("PM2.5"), if any */
  sub?: string
  /** short name for diary exposure lines ("PM2.5") */
  short: string
  unit: string
  /** the name takes a plural verb: "fine particles *are* past…" */
  plural?: boolean
}

/**
 * Particulate rows are named by size, not by source. "Smoke" and "Dust" were
 * causes the data cannot support — most metro PM2.5 is traffic and industry —
 * and the app's first rule is to describe the air without inventing a reason
 * for it. The one exception is the fine-fraction fingerprint in `ui/smoke.ts`,
 * which earns a row the sub-label "likely smoke" for as long as it holds.
 */
export const VARIABLE_LABELS: Record<string, VariableLabel> = {
  pm25: { name: 'Fine particles', sub: 'PM2.5', short: 'PM2.5', unit: 'µg/m³', plural: true },
  pm10: { name: 'Coarse particles', sub: 'PM10', short: 'PM10', unit: 'µg/m³', plural: true },
  o3: { name: 'Ozone', sub: 'O₃', short: 'ozone', unit: 'µg/m³' },
  no2: { name: 'NO₂', short: 'NO₂', unit: 'µg/m³' },
  so2: { name: 'SO₂', short: 'SO₂', unit: 'µg/m³' },
  co: { name: 'CO', short: 'CO', unit: 'µg/m³' },
  heat_stress: { name: 'Heat', short: 'heat', unit: '°' },
  cold_dry_stress: { name: 'Cold, dry', short: 'cold', unit: '°' },
  humidity: { name: 'Humidity', sub: '3-day', short: 'humidity', unit: '%' },
  // Retired grains/m³ species (pre-spec-18), kept so old entries still render.
  grass_pollen: { name: 'Grass', short: 'grass', unit: 'grains/m³' },
  birch_pollen: { name: 'Birch', short: 'birch', unit: 'grains/m³' },
  ragweed_pollen: { name: 'Ragweed', short: 'ragweed', unit: 'grains/m³' },
  // Every measured pollen plant (the engine's pollen variables — the type
  // rows are display only). The unit is an index (0–5) because no consumer
  // pollen source publishes a count a user could check — the one deliberate
  // exception to the air table's real-units rule, argued in
  // specs/18-measured-pollen.md.
  ...Object.fromEntries(
    Object.values(POLLEN_PLANTS).map((p) => [
      p.variable,
      { name: `${p.name} pollen`, short: `${p.name.toLowerCase()} pollen`, unit: 'of 5' },
    ]),
  ),
}

/** The words the air table's pollen sub-label is built from. */
export const CALENDAR_ESTIMATE = 'calendar estimate'

export const variableName = (v: string): string => VARIABLE_LABELS[v]?.name ?? v

/** "is" or "are" for a sentence about one variable — "Fine particles are…". */
export const variableVerb = (v: string): string => (VARIABLE_LABELS[v]?.plural ? 'are' : 'is')
