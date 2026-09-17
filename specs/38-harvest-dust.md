# Harvest dust — a source-and-wind signal, gated on the coarse fraction

**Status:** proposed · **Effort:** L · **Deps:** relay, [24-vector-diet.md](24-vector-diet.md) (pm_coarse and raw pm10), [25-smoke-variable.md](25-smoke-variable.md) (the fingerprint-gate pattern this mirrors), [28-mold.md](28-mold.md) (Alternaria/Cladosporium overlap), [32-dust.md](32-dust.md) (mineral dust, kept separate), [`research/harvest-sources.md`](../research/harvest-sources.md) · **Priority:** high — it tests the owner's own late-September hypothesis. Medium in general.

## Problem

Late September brings bad days that nothing the app tracks explains. The standing hypothesis is crop harvest: a field upwind gets cut, the air fills with coarse dust and fungal spores, and the wind carries it to the lungs. It is episodic and directional, and no ambient number sees it.

The mechanism is two things a harvest lofts together, both asthma-relevant, both carried downwind. The dust cloud is diseased-leaf fragments and grain dust, coarse and PM10-heavy. Grain dust alone drops mild asthmatics' FEV1 in a chamber (Sigurdarson 2004, `asthma-triggers-evidence.md`). Cutting also spikes Alternaria and Cladosporium at ground level: one study found agricultural-area maxima 47% and 458% over the urban rooftop (`harvest-sources.md`), the same two spore genera the mold work already centers on.

Nothing in the current vector captures it. CAMS dust (spec 32) is mineral desert dust and is blind to a cornfield. The dry-spore proxy (spec 28) counts the weather but not the field. A PM10 monitor would catch the coarse cloud, but harvest dust is coarse and local and monitors are sparse (spec 37). The particulate fingerprint is the inverse of smoke: PM10 up and fine fraction low, where smoke is PM2.5 up and fine fraction high.

## The signal class — source and wind

Some hazards are not a concentration on a grid. They are a fixed source plus a wind-and-distance band. Red-tide aerosol raises asthma admissions 44% within a mile of the shore and not at all inland (Kirkpatrick 2006, `asthma-triggers-evidence.md`). A harvest upwind is the same shape with a different source. The app has no way to say "you are downwind of a specific source today," and this spec builds that shape. Harvest is the first source. A harmful algal bloom is the obvious second, and it reuses everything here but the source feed.

## What the data gives us

Three inputs compose the signal, and only one is new to the app.

- **When — NASS Crop Progress.** The Quick Stats API returns the percent of a crop harvested, weekly, by state and by Agricultural Statistics District (ASD), in season. So "corn is 60% harvested in your district this week." It needs a free key. It is a weekly district percentage, not a field and not a day, and the signal inherits that resolution.
- **Where — the Cropland Data Layer.** A 30 m annual raster of which crop grows in each pixel, queried through NASS's CDLService. It is annual, so last year's layer stands in for this year's field pattern. Individual fields rotate corn and soy, but whether a cell is row-crop at all is stable.
- **Whether it reaches you — wind.** Already in the feed. Open-Meteo and NWS give hourly wind speed and bearing.

**Amended 2026-09-16 (live check against the keyed API, `harvest-sources.md`):** The New England narrative bulletin that carried Connecticut was discontinued in 2025 (the "current" PDF NASS serves is frozen at week ending 2025-05-25), but the machine-readable survey did not stop. Quick Stats returns `CORN, SILAGE - PROGRESS, MEASURED IN PCT HARVESTED` for CT, weekly and current: 30% for the week ending 2026-09-06 and 40% for 2026-09-13. So the owner's own location has a live, silage-specific harvest signal at state level, which is fine for a state this small. Two limits stand. It is state-level, not ASD, because CT is effectively one district. A non-program state gets a thin series — planted, emerged, silage-harvested, with no grain harvest or growth stages — so the signal reads what is there and falls back to a climatological harvest window from the CDL where a state has no harvested row at all. Reading a neighbor is worse than reading CT's own row: New York statewide silage was 6% on 2026-09-13, far behind CT, because NY is dominated by later northern dairy country.

## Design

1. **A composed `harvest` estimate, per coarse cell.** The relay answers `/v1/harvest?lat&lon` with an ordinal 0–3, the same shape as smoke. It is the product of three things: row-crop cropland sits in the upwind sector within a few kilometres (from the CDL), that crop is mid-harvest in the ASD this week (Crop Progress, active between roughly 15% and 85% cut), and the hour is dry with wind from the field toward the user above a calm threshold. Every value is `estimated`. Wind from a non-crop sector or a calm hour zeroes it.

