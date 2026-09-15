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

/**
 * The top of the EPA's AQI "Good" band, per pollutant, in the row's display
 * unit (µg/m³). A row whose diary has no easy level yet draws this as its
 * reference line, labelled with the EPA's own word and a `?` that says whose
 * word it is (see `useGoodHelp`).
 *
 * These are deliberately the EPA numbers and not the level-2 priors in
 * `engine/config.ts`: the two agree for particles, but ozone's prior is the
 * WHO 8-hour guideline (100), which is stricter than the EPA's Moderate
 * threshold and is not what anyone means by "Good". A line labelled Good has
 * to be the Good line.
 *
 * Sources: EPA AQI technical assistance document (2024 PM revision). Gas
 * ceilings are the last ppb of the Good band converted at 25 °C / 1013 hPa
 * with the same factors as scripts/derive-breakpoints.mjs (o3 ×1.96, so2 ×2.62).
 *   pm25 24-h: 0.0–9.0 µg/m³ · pm10 24-h: 0–54 · o3 8-h: 0–54 ppb ≈ 106 ·
 *   so2 1-h: 0–35 ppb ≈ 92
 */
export const EPA_GOOD_CEILING: Record<string, number> = {
  pm25: 9,
  pm10: 54,
  o3: 106,
  so2: 92,
}

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
 * for it. The exceptions both come from the fine-fraction fingerprint in
 * `ui/smoke.ts`: it earns the PM2.5 row the sub-label "likely smoke" for as
 * long as it holds, and — where a satellite has drawn a plume over the place
 * as well — it lets `smoke` be a row of its own (specs/25-smoke-variable.md).
 * The row names a source because two independent instruments agreed on one,
 * which is a different thing from a number wearing a guess about its origin.
 */
