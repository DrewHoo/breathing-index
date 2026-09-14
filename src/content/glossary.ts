import { PLANT_BY_VARIABLE } from '../sources/pollenPlants'

/**
 * What each thing in the air is — the one text behind both surfaces that
 * explain it (specs/30-glossary.md). The `?` on a row opens an entry in a
 * sheet; `scripts/generate-glossary.mjs` renders the same entries into
 * `public/glossary/index.html`, and `--check` in `npm test` is what keeps the
 * page from drifting away from this file. Neither surface may carry a word the
 * other lacks, which is why there is no second copy of any of it.
 *
 * Provenance: an agent's draft from `research/asthma-triggers-evidence.md`,
 * then edited to Drew's feedback of 2026-09-14. Still his to rewrite.
 *
 * Rules the text obeys, and a reviewer should hold it to:
 *
 * 1. Every `breathing` paragraph names its evidence tier in plain words —
 *    "shown in lab studies", "seen in emergency-room studies", "a mechanism,
 *    thin data" — because the strength of the claim is the most load-bearing
 *    thing on the line and a reader cannot see it otherwise.
 * 2. Nothing here speaks about the reader's own day. The glossary explains a
 *    mechanism at the population level; the home screen's rule against naming
 *    a cause for today stands. `glossary.test.ts` guards this.
 * 3. Plain words. A symbol gets its English name in parentheses the first
 *    time it appears in an entry ("2.5 µm (micrometers)"); "average", not
 *    "mean"; "monitor" and "model" are named and told apart, never left as
 *    jargon. Plain prose, no markdown.
 * 4. A part that would only state the obvious is left out rather than
 *    filled: Sick has one sentence worth reading, so it has one part.
 */

/** The entries, keyed by the thing itself rather than by any one variable. */
export type GlossaryKey =
  | 'pm25'
  | 'o3'
  | 'so2'
  | 'pm10'
  | 'smoke'
  | 'mold'
  | 'dry_spore_index'
  | 'pollen_tree'
  | 'pollen_grass'
  | 'pollen_weed'
  | 'dewpoint'
  | 'viral'

export interface GlossaryEntry {
  /** the name the row wears, so the `?` beside it says "About {name}" */
  name: string
  /** what the number measures — omitted where the name already says it */
  what?: string
  /** how it affects breathing in asthma, with the evidence tier named */
  breathing: string
  /** the span the row's number covers, and why that span */
  window?: string
  /** where the number comes from, and what "monitor" or "model" means on this row */
  source?: string
}

/**
 * The parts and the small label each wears, in the order both surfaces show
 * them. Here rather than in the sheet and the generator separately, because a
 * label is text too and spec §4's rule is that neither surface may carry a
 * word the other lacks. A part an entry leaves out is skipped, not labelled
 * over nothing.
 */
export const GLOSSARY_PARTS: readonly [keyof Omit<GlossaryEntry, 'name'>, string][] = [
  ['what', 'What it is'],
  ['breathing', 'How it affects breathing'],
  ['window', 'The window'],
  ['source', 'Where the number comes from'],
]

/**
 * The one sentence about monitors and models, repeated where it applies,
 * because each entry is read on its own in the sheet and cannot lean on
 * another entry having explained the words.
 */
const MONITOR_OR_MODEL =
  'A monitor when one is within about 50 miles: an instrument run by your state environmental agency, published through the EPA’s AirNow. Otherwise a model: a computer estimate of the air from satellites, weather and emissions data on a 45-kilometer (28-mile) grid. A model is a prediction, not a measurement, and it can miss a plume a monitor would catch.'

