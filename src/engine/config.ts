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
  so2: 5,
  co: 500, // µg/m³ — urban background runs 200–400
  // Light smoke is a suspect (specs/25-smoke-variable.md). The scale has three
  // steps and the bottom one already means "an analyst drew a plume over you
  // *and* the particulate underneath it is fine-mode" — there is no routine
  // background of that to raise a floor above. A floor of 0 is the whole
  // scale, which `aboveNegligible` handles like every other row: the margin is
  // relative, so `x > 0 · (1 + ε/2)` is `x > 0`.
  smoke: 0, // 0–3, and the gate is what keeps the bottom step honest
  dry_air: 1, // °C below an 11 °C dew point: 10 °C is dry-ish, not drying
  humid_heat: 1, // °C above an 18 °C dew point, same reasoning on the other side
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
 * And the set is the mechanism itself, not a list about humidity: spec 28
 * puts a real indoor-relevant variable back in it. An empty set would be a
 * mechanism with nothing to point at, which is harder to find than a retired
 * name with a comment on it.
 */
export const INDOOR_PROXY_VARIABLES: ReadonlySet<string> = new Set(['humidity'])

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
 *    therefore compared like with like. The gas rows would not be — so2/co would be
 *    the hour itself against a 1-h or 24-h guideline, and a single bad hour can cross
 *    a 24-h number a real 24-h mean would not — but no vector carries a gas today, so
 *    that only becomes a live question on the day spec 20 admits them by region. The
 *    bias would be toward warning early, which is the right direction for a ceiling
 *    that only ever *raises* a prediction and is superseded by the user's own diary —
 *    but the numbers are not AQI categories, and nothing in the UI should claim they
 *    are.
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
