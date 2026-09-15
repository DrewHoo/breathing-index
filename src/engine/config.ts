import { POLLEN_PLANTS, POLLEN_PLANT_VARIABLES } from '../sources/pollenPlants'
import type { Priors } from './types'

/**
 * Background floors: an exposure at or below this can never become a suspect,
 * even with no tolerance evidence. These encode "measurably present," not
 * "harmful" — they sit well below any health-relevant level.
 *
 * They sit *above* routine background, though, or every bad day implicates
 * every variable and candidate sets never collapse. The weather rows are the
 * ones that had to move: 55 %RH over three days is an ordinary week in New
 * England, and a heat-stress floor of 0 made 25.1 °C a suspect.
 */
const NEGLIGIBLE: Record<string, number> = {
  pm25: 5, // µg/m³
  pm10: 10,
  o3: 20,
  no2: 10,
  // SO₂, at half the WHO 24-h guideline of 40 (specs/29-sulfur-dioxide.md).
  // The controlled-exposure literature is the sharpest in this table and it
  // sits two orders of magnitude above this line: exercising asthmatics
  // bronchoconstrict within 2–10 minutes at 0.5 ppm (≈ 1,300 µg/m³, airway
  // resistance roughly doubling) and measurably at 0.25 ppm, while healthy
  // people barely respond at ten times that. Nothing near 20 is a documented
  // trigger — and that is the point of the number rather than an argument
  // against it. The floor is what makes admitting the variable free: Hamden's
  // SO₂ runs 0.2–2.7 µg/m³, so below the line it is never a candidate, never
  // earns a bound, and costs the other variables no identifiability. It only
  // appears on the day a refinery, a port or a volcanic plume puts it in the
  // air, which is the day it explains everything.
  so2: 20,
  co: 500, // µg/m³ — urban background runs 200–400
  // Light smoke is a suspect (specs/25-smoke-variable.md). The scale has three
  // steps and the bottom one already means "an analyst drew a plume over you
  // *and* the particulate underneath it is fine-mode" — there is no routine
  // background of that to raise a floor above. A floor of 0 is the whole
  // scale, which `aboveNegligible` handles like every other row: the margin is
  // relative, so `x > 0 · (1 + ε/2)` is `x > 0`.
  smoke: 0, // 0–3, and the gate is what keeps the bottom step honest
  // Being sick is a flag, not a concentration (specs/26-sick-as-signal.md):
  // the chip writes 1 or the key is absent, and there is no "a little bit of
  // virus" for a floor to sit above. Same shape as `smoke` and handled by the
  // same arithmetic — the margin is relative, so `x > 0 · (1 + ε/2)` is `x > 0`
  // and the one step the scale has is a suspect.
  viral: 0, // 0 or 1, tap-recorded
  dry_air: 1, // °C below an 11 °C dew point: 10 °C is dry-ish, not drying
  humid_heat: 1, // °C above an 18 °C dew point, same reasoning on the other side
  // Mold, in spores/m³ (specs/28-mold.md). Every number in this block and the
  // priors below is a *convention*, not a validated threshold, and the app
  // should say so wherever it says anything: nobody publishes a personal
  // breakpoint table for spores, and the two genus numbers that get quoted as
  // if they were one trace to a 1979 committee (below).
  //
  // 500 spores/m³ of total mold is an ordinary summer morning nearly
  // everywhere that counts — Houston's "LOW" day of 2026-09-11 was 5,116 — so
  // a floor under it is the same kind of statement as o3 at 20: measurably
  // present, not worth suspecting.
  mold: 500,
  // Alternaria is counted in tens where the others are counted in thousands:
  // 4 spores/m³ on that same Houston day against 591 of Cladosporium. A floor
  // shared with the total would put every Alternaria reading ever published
  // below it and quietly retire the variable.
  mold_alternaria: 10,
  mold_cladosporium: 100,
  // The weather proxy, 0–5 (specs/28-mold.md §7). Two of the five conditions
  // are met on most days of the season — it is warm and it is windy — so a
  // floor of 2 is what stops "August in the northeast" from being a suspect on
  // every bad day of the season.
  dry_spore_index: 2,
  // Retired weather features (pre-spec-23): kept so entries logged against
  // them still clear — or fail to clear — the same bar they were graded on.
  heat_stress: 1, // °C above 25: 26 °C is warm, not stressful
  cold_dry_stress: 1, // °C below 10, same reasoning on the other side
  humidity: 65, // %RH mean72h below this is not a mold-proxy candidate
  grass_pollen: 2, // grains/m³ — retired scale, see the pollen note on PRIORS
  ragweed_pollen: 1,
  birch_pollen: 2,
  // Every measured pollen plant (index points, 0–5): Very Low is present,
  // never a suspect.
  ...Object.fromEntries(POLLEN_PLANT_VARIABLES.map((v) => [v, 1])),
}