const GOOGLE_POLLEN =
  'Estimated by Google’s pollen model from land cover and weather, not counted with an instrument. A season calendar fills in where the model is silent, and says so.'

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  pm25: {
    name: 'Fine particles',
    what: 'Particles smaller than 2.5 µm (micrometers, millionths of a meter): smoke, exhaust, and particles that form in the air from gases. Small enough to reach the deepest parts of the lung.',
    breathing:
      'Seen in emergency-room studies: asthma visits rise about 4 % for every 10 µg/m³ (micrograms per cubic meter of air), and wildfire smoke hits harder per microgram than city particles do.',
    window: '24-hour average, because the health studies and the official breakpoints are daily.',
    source: MONITOR_OR_MODEL,
  },
  o3: {
    name: 'Ozone',
    what: 'Ozone at ground level, made from traffic exhaust and heat in sunlight. Peaks mid-afternoon.',
    breathing:
      'Shown in lab studies: lung function drops and airways inflame after hours at 0.06 ppm (parts per million), below the US standard of 0.07, and exercise multiplies the dose because you breathe more of it. The effect lags by hours.',
    window: '8-hour average, the same span the US standard uses.',
    source: `${MONITOR_OR_MODEL} For ozone the model runs high in the eastern US in summer.`,
  },
  so2: {
    name: 'SO₂',
    what: 'Sulfur dioxide (SO₂), a gas from coal, refineries, ships and volcanoes. Usually near zero in Connecticut.',
    breathing:
      'Shown in lab studies: people with asthma who are exercising tighten up within minutes at levels healthy lungs ignore. The best-proven sudden trigger there is, and the rarest here.',
    window: 'The hour itself. The row appears only when the gas is present.',
    source: `${MONITOR_OR_MODEL} Not every monitor measures SO₂; the line under the table says when none nearby does.`,
  },
  pm10: {
    name: 'Coarse particles',
    what: 'Particles smaller than 10 µm (micrometers). This includes the fine particles plus dust and road grit.',
    breathing:
      'Weak on its own for sudden asthma symptoms; it rises and falls with fine particles. Shown so you can see the coarse dust; the diary does not grade it.',
    window: '24-hour average.',
    source: MONITOR_OR_MODEL,
  },
  smoke: {
    name: 'Smoke',
    what: 'A smoke plume drawn over this place by an analyst at NOAA (the US weather agency) from satellite pictures, rated light, medium or heavy. Counted only when the particles at ground level are mostly fine ones, which is what smoke is made of.',
    breathing:
      'Seen in emergency-room studies: asthma visits rose 82 % in New York in one day of June 2023 smoke, and per microgram, smoke is two to three times as bad as ordinary fine particles.',
    window:
      'The current hour. Satellites need daylight to see smoke, so at night the plume shown is the afternoon’s.',
    source: 'NOAA’s Hazard Mapping System, plus the fine-particle reading above it.',
  },
  mold: {
    name: 'Mold',
    what: 'Outdoor fungal spores in the air, in spores/m³ (spores per cubic meter of air), counted under a microscope by the counting station you chose in Settings. Alternaria and Cladosporium are the two kinds that matter for asthma.',
    breathing:
      'Seen in emergency-room studies: every kind of fungal spore is linked to more asthma visits than any kind of pollen, and Alternaria is linked to near-fatal attacks. Spores are small enough to reach the lower airways.',
    window: 'The highest of the station’s last three counts, because the effect builds over a few days.',
    source:
      'A counting station: a hospital, health department or clinic that collects spores on a glass slide and counts them on weekday mornings. A count older than three days is shown as an estimate.',
  },
  dry_spore_index: {
    name: 'Dry-spore conditions',
    what: 'A guess at dry-air spores from the weather alone: warm, dry, windy, no rain in two days, after a wet spell. Each condition met adds a point, out of five.',
    breathing:
      'The same spores as mold, by a stand-in: a mechanism, thin data. It can raise a suspicion and never confirm one.',
    window: 'Daily, in season only, always an estimate.',
    source: 'No instrument looked at the air. Five weather conditions off the forecast, counted.',
  },
  pollen_tree: {
    name: 'Tree pollen',
    what: 'Tree pollen on a 0–5 scale, by kind of tree.',
    breathing:
      'Mostly a hay-fever story; the asthma evidence is thin, so these warn later than grass does.',
    window: 'The day’s value.',
    source: GOOGLE_POLLEN,
  },
  pollen_grass: {
    name: 'Grass pollen',
    what: 'Grass pollen on a 0–5 scale.',
    breathing:
      'Seen in emergency-room studies: the only pollen with a firm asthma signal, and it builds over three days.',
    window: 'The highest of the last three days, because the effect builds.',
    source: GOOGLE_POLLEN,
  },
  pollen_weed: {
    name: 'Weed pollen',
    what: 'Weed pollen on a 0–5 scale, by kind of weed. Ragweed is the big one.',
    breathing:
      'Mostly a hay-fever story; the asthma evidence is thin, so these warn later than grass does.',
    window: 'The day’s value.',
    source: GOOGLE_POLLEN,
  },
  // One entry for both edges of one measurement, because there is one row.
  // The vector still carries `dry_air` and `humid_heat` as separate features —
  // they are separate mechanisms with separate thresholds — but a reader
  // tapping the `?` is asking about the number on the screen, and the number
  // is the dew point.
  dewpoint: {
    name: 'Dew point',
    what: 'The temperature at which the water vapor in the air would condense into a dew drop. If it’s too high (above 18 °C / 64 °F), the air is hot and wet — muggy — and hot, humid air sets off a reflex that tightens airways. If it’s too low (below 11 °C / 52 °F), the air is dry enough to dry out the lining of the airways, which is what people call cold-air asthma. In between is comfortable.',
    breathing:
      'Two mechanisms, both shown in lab studies. On the dry side, what people call cold-air asthma is drying, not cold, and it needs hard breathing to start; breathing through the nose nearly cancels it. On the humid side, a separate reflex that an inhaler drug blocked in the lab.',
    window: 'The hour itself.',
    source:
      'The weather forecast’s hourly dew point. Always a model number, because no air-quality monitor reports it.',
  },
  viral: {
    name: 'Sick',
    breathing:
      'A cold alone does little; a cold plus the pollen you react to does a lot. Logging it is what lets the diary see that.',
  },
}

