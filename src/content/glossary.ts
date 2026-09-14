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
 *    thin data" — because the strength of the claim is the most important
 *    thing on the line and a reader cannot see it otherwise. It then says
 *    how likely the thing is to matter and for whom ("How likely:"), and
 *    what people do about it ("What helps:"), because a mechanism with no
 *    odds and no remedy is trivia.
 * 2. Nothing here speaks about the reader's own day. The glossary explains a
 *    mechanism at the population level; the home screen's rule against naming
 *    a cause for today stands. `glossary.test.ts` guards this.
 * 3. Plain words, in the table's units (µg/m³, never ppm or ppb). A symbol gets its English name in parentheses the first
 *    time it appears in an entry ("2.5 µm (micrometers)"); "average", not
 *    "mean"; "monitor" and "model" are named and told apart, never left as
 *    jargon. Plain prose, no markdown.
 * 4. A part that would only state the obvious is left out rather than
 *    filled: Sick has nothing to say about what it is or where it comes
 *    from, so it has one part.
 * 5. Nothing is specific to one reader or one town: no "Connecticut", no
 *    "here". A regional fact ("the eastern US") is fine.
 * 6. The `window` part is titled "How Breathing Index measures it" and every
 *    one starts "Your Breathing Index ..." and gives the span and the reason
 *    for the span, including "there is no cumulative effect" where the span
 *    is the hour.
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
  /**
   * how it affects breathing in asthma: the evidence with its tier named, how
   * likely it is to matter and for whom, and what people do about it
   */
  breathing: string
  /** how the index measures it: the span the number covers, and why that span */
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
  ['window', 'How Breathing Index measures it'],
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

/** What helps against any particle, said once: the same sentence for fine, coarse, smoke. */
const PARTICLE_HELP =
  'What helps: particles are what a filter catches, so an N95 mask outdoors and a HEPA air cleaner indoors both cut the dose a lot, and moving hard exercise indoors cuts it more. A rescue inhaler opens airways the particles have tightened; it does not remove them.'

