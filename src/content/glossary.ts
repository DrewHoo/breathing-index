import { PLANT_BY_VARIABLE } from '../sources/pollenPlants'

/**
 * What each thing in the air is — the one text behind both surfaces that
 * explain it (specs/30-glossary.md). The `?` on a row opens an entry in a
 * sheet; `scripts/generate-glossary.mjs` renders the same entries into
 * `public/glossary/index.html`, and `--check` in `npm test` is what keeps the
 * page from drifting away from this file. Neither surface may carry a word the
 * other lacks, which is why there is no second copy of any of it.
 *
 * Provenance: this copy is an agent's draft, written from
 * `research/asthma-triggers-evidence.md` and the spec's own draft table, for
 * Drew to edit. It is not his voice yet.
 *
 * Three rules the text obeys, and a reviewer should hold it to:
 *
 * 1. Every `breathing` paragraph names its evidence tier in plain words —
 *    "shown in controlled exposure", "seen in emergency-visit studies", "a
 *    mechanism, thin data" — because the strength of the claim is the most
 *    load-bearing thing on the line and a reader cannot see it otherwise.
 * 2. Nothing here speaks about the reader's own day. The glossary explains a
 *    mechanism at the population level; the home screen's rule against naming
 *    a cause for today stands, and a glossary that said "this is why you feel
 *    bad" would break it from the side door. `glossary.test.ts` guards this.
 * 3. Plain prose, no markdown: the sheet renders it as text nodes and the page
 *    wraps it in `<p>`. A stray asterisk would ship as an asterisk.
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
  /** what the number measures */
  what: string
  /** how it affects breathing in asthma, with the evidence tier named */
  breathing: string
  /** the span the row's number covers, and why that span */
  window: string
  /** where the number comes from, and what the row's provenance word means */
  source: string
  /** what the row's right-hand words mean on this row specifically */
  verdicts: string
}

/**
 * The five parts and the small label each wears, in the order both surfaces
 * show them. Here rather than in the sheet and the generator separately,
 * because a label is text too and spec §4's rule is that neither surface may
 * carry a word the other lacks.
 */