export const VARIABLE_LABELS: Record<string, VariableLabel> = {
  pm25: { name: 'Fine particles', sub: 'PM2.5', short: 'PM2.5', unit: 'µg/m³', plural: true },
  // The coarse fraction, PM10 − PM2.5, so the name is true: the row would
  // otherwise be counting the fine particles a second time. `pm10` keeps a
  // label of its own for old diary entries that carry a verdict on it.
  pm_coarse: { name: 'Coarse particles', sub: 'PM10 − PM2.5', short: 'coarse particles', unit: 'µg/m³', plural: true },
  pm10: { name: 'Particles under 10 µm', sub: 'PM10', short: 'PM10', unit: 'µg/m³', plural: true },
  o3: { name: 'Ozone', sub: 'O₃', short: 'ozone', unit: 'µg/m³' },
  // "of 3" because the source's scale is three analyst-drawn steps — Light,
  // Medium, Heavy — and nobody publishes a µg/m³ of smoke at a point. The one
  // other row with an index for a unit is pollen, for the same reason.
  smoke: { name: 'Smoke', short: 'smoke', unit: 'of 3' },
  // Mold (specs/28-mold.md). The unit is the station's, not the table's: most
  // publish spores/m³ and St. Louis prints a number and never says per what,
  // so the row reads its unit off the reading and this entry carries the
  // common case. Named by genus where the station splits it, because that is
  // what the evidence is about — Alternaria is the one with OR 190 against
  // near-fatal asthma behind it, and "mold" as a single word is four hundred
  // taxa in a trench coat.
  mold: { name: 'Mold', short: 'mold', unit: 'spores/m³' },
  mold_alternaria: { name: 'Alternaria', short: 'alternaria', unit: 'spores/m³' },
  mold_cladosporium: { name: 'Cladosporium', short: 'cladosporium', unit: 'spores/m³' },
  // The proxy, and the only variable in the table that is an estimate by
  // construction rather than by circumstance: it is five weather conditions
  // counted, not a spore anybody saw. "of 5" for the same reason smoke says
  // "of 3" — the scale is the whole content of the number.
  dry_spore_index: { name: 'Dry-spore conditions', short: 'dry-spore conditions', unit: 'of 5', plural: true },
  // The one variable nobody measures and nothing forecasts: the user taps it
  // (specs/26-sick-as-signal.md). It has no unit because it is not a quantity —
  // the entry either carries the flag or it does not — and no row in the air
  // table, because it is not air. The evidence panel is where it earns a line.
  viral: { name: 'Sick', short: 'sick', unit: '' },
  // Retired from the vector (spec 24), kept for the same reason the retired
  // weather names below are: an entry logged before the diet still carries its
  // NO₂, and the diary line that prints it needs the words.
  no2: { name: 'NO₂', short: 'NO₂', unit: 'µg/m³' },
  so2: { name: 'SO₂', short: 'SO₂', unit: 'µg/m³' },
  co: { name: 'CO', short: 'CO', unit: 'µg/m³' },
  dry_air: { name: 'Dry air', short: 'dry air', unit: '°' },
  humid_heat: { name: 'Humid heat', short: 'humid heat', unit: '°' },
  // Retired weather features (pre-spec-23), kept so old entries still render
  // wherever they surface — the diary line, the evidence rows, a Why line
  // quoting a bound that was learned before the dew point replaced them.
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

/**
 * The dry-spore row's note. It says what the number is before it says
 * anything about spores, because the row is the one place in the table where
 * no instrument looked at the air at all — the five conditions are read off a
 * weather forecast and counted. "Calendar-style" is the honest comparison: it
 * has exactly the standing of the pollen season calendar, which can suspect a
 * season and never confirm one.
 */
export const DRY_SPORE_ESTIMATE = 'calendar-style estimate: warm, dry, windy after a wet spell'

/**
 * What the mold row's note adds when the count behind it has aged past three
 * days, or came from a category word instead of a microscope. The station and
 * the date are already on the note; this is the word that says the app is no
 * longer claiming they describe today.
 */
export const MOLD_ESTIMATE = 'estimate'

/**
 * The dew-point row's verdict on a day between the two thresholds. The
 * evidence chips all answer "what does your diary say about this exposure",
 * and on such a day there is no exposure to have said anything about — the
 * air is neither drying nor muggy. "Barely present" is the right words for a
 * trace of ozone and the wrong ones for a 14 °C dew point, which is not a
 * trace of anything.
 */
export const COMFORTABLE = 'comfortable'

/**
 * The PM10 row's verdict — the second row to speak for itself, after the dew
 * point's `comfortable` (spec 24). The number is on the screen because a
 * person is entitled to see how much coarse particulate is outside; it is
 * deliberately outside the exposure vector because PM10 *is* PM2.5 plus the
 * coarse fraction, so it co-moves with PM2.5 in every candidate set and no
 * clean day can ever tell the two apart. The chip says so rather than leaving
 * the row wearing "no logs yet", which would promise a verdict that is never
 * coming.
 */
export const NOT_GRADED = 'not graded'

/**
 * The ozone row's caveat when the number under it came from CAMS inside the
 * US. The global model carries a warm-season positive ozone bias over the
 * eastern US, and it is not small: on 2026-08-07 in Hamden CAMS read
 * 166 µg/m³ while the New Haven monitor implied about 82 — a 2× gap, which is
 * the difference between a day this app tells someone to stay in and a day it
 * does not. Outside AirNow's coverage the caveat is not made: the bias is a
 * claim about a region, and repeating it over Amsterdam would be inventing
 * one. (specs/27-one-ozone.md)
 */
export const MODEL_OZONE_BIAS = 'Model ozone runs high in the eastern US in summer.'

export const variableName = (v: string): string => VARIABLE_LABELS[v]?.name ?? v

/** "is" or "are" for a sentence about one variable — "Fine particles are…". */
export const variableVerb = (v: string): string => (VARIABLE_LABELS[v]?.plural ? 'are' : 'is')