/** The same for any pollen. */
const POLLEN_HELP =
  'What helps: a daily antihistamine or steroid nose spray started before the season, a daily controller inhaler kept up through it, windows shut and a shower after time outdoors on high days. Allergy shots are the one treatment that changes the allergy itself rather than the symptoms.'

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  pm25: {
    name: 'Fine particles',
    what: 'Particles smaller than 2.5 µm (micrometers, millionths of a meter): smoke, exhaust, and particles that form in the air from gases. Small enough to reach the deepest parts of the lung.',
    breathing: `Seen in emergency-room studies: asthma visits rise about 4 % for every 10 µg/m³ (micrograms per cubic meter of air), and wildfire smoke hits harder per microgram than city particles do. How likely: in most of the US, most days sit under 10 µg/m³, where the effect is small. The days that matter are smoke days and still winter days when the air does not move. ${PARTICLE_HELP}`,
    window:
      'Your Breathing Index uses the average of the last 24 hours of measurements, since the health studies and the official limits are daily, and one bad hour says less than a bad day.',
    source: MONITOR_OR_MODEL,
  },
  o3: {
    name: 'Ozone',
    what: 'Ozone at ground level, made from traffic exhaust and heat in sunlight. Peaks mid-afternoon.',
    breathing:
      'Shown in lab studies: lung function drops and airways inflame after hours at about 120 µg/m³ (micrograms per cubic meter of air), below the US standard of about 140, and exercise multiplies the dose because you breathe more of it. The effect lags by hours. How likely: a summer-afternoon problem, worst downwind of big cities, and winter has none. What helps: ozone is a gas, so an ordinary mask does nothing, but it is low indoors and low in the morning, so hard exercise before noon or inside avoids most of the dose. A daily controller inhaler blunts the inflammation; a rescue inhaler treats the tightness after the fact.',
    window:
      'Your Breathing Index uses the average of the last 8 hours of measurements, since the damage builds over hours of breathing it and shows up hours later; the US standard uses the same 8-hour span.',
    source: `${MONITOR_OR_MODEL} For ozone the model runs high in the eastern US in summer.`,
  },
  so2: {
    name: 'SO₂',
    what: 'Sulfur dioxide (SO₂), a gas from coal, refineries, ships and volcanoes. Usually near zero away from those sources.',
    breathing:
      'Shown in lab studies: people with asthma who are exercising tighten up within minutes at levels healthy lungs ignore. The best-proven sudden trigger there is, and in most of the US the rarest. How likely: rarely since the coal plants closed, except downwind of a refinery, a busy port, or a volcano. What helps: the tightening reverses within minutes on a rescue inhaler, and on its own once the air clears. Breathing through the nose absorbs most of the gas before it reaches the lungs, which is why it hits people who are exercising. A daily controller inhaler blunts the response.',
    window:
      'Your Breathing Index takes the hour itself, since the reaction comes within minutes and is over soon after the air clears; there is no cumulative effect to take into account. The row appears only when the gas is present.',
    source: `${MONITOR_OR_MODEL} Not every monitor measures SO₂; the line under the table says when none nearby does.`,
  },
  pm10: {
    name: 'Coarse particles',
    what: 'Particles smaller than 10 µm (micrometers). This includes the fine particles plus dust and road grit.',
    breathing: `Weak on its own for sudden asthma symptoms; it rises and falls with fine particles. Shown so you can see the coarse dust; the diary does not grade it. How likely: rarely the thing that matters. It is the dust-storm number in the Southwest and the road-grit number beside construction, and the coarse part settles out within hours of the wind dropping. ${PARTICLE_HELP}`,
    window:
      'Your Breathing Index shows the average of the last 24 hours, the same span as fine particles, since the two rise and fall together; it does not grade this one.',
    source: MONITOR_OR_MODEL,
  },
  smoke: {
    name: 'Smoke',
    what: 'A smoke plume drawn over this location by an analyst at NOAA (the US weather agency) from satellite pictures, rated light, medium or heavy. Counted only when the particles at ground level are mostly fine ones, which is what smoke is made of.',
    breathing: `Seen in emergency-room studies: asthma visits rose 82 % in New York in one day of June 2023 smoke, and per microgram, smoke is two to three times as bad as ordinary fine particles. How likely: a few days in a bad year and none in most. Since 2023, Canadian fire smoke has been reaching farther into the United States than it used to, and nobody knows how often it will come back. The effect can linger a day or two after the sky clears. ${PARTICLE_HELP} Windows shut is the third thing, since a smoke day is the one day the air inside can be made cleaner than the air outside.`,
    window:
      'Your Breathing Index takes the current hour, since a plume is either over a place or it is not; there is nothing to average. Satellites need daylight to see smoke, so at night the plume shown is the afternoon’s.',
    source: 'NOAA’s Hazard Mapping System, plus the fine-particle reading above it.',
  },
  mold: {
    name: 'Mold',
    what: 'Outdoor fungal spores in the air, in spores/m³ (spores per cubic meter of air), counted under a microscope by the counting station you chose in Settings. Alternaria and Cladosporium are the two kinds that matter for asthma.',
    breathing:
      'Seen in emergency-room studies: every kind of fungal spore is linked to more asthma visits than any kind of pollen, and Alternaria is linked to near-fatal attacks. Spores are small enough to reach the lower airways. How likely: only for the minority of people with asthma who are sensitized to mold, and an allergist’s skin or blood test settles who is. For them it is a late-summer and fall problem, worst on dry windy days and around leaf piles, compost and mowing. What helps: the same daily controller inhaler and antihistamine that work for pollen, staying away from raking and mowing, and an N95 mask for yard work, since spores are particles a mask catches.',
    window:
      'Your Breathing Index uses the highest of the station’s last three counts, since the effect builds over a few days. It counts station days rather than calendar days because a station counts on weekdays only, and a calendar window would come up empty every Monday.',
    source:
      'A counting station: a hospital, health department or clinic that collects spores on a glass slide and counts them on weekday mornings. A count older than three days is shown as an estimate.',
  },
  dry_spore_index: {
    name: 'Dry-spore conditions',
    what: 'A guess at dry-air spores from the weather alone: warm, dry, windy, no rain in two days, after a wet spell. Each condition met adds a point, out of five.',
    breathing:
      'The same spores as mold, by a stand-in: a mechanism, thin data. It can raise a suspicion and never confirm one. How likely: the same as Mold, for people sensitized to mold. What helps: the same as Mold.',
    window:
      'Your Breathing Index counts the five conditions against each hour’s forecast, in season only, and always marks the result as an estimate, since no instrument looked at the air.',
    source: 'No instrument looked at the air. Five weather conditions off the forecast, counted.',
  },
  pollen_tree: {
    name: 'Tree pollen',
    what: 'Tree pollen on a 0–5 scale, by kind of tree.',
    breathing: `Mostly a hay-fever story; the asthma evidence is thin, so these warn later than grass does. How likely: spring, and which trees depends on the region; oak and birch are the big ones in the eastern US. For people sensitized to tree pollen, which most people with allergic asthma are, nose and eye symptoms are near-certain in season; asthma symptoms follow in a smaller share, mostly with a cold on top. ${POLLEN_HELP}`,
    window:
      'Your Breathing Index takes the day’s value, since Google’s model resolves pollen by the day and the tree-pollen evidence does not support a longer window.',
    source: GOOGLE_POLLEN,
  },
  pollen_grass: {
    name: 'Grass pollen',
    what: 'Grass pollen on a 0–5 scale.',
    breathing: `Seen in emergency-room studies: the only pollen with a firm asthma signal, and it builds over three days. How likely: late spring into summer, and only for people sensitized to grass pollen, which most people with allergic asthma are. A thunderstorm in grass season is the rare case where it hits people with no asthma diagnosis at all, because the storm breaks pollen into pieces small enough to reach the lungs. ${POLLEN_HELP} Mowing, and standing near mowing, is the one exposure worth skipping outright.`,
    window:
      'Your Breathing Index uses the highest of the last three days, since the emergency-room studies find the effect builds over about three days of exposure, and a same-day number under-counts it.',
    source: GOOGLE_POLLEN,
  },
  pollen_weed: {
    name: 'Weed pollen',
    what: 'Weed pollen on a 0–5 scale, by kind of weed. Ragweed is the big one.',
    breathing: `Mostly a hay-fever story; the asthma evidence is thin, so these warn later than grass does. How likely: ragweed runs from mid-August to the first frost and is the most common pollen allergy in the eastern US, so nose and eye symptoms are near-certain for anyone sensitized. Asthma flares are less common and tend to come when a September cold lands on top of it. ${POLLEN_HELP}`,
    window:
      'Your Breathing Index takes the day’s value, since Google’s model resolves pollen by the day and the weed-pollen evidence does not support a longer window.',
    source: GOOGLE_POLLEN,
  },
  // One entry for both edges of one measurement, because there is one row.
  // The vector still carries `dry_air` and `humid_heat` as separate features —
  // they are separate mechanisms with separate thresholds — but a reader
  // tapping the `?` is asking about the number on the screen, and the number
  // is the dew point.
  dewpoint: {
    name: 'Dew point',
    what: 'The temperature at which the water vapor in the air would condense into a dew drop. If it’s too high, the hot, wet air can set off a reflex that tightens airways. If it’s too low the dry air causes the lining of the airways to dry out. In between is comfortable.',
    breathing:
      'Two mechanisms, both shown in lab studies. On the dry side, below a dew point of about 11 °C (52 °F), what people call cold-air asthma is drying, not cold, and it needs hard breathing to start: hard exercise in dry air tightens the airways of most people with asthma within minutes. On the humid side, above about 18 °C (64 °F), a separate reflex that a drug in some inhalers blocked in the lab; it also needs hard breathing. How likely: the dry side is a winter problem and the humid side a July-and-August one. Both are among the most common asthma triggers there are, and both are the easiest to get out of. What helps: on the dry side, breathing through the nose nearly cancels it, a scarf or mask over the mouth warms and wets the air, and a rescue inhaler taken 15 minutes before exercise prevents it in most people. On the humid side, air conditioning removes the trigger.',
    window:
      'Your Breathing Index just takes into account the hour at which the dew point is measured; there isn’t a cumulative effect to take into account.',
    source:
      'The weather forecast’s hourly dew point. Always a model number, because no air-quality monitor reports it.',
  },
  viral: {
    name: 'Sick',
    breathing:
      'A cold alone does little; a cold plus the pollen you react to does a lot. Logging it is what lets the diary see that. Colds are the most common cause of an asthma flare bad enough for the emergency room, and the two weeks after school starts are the peak of the year. What helps: a cold is the one time to be strict about the daily controller inhaler, and to have the rescue inhaler close.',
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