export const GLOSSARY_PARTS: readonly [
  keyof Omit<GlossaryEntry, 'name'>,
  string,
][] = [
  ['what', 'What it is'],
  ['breathing', 'How it affects breathing'],
  ['window', 'The window'],
  ['source', 'Where the number comes from'],
  ['verdicts', 'What the words on the row mean'],
]

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  pm25: {
    name: 'Fine particles',
    what: 'Particles under 2.5 µm: smoke, exhaust, secondary aerosol. Small enough to reach the deep lung.',
    breathing:
      'Seen in emergency-visit studies: asthma visits rise about 4 % per 10 µg/m³, and wildfire smoke hits harder per microgram than city particulate.',
    window:
      '24-hour mean, because the health studies and the official breakpoints are daily.',
    source: 'Monitor when one is near; the model otherwise.',
    verdicts: 'The usual verdicts.',
  },
  o3: {
    name: 'Ozone',
    what: 'Ozone at ground level, made from traffic and heat in sunlight. Peaks mid-afternoon.',
    breathing:
      'Shown in controlled exposure: lung function drops and airways inflame at 0.06 ppm over hours, below the US standard, and exertion multiplies the dose. The effect lags by hours.',
    window: "8-hour mean, the standard's own form.",
    source: 'Monitor or model; the model runs high in the eastern US in summer.',
    verdicts: 'The usual verdicts.',
  },
  so2: {
    name: 'SO₂',
    what: 'Sulfur dioxide, from coal, refineries, ships and volcanoes. Usually near zero in Connecticut.',
    breathing:
      'Shown in controlled exposure: exercising asthmatics tighten within minutes at levels healthy lungs ignore. The best-proven acute trigger there is, and the rarest here.',
    window: 'The hour itself. The row appears only when it is present.',
    source: 'Monitor where one reports it; the model otherwise.',
    verdicts: 'The usual verdicts.',
  },
  pm10: {
    name: 'Coarse particles',
    what: 'Particles under 10 µm, which includes PM2.5 plus dust and road grit.',
    breathing:
      'Weak on its own for acute asthma; it moves with PM2.5. Shown so you can see coarse particulate; the diary does not grade it.',
    window: '24-hour mean.',
    source: 'Monitor when one is near; the model otherwise.',
    verdicts: '"not graded": shown, never a suspect.',
  },
  smoke: {
    name: 'Smoke',
    what: "NOAA's satellite smoke analysis, light to heavy, counted only when the particulate under it is fine-mode.",
    breathing:
      'Seen in emergency-visit studies: asthma visits rose 82 % in New York in a day of June 2023 smoke; per microgram, smoke is two to three times ordinary PM2.5.',
    window:
      "The current hour; satellites need daylight, so at night the plume is the afternoon's.",
    source: "An analyst's plume drawn over this place, from NOAA's Hazard Mapping System.",
    verdicts: 'The usual verdicts.',
  },
  mold: {
    name: 'Mold',
    what: 'Outdoor fungal spores per cubic metre, counted on a slide by the station you chose. Alternaria and Cladosporium are the two that matter.',
    breathing:
      'Seen in emergency-visit studies: every fungal group larger than any pollen group; Alternaria is linked to near-fatal asthma. Spores are small enough to reach the lower airway.',
    window: "Highest of the station's last three counts.",
    source:
      'Stations count on weekday mornings; a count older than three days is an estimate.',
    verdicts: '"estimate" when the count is old.',
  },
  dry_spore_index: {
    name: 'Dry-spore conditions',
    what: 'A weather guess at dry-air spores: warm, dry, windy, no rain in two days, after a wet spell.',
    breathing: 'The same spores as mold, by proxy. It can suspect and never confirm.',
    window: 'Daily, in season, always an estimate.',
    source:
      'No instrument looked at the air: five weather conditions off the forecast, counted.',
    verdicts: '"estimate from weather".',
  },
  pollen_tree: {
    name: 'Tree pollen',
    what: 'Tree pollen on a 0–5 index, by plant.',
    breathing:
      'Mostly a hay-fever story; the asthma evidence is thin, so these warn later than grass.',
    window: "The day's index.",
    source: 'Modelled, not counted; a calendar estimate where the model is silent.',
    verdicts: '"calendar estimate".',
  },
  pollen_grass: {
    name: 'Grass pollen',
    what: 'Grass pollen on a 0–5 index, by plant.',
    breathing:
      'Seen in emergency-visit studies: the only pollen with a firm asthma signal, and it builds over three days.',
    window: 'Highest of the last three days.',
    source: 'Modelled, not counted; a calendar estimate where the model is silent.',
    verdicts: '"calendar estimate".',
  },
  pollen_weed: {
    name: 'Weed pollen',
    what: 'Weed pollen on a 0–5 index, by plant.',
    breathing:
      'Mostly a hay-fever story; the asthma evidence is thin, so these warn later than grass.',
    window: "The day's index.",
    source: 'Modelled, not counted; a calendar estimate where the model is silent.',
    verdicts: '"calendar estimate".',
  },
  // One entry for both edges of one measurement, because there is one row.
  // The vector still carries `dry_air` and `humid_heat` as separate features —
  // they are separate mechanisms with separate thresholds — but a reader
  // tapping the `?` is asking about the number on the screen, and the number
  // is the dew point.
  dewpoint: {
    name: 'Dew point',
    what: 'One measurement with two edges. Dew point below 11 °C / 52 °F: air dry enough to dry the airway lining. Dew point above 18 °C / 64 °F: hot, wet air.',
    breathing:
      'Two mechanisms, one row. On the dry side, shown in controlled exposure: what people call cold-air asthma is drying, not cold, and it needs hard breathing to start. Nose-breathing nearly cancels it. On the humid side, also shown in controlled exposure: a separate reflex from dry air, blocked by an inhaler drug in the lab.',
    window: 'The hour itself.',
    source:
      "The weather forecast's hourly dew point — modelled everywhere, since no air-quality monitor reports it.",
    verdicts: '"comfortable" between 11 and 18 °C.',
  },
  viral: {
    name: 'Sick',
    what: 'You said you were sick.',
    breathing:
      'A cold alone does little; a cold plus the pollen you react to does a lot. Logging it is what lets the diary see that.',
    window: 'The day you tapped it.',
    source: 'You, not a feed: the one variable here nobody measures.',
    verdicts:
      'No words on the air table — being sick is not air. It earns a line in the diary’s evidence panel instead.',
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