2. **The CDL is baked, the progress is live.** Upwind cropland by direction is static for a year, so a build step precomputes it per coarse cell and a job refreshes it when a new annual CDL drops. The CDLService runs off a university server on a non-standard port and is historically flaky (`harvest-sources.md`), so it never sits on a live request path. The relay's live work is small: multiply the baked upwind-crop fractions by this week's ASD progress and this hour's wind. Crop Progress caches by (ASD, ISO week).

3. **Corroboration promotes it, the coarse fraction is the gate.** By default `harvest` is an estimated advisory and does not enter the exposure vector, the standing the calendar and the dry-spore proxy already have. On a day when the ground-level PM agrees — PM10 elevated and the fine fraction low — it enters the vector as a learnable variable, the inverse of the smoke gate in `ui/smoke.ts`. This mirrors spec 25, where a plume density enters only when the fine fraction confirms fine-mode particulate at head height. The fingerprint is flipped here because harvest dust is coarse.

4. **The spore bump.** The same cutting lofts coarse dust and spores, so a harvest upwind also raises the mold estimate. When the signal fires it bumps `dry_spore_index` (spec 28) for the hours the wind holds. Whether that bump is worth coupling the two signals is an open question below.

5. **Surface it as a source-and-wind advisory, not a pollutant row.** It is episodic and directional, so it does not belong in the constituent strip beside ozone. It shows as a chip or banner that names the source and the wind: "Harvest upwind — corn 60% cut in your district, wind from the fields, air is dry." Tapping it explains the mechanism. The diary captures a `near-harvest` observation the way it captures `near-traffic` (spec 35) and `worse-outdoors`, so the engine can read the day against it.

6. **Phase 1 is a script, not a feature.** `scripts/harvest-hypothesis.mjs` reads a diary export and tests the thesis before anything ships, the move `mold-hypothesis.mjs` already makes for mold. For each bad day the engine could not explain (an `unmodeled-trigger` conflict), it asks whether harvest was active in the ASD that week and the wind came from a row-crop sector. If the late-September unexplained days line up, the live feature earns its build. If they do not, the feature stops here and the script was the whole cost.

## Acceptance

- `scripts/harvest-hypothesis.mjs` reads a diary export, pulls historical Crop Progress by (ASD, week) and the CDL upwind composition for the diary's location, and prints each unexplained bad day as harvest-coincident or not, with the seasonal breakdown `mold-hypothesis.mjs` prints.
- The relay `/v1/harvest?lat&lon` returns `{harvest, cropsUpwind, pctHarvested, asOf}`, coordinates coarsened to ~11 km like every route, Crop Progress cached by (ASD, ISO week).
- Upwind cropland is a build artifact per coarse cell, refreshed when a new annual CDL is published. No live request calls the CDLService.
- `harvest` enters the exposure vector only when PM10 is elevated and the fine fraction is low. Otherwise it is an estimated advisory. A fixture covers both, shaped like the smoke fixture in `openMeteo.test.ts`.
- The signal is absent when the wind is calm or blows from a sector with no row-crop.
- `harvest` is `estimated` until a corroborating coarse-PM day, so it can suspect but never confirm a bound alone.

## Non-goals

- Field-level or daily harvest truth. NASS progress is a weekly ASD percentage and the signal says so.
- Treating harvest as a measured concentration. The only measured thing is the coarse PM it corroborates against.
- A general point-source engine. This builds harvest and the reusable source-and-wind shape; algae blooms are their own spec.
- Replacing spec 32's dust. Mineral desert dust and local ag dust are different sources on different feeds.
- Confirming a bound from the estimate. Only the corroborating coarse-PM day does engine work.

## Open questions

- **The spore bump.** Harvest lofts coarse dust and spores from one source. Model it as one `harvest` signal plus a bump to `dry_spore_index`, keep them fully separate, or fold harvest into the mold estimate and skip the coarse-dust variable? The spore spike is large and harvest-specific, which argues for its own signal, but the coupling to spec 28 is real. Leaning toward a coarse-dust variable plus a spore bump. WDYT?
- **Upwind geometry.** A wedge by wind bearing is the honest shape, but the CDL area query is a bounding box. Approximate the wedge with sampled points along the bearing, or accept a bbox and lose the directional sharpness? The bbox is simpler and over-counts crosswind fields.
- **ASD versus state.** Some commodities publish progress only at the state level. Fall back to state when the ASD row is missing, or drop the signal to nothing there?
- **Which crops.** Corn, soybean and wheat are the big fall-harvest coarse-dust producers. Start with those, or include cotton, sorghum and rice for the regions that grow them? Corn and soy cover the owner's likely exposure.
- **Whether it needs a live feature at all.** If the retro-test is weak, a static "harvest season, wind from the fields" note might be the whole honest v1, and the composed live signal waits for evidence.