export function negligibleFor(variable: string): number {
  return NEGLIGIBLE[variable] ?? 0
}

/**
 * Per-variable noise margin ε, relative. Every threshold comparison the engine
 * makes between two *observations* is fuzzed by it, because the inputs are not
 * exact: CAMS model estimates carry tens of percent of error against monitors,
 * and a 19.9-vs-20.0 µg/m³ difference must not flip a forecast or manufacture a
 * contradiction between two days.
 *
 * 15 % for the modeled pollutants is a starting guess; the app already fetches
 * AirNow alongside, so the honest version is a per-pollutant model-vs-station
 * error derived from accumulated comparisons. Weather comes from a measurement
 * network rather than a chemistry model, so it gets 5 %.
 */
const NOISE_MARGIN: Record<string, number> = {
  dry_air: 0.05,
  humid_heat: 0.05,
  // Retired weather features (pre-spec-23), on the same reasoning.
  heat_stress: 0.05,
  cold_dry_stress: 0.05,
  humidity: 0.05,
}

const DEFAULT_NOISE_MARGIN = 0.15

export function noiseMarginFor(variable: string): number {
  return NOISE_MARGIN[variable] ?? DEFAULT_NOISE_MARGIN
}

/**
 * Variables whose numbers mean something different when the exposure source
 * changes — everything the air-quality source measures. A CAMS ozone estimate
 * and a monitor's ozone reading are not interchangeable (Hamden, 2026-08-07:
 * CAMS 166 µg/m³ against a nearby monitor implying ~82), so bounds learned
 * against one source do not transfer to the other. Weather-derived variables
 * come from a different pipe and survive an air-source switch.
 *
 * `smoke` is deliberately absent (specs/25-smoke-variable.md). Its number is a
 * satellite plume density, which reads the same whichever feed filled the PM
 * columns, and the fine-fraction gate in front of it only asks those columns a
 * yes/no rather than putting their values in the vector. A source switch
 * changes what "pm25 was 20" means; it does not change what "Medium plume
 * overhead" means, so a smoke bound learned on CAMS still holds on AirNow.
 *
 * The mold variables are absent too, and that one is a compromise rather than
 * a clean argument (specs/28-mold.md). The source string on an entry names the
 * *air* feed — `cams-w2` or `airnow` — and a mold count comes from neither, so
 * scoping mold to it would retire a mold bound every time a monitor came in
 * range. But the thing a mold bound really depends on is the station, and
 * changing stations is a scale change the engine cannot see: St. Louis prints
 * a bare number and never names its unit, Houston publishes spores/m³, and
 * 15,000 at one is not 15,000 at the other. Nothing here can catch that, so
 * the Settings copy says it out loud instead — switching stations starts
 * mold's learned bounds over in practice, if not in the model. The honest fix
 * is a later spec carrying the station in the source string, which would make
 * a station switch a source switch and hand the existing machinery the job.
 */
export const SOURCE_SCOPED_VARIABLES: ReadonlySet<string> = new Set([
  'pm25',
  'pm10',
  'o3',
  'no2',
  'so2',
  'co',
])

/** Entries logged before the source was recorded, all from the same era. */
export const UNSPECIFIED_SOURCE = 'unspecified'

/**
 * Variables that proxy indoor exposure. The "worse-outdoors" observation
 * removes these from an entry's candidate sets: symptoms tied to being
 * outside can't be blamed on the indoor-air proxy.
 *
 * `humidity` stays here after spec 23 retired it from the live vector, for
 * two reasons. An entry logged before the retirement still carries the
 * variable *and* may carry the tag, and dropping the name would silently
 * change what that entry means — the day was read as "not the mould proxy,
 * then" when it was saved, and a recompute has to keep reading it that way.
 * And the set is the mechanism itself, not a list about humidity. Spec 28 was
 * expected to put a real member in it and did not: outdoor mold is measured at
 * a trap on somebody's roof, so a day that was worse outdoors is exactly the
 * day it *should* stay a candidate on. An empty set would be a mechanism with
 * nothing to point at, which is harder to find than a retired name with a
 * comment on it; an indoor sensor is what would finally fill it.
 */