/**
 * The air table's own order, which is the page's order too. Sick is last
 * because it has no row: it is in the table of contents for the same reason
 * it is in the diary's evidence panel, not because anything in the air
 * produced it.
 */
export const GLOSSARY_ORDER: readonly GlossaryKey[] = [
  'pm25',
  'o3',
  'so2',
  'pm10',
  'smoke',
  'mold',
  'dry_spore_index',
  'pollen_tree',
  'pollen_grass',
  'pollen_weed',
  'dewpoint',
  'viral',
]

/** Engine variable names that are one entry between them. */
const BY_VARIABLE: Record<string, GlossaryKey> = {
  pm25: 'pm25',
  o3: 'o3',
  so2: 'so2',
  pm10: 'pm10',
  smoke: 'smoke',
  // Three variables, one thing: the genus split is how the stations report,
  // not a second kind of spore, and the entry says so in its own text.
  mold: 'mold',
  mold_alternaria: 'mold',
  mold_cladosporium: 'mold',
  dry_spore_index: 'dry_spore_index',
  // The two one-sided features are the same curve folded twice
  // (specs/23-dew-point-air.md), and they share the row they share an entry
  // with.
  dry_air: 'dewpoint',
  humid_heat: 'dewpoint',
  viral: 'viral',
}

/**
 * The entry that explains a variable, or undefined where there is none.
 *
 * Undefined is the answer for every retired name — NO₂, CO, the pre-spec-23
 * weather stresses, the pre-spec-18 grains/m³ species. They still have labels,
 * because an old diary entry carries them and has to render as words, but
 * nothing in the air produces them any more and a glossary entry would be
 * explaining a measurement the app no longer takes. The `?` simply does not
 * appear on those rows.
 *
 * Pollen resolves through the plant catalog rather than a list, so a species
 * Google adds and `pollenPlants.ts` adopts gets its `?` for free — the entries
 * are per type, which is the level the row is drawn at.
 */
export const glossaryKeyFor = (variable: string): GlossaryKey | undefined => {
  const direct = BY_VARIABLE[variable]
  if (direct) return direct
  const plant = PLANT_BY_VARIABLE[variable]
  return plant ? (`pollen_${plant.type}` as GlossaryKey) : undefined
}