export const INDOOR_PROXY_VARIABLES: ReadonlySet<string> = new Set(['humidity'])

/**
 * Names that left the live vector because the *mechanism* was wrong
 * (specs/23-dew-point-air.md): heat was a temperature the drying reflex does
 * not depend on, cold was gated on the wrong quantity, humidity was a mold
 * proxy with the wrong sign. Old entries still carry them, and they still
 * render — "fine in everything up to" is still true of the days that said so —
 * but they are never candidates for a bad day. A trigger on one could never
 * act on a forecast, since no live vector names it, and while it sat in a
 * candidate set it cost the live variable beside it the lone-candidate day
 * that would have confirmed it. On a real diary that was the difference
 * between ozone confirmed and "never seen it act alone".
 *
 * The retired grains/m³ pollen names are deliberately not here: that was a
 * change of scale, not of mechanism, and a pollen day is still a pollen day.
 */
export const RETIRED_VARIABLES: ReadonlySet<string> = new Set([
  'heat_stress',
  'cold_dry_stress',
  'humidity',
])

/**
 * Population priors, ceiling-only: "at this exposure, a sensitive person is
 * *potentially* at this level." Personal diary evidence replaces these.
 *
 * The pollutant rows are generated by `scripts/derive-breakpoints.mjs`, which holds
 * the published tables in their published units and does the ppb -> µg/m³ conversion;
 * `npm test` fails if the block below drifts from it. Edit the script, then run
 * `node scripts/derive-breakpoints.mjs --write`. Each row names its source, because
 * they are not all the same source: PM and ozone are EPA AQI breakpoints, while
 * no2/so2/co are WHO (and one EU) guideline values, which are stricter than EPA's
 * breakpoints for those gases. Weather/pollen rows below are heuristic starts.
 *
 * Several rows here name variables no exposure vector carries any more — `pm10`
 * and `no2` since specs/24-vector-diet.md, `humidity` and the two weather
 * stresses since spec 23. They stay, and they are inert by construction: a
 * prior is compared against `exposure[variable] ?? 0`, so a row nobody's air
 * mentions can never clear its own bound. Deleting the pollutant ones would
 * mean editing the derivation script to disagree with the published tables it
 * exists to transcribe, which is a worse lie than a row that does nothing —
 * and they still cover old entries, which do carry the names.
 *
 * Two honesty notes about comparing these to what the app actually measures:
 *
 * 1. **Which average.** The published breakpoints are averages — 24-h means for PM,
 *    8-h for ozone and CO, 1-h or 24-h for the WHO gases — and since
 *    specs/22-exposure-windows.md the engine's features are the matching running
 *    means: 24-h for PM, 8-h for ozone (docs/trigger-model.md). PM and ozone are
 *    therefore compared like with like. SO₂ is not, and knowingly so
 *    (specs/29-sulfur-dioxide.md): its feature is the hour itself, graded against a
 *    24-h guideline at level 2 and an EU 1-h limit at level 4, so a single bad hour
 *    can cross a 24-h number a real 24-h mean would not. Averaging it away is the
 *    worse error — the mechanism is minutes — and the bias is toward warning early,
 *    which is the right direction for a ceiling that only ever *raises* a prediction
 *    and is superseded by the user's own diary. `co` would carry the same mismatch on
 *    the day spec 20 admits it by region; no vector carries it today. The numbers are
 *    not AQI categories either way, and nothing in the UI should claim they are.
 * 2. **Which end of the category.** Every row is the *lower* bound of its category:
 *    the exposure at which a category begins, not its midpoint. That is what makes
 *    "potentially at this level" true at the threshold rather than halfway past it.
 * 3. **Real-world numbers against modeled inputs.** These breakpoints describe actual
 *    concentrations; the engine compares them against a model estimate that can carry
 *    a regional bias (CAMS global runs warm-season surface ozone high in the eastern
 *    US). Where the model is inflated, the priors fire early — over-warning, which is
 *    the safe direction for a ceiling. Unlike the learned bounds, priors are *not*
 *    source-scoped: they are the fallback for a person the app does not know yet.
 */
export const PRIORS: Priors = {
  // --- derived by scripts/derive-breakpoints.mjs — edit there, not here ---
  // EPA AQI table (2024 PM2.5 revision), 24-h mean, published in µg/m³ — no conversion.
  //   2 = Moderate 9.1 · 3 = USG 35.5 · 4 = Unhealthy 55.5
  pm25: { 2: 9.1, 3: 35.5, 4: 55.5 }, // µg/m³
  // EPA AQI table, 24-h mean, published in µg/m³ — no conversion.
  //   2 = Moderate 55 · 3 = USG 155 · 4 = Unhealthy 255
  pm10: { 2: 55, 3: 155, 4: 255 }, // µg/m³
  // EPA AQI table, 8-h mean, published in ppb -> µg/m³ at 25 °C / 1013 hPa. Level 2 is
  // the WHO 2021 8-h guideline instead: stricter than EPA Moderate (55 ppb ≈ 108 µg/m³),
  // which is what a sensitive-user ceiling wants.
  //   2 = WHO 8-h AQG 100 · 3 = EPA USG 71 ppb ×1.96 = 139 · 4 = EPA Unhealthy 86 ppb ×1.96 = 169
  o3: { 2: 100, 3: 139, 4: 169 }, // µg/m³
  // WHO 2021 air quality guidelines, published in µg/m³ — not EPA, and deliberately
  // stricter than it: EPA 1-h USG starts at 101 ppb ≈ 190 µg/m³. Level 3 is a hand-set
  // step between the two WHO numbers, not a published breakpoint.
  //   2 = WHO 24-h AQG 25 · 3 = hand-set 100 · 4 = WHO 1-h guideline 200
  no2: { 2: 25, 3: 100, 4: 200 }, // µg/m³
  // WHO / EU guidelines, published in µg/m³ — not EPA, and stricter than it: EPA 1-h USG
  // starts at 76 ppb ≈ 199 µg/m³.
  //   2 = WHO 2021 24-h AQG 40 · 3 = WHO 2005 24-h IT-1 125 · 4 = EU 1-h limit 350
  so2: { 2: 40, 3: 125, 4: 350 }, // µg/m³
  // WHO guidelines, published in mg/m³, written here in µg/m³ (×1000) to match the rest
  // of the engine. Level 4 is hand-set and sits just *above* EPA 8-h Unhealthy
  // (12.5 ppm ≈ 14313 µg/m³) — the one row that is not conservative against EPA.
  //   2 = WHO 24-h AQG 4000 · 3 = WHO 8-h guideline 10000 · 4 = hand-set 15000
  co: { 2: 4000, 3: 10000, 4: 15000 }, // µg/m³
  // --- end derived ---
  // Smoke density, 0–3 (specs/25-smoke-variable.md): Light is potentially a 2,
  // Medium a 3, Heavy a 4. A heuristic start of exactly the same standing as
  // the pollen index rows below — nobody publishes a breakpoint table for
  // "analyst-drawn plume thickness", and the number it is grading is a
  // category, not a concentration. What makes the row worth having is not this
  // prior but the split: the diary can learn that smoke PM2.5 gets this person
  // at 15 µg/m³ while ordinary PM2.5 does not until 35, which is the shape of
  // the published effect (Wang 2025 puts wildfire PM2.5 at 2–3× urban per µg —
  // the 10× that gets quoted is a range-to-range artifact,
  // research/asthma-triggers-evidence.md).
  smoke: { 2: 1, 3: 2, 4: 3 }, // 0–3 density index
  // Being sick (specs/26-sick-as-signal.md). A ceiling only, and a heuristic
  // start of the weakest kind: the population evidence says a virus *alone* is
  // null — Green 2002 put it at OR 1.67 with an interval crossing 1 — and that
  // what multiplies is virus × sensitization × allergen exposure (OR 8.4 in
  // adults, 19.4 in Murray 2005's children). A prior cannot express a product,
  // so the row says the weaker true thing: for a sensitive person a sick day is
  // potentially a 2. Everything real about the interaction is learned, by the
  // combo-repeat clause flooring on a repeat of sick-plus-pollen without ever
  // attributing the day to either half.
  viral: { 2: 1 }, // 0 or 1
  // Mold, in spores/m³ (specs/28-mold.md). The total's rows are the AAAAI
  // National Allergy Bureau's published mold bands — Low below 6,500, Moderate
  // 6,500–12,999, High 13,000–49,999, Very High 50,000 and up — read the way
  // every other row here is read: the exposure at which a category *begins*,
  // as a ceiling for a sensitive person. They are a counting convention rather
  // than a dose-response finding, which is the same epistemic standing as the
  // pollen index rows and worth saying twice, because a number with five
  // digits looks more measured than a number with one.
  mold: { 2: 6500, 3: 13000, 4: 50000 },
  // The genus rows are weaker still. Alternaria above 100/m³ and Cladosporium
  // above 3,000/m³ are the thresholds every allergy site quotes, and they
  // trace to a 1979 convention rather than to an effect size — no isolated
  // spores/m³ threshold with an effect attached could be found for either
  // (research/asthma-triggers-evidence.md). The best modern study, 26 years of
  // Danish data, deliberately throws the convention out and uses quartiles,
  // and finds effects well below what the convention calls a high day. So
  // these rows are a starting ceiling the diary is *expected* to overwrite
  // downward, and the upper rows are hand-set steps above them rather than
  // published bands.
  mold_alternaria: { 2: 100, 3: 500 },
  mold_cladosporium: { 2: 3000, 3: 10000 },
  // The weather proxy, 0–5 (specs/28-mold.md §7). Four of five conditions is a
  // dry warm windy day after a wet week, which is the shape of an Alternaria
  // peak; five is all of it. It can suspect and never confirm — the variable
  // is always `estimated`, so the provenance rule caps it at suspected-strong
  // however many times it repeats.
  dry_spore_index: { 2: 4, 3: 5 },
  // Dew point, the one weather number both mechanisms are gated on
  // (specs/23-dew-point-air.md). Written as distance from each threshold, so
  // the rows below read: a 6 °C dew point is potentially a 2, freezing is
  // potentially a 3; 20 °C of dew point is potentially a 2, 23 °C a 3. Same
  // epistemic status as the pollen index rows — a heuristic start the diary
  // is expected to overwrite.
  dry_air: { 2: 5, 3: 11 }, // °C below an 11 °C dew point
  humid_heat: { 2: 2, 3: 5 }, // °C above an 18 °C dew point
  // Retired weather features (pre-spec-23): kept exactly as the retired
  // grains/m³ pollen rows below are, so an entry that carries one is still
  // judged against the scale it was logged on. They never rejoin the live
  // vector — `heat_stress` was a temperature the drying mechanism does not
  // depend on, and `humidity` was an outdoor mold proxy with the wrong sign.
  heat_stress: { 2: 7, 3: 12 }, // °C above 25
  cold_dry_stress: { 2: 10, 3: 18 }, // °C below 10, dry air
  humidity: { 2: 70 }, // %RH mean72h, indoor mold/dust-mite proxy
  // Retired grains/m³ species (pre-spec-18): kept only so entries that carry
  // them keep meaning something wherever old entries surface. They never
  // rejoin the live vector, and they must never share a name with the index
  // scale below — a 20 grains/m³ day compared against an index 3 is nonsense.
  ragweed_pollen: { 2: 10, 3: 50 }, // grains/m³
  grass_pollen: { 2: 20, 3: 100 },
  birch_pollen: { 2: 30, 3: 90 },
  // Every measured pollen plant, on the 0–5 index scale every current source
  // speaks (specs/18-measured-pollen.md): Moderate is potentially a 2 for a
  // sensitive person, High potentially a 3, Very High potentially a 4. A
  // heuristic start — the diary is what makes birch and oak diverge, not the
  // prior; same epistemic status as the weather rows.
  //
  // Tree plants warn one step later, skipping the Moderate row entirely
  // (specs/22-exposure-windows.md). The population evidence for tree pollen
  // and asthma is weak where it exists at all: London's tree models came back
  // inconclusive, and Atlanta associated Cupressaceae with *fewer* asthma ED
  // visits. Tree pollen is mostly a rhinitis story. Grass is the one taxon
  // with a defensible asthma signal — Erbas 2018's meta-analysis, threshold-
  // shaped over a three-day window, which is why grass is also the one pollen
  // variable carrying a window (sources/openMeteo.ts) — and weeds keep their
  // Moderate row on the same reasoning at lower confidence. Every plant stays
  // a candidate either way; only the prior moved.
  ...Object.fromEntries(
    Object.values(POLLEN_PLANTS).map((plant) => [
      plant.variable,
      plant.type === 'tree' ? { 3: 4, 4: 5 } : { 2: 3, 3: 4, 4: 5 },
    ]),
  ),
}
