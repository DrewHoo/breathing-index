# Coverage map — where the air is measured, and where the number is a model

**Status:** in progress 2026-09-17 · **Effort:** L · **Deps:** relay, [`research/data-sources-catalog.md`](../research/data-sources-catalog.md), [`research/mold-sources.md`](../research/mold-sources.md), [18-measured-pollen.md](18-measured-pollen.md), [28-mold.md](28-mold.md), [05-pollen.md](05-pollen.md) · **Priority:** medium. It argues the app's premise more directly than any essay does.

## Problem

The app exists because the published number hides what matters. This is the page that shows why, on a map, for anyone who has never questioned where their pollen count comes from.

Two things are true at once and nothing on a weather screen tells them apart. PM2.5 and ozone are measured, at a US regulatory network of thousands of monitors, updated hourly. Pollen and mold are barely measured at all. The measured US pollen network is about 67 active NAB stations. The measured US mold network is 19 stations that reported in the last month (`research/mold-sources.md` §2). Every consumer pollen and mold number — Google, Pollen.com, the weather app — is a model built from land cover, phenology and weather, with no count anywhere near the user. The same allergy card shows a real ozone reading and a pollen index with nothing measured behind it, in the same card, in the same font.

So the map has two honest messages and it has to keep them apart. For criteria pollutants the gap is sparsity and smoothing. Real monitors exist, they thin out in rural counties, and the app shows a 45 km model even where a monitor is eight miles away (`data-sources-catalog.md`, Open-Meteo correction). For pollen and mold there is often no measurement in the state and the number is a model or a calendar. Flattening both into "it's all fake" would be the same overclaim the app was built to avoid.

The sharper form of the pollen claim is testable, and this spec tests it instead of asserting it. A season calendar, the month-by-region prior in `src/sources/pollenCalendar.ts`, is the model's real competition. If the model scores no better than the calendar against actual counts, the daily precision it displays is decoration. We have open measured feeds to score against, so we can show that with our own numbers rather than cite someone's paper.

## Design

### The map

One exposure variable selected at a time: PM2.5, PM10, ozone, NO₂, SO₂, CO, tree/grass/weed pollen broken to the plant (birch, oak, ragweed, graminales…), and mold. Each variable has its own station set, because the networks do not overlap. The monitor that reads ozone does not count ragweed.

Two layers per variable. The stations layer draws every real measurement site as a point, colored by freshness: reported in the last day, the last week, dormant. The reach layer is the heatmap — a proximity surface, hot where fresh stations cluster and cold everywhere the nearest real reading is fifty or two hundred miles off. Hot means a sensor is close. Cold means the number you see is interpolation or model.

A toggle sets the surface behind the dots. "What your app shows you" is a flat wash over every pixel, because that is what those apps do: they paint a value everywhere. The difference between the flat wash and the sparse dots is the argument the page is making.

Click or zoom to a location for the readout: what is actually measured within a given radius of this point, per variable. For a US ZIP that is PM2.5 from a monitor eight miles off (real), pollen from the nearest count two hundred miles off (model only), mold from nothing in the country's open feeds. It is the macro claim aimed at one person's town.

### The stations, harvested at build time

Station locations and freshness move slowly, so they are baked, not fetched per visitor. This is the same call the pollen tables and the glossary already make: reference data that changes weekly belongs in a build artifact, and only live air readings are barred from baking (`SPEC.md` architecture). A script writes one GeoJSON per variable under `public/coverage/`, a scheduled job refreshes them, and a test fails if a layer is empty or a point is missing coordinates or a freshness date.

Where the stations come from, by variable:

- **Criteria pollutants:** the keyless EPA ArcGIS AirNow FeatureServer for O3/PM2.5/PM10 points, EPA AQS for the full criteria set including NO₂/SO₂/CO, OpenAQ v3 for the same outside the US. These are dense, and their job on this map is contrast.
- **Pollen and mold:** the open publishers, not a bulk NAB pull (see licensing below). POLLnet Italy's WFS gives 58 stations with coordinates under CC-BY. The US self-publishers are enumerated with cities in `mold-sources.md` §3 — Houston, St. Louis, Kansas City, Canton, Oklahoma City, La Crosse, Atlanta, and the rest — roughly two dozen mappable points. Montevideo's CKAN feed, SAPNET's nine South African cities, and the European publishers in §4 fill more of it. The census in Buters 2018 (879 active stations, about half also counting fungal spores) is the count to cite for the regions we cannot map station by station.

The gaps are labeled as gaps, never as proof of absence. The research draws that line and the map holds it (`mold-sources.md` survey caveats). A region with no open feed is drawn empty and captioned "no public feed found," not "no stations."

### The backtest — the receipts

This is the part that earns the calendar claim. It is a script over open data, like `scripts/mold-hypothesis.mjs`, producing `public/coverage/backtest.json` that the page renders.

Ground truth is the open measured feeds that carry history: POLLnet Italy (WFS, CC-BY, daily, ~8-day lag), Houston (monthly XLSX archives), St. Louis County (numeric counts back to 1960 over a sequential archive), Montevideo (CKAN CSV, 2023 on). The model under test is Open-Meteo's CAMS pollen, which serves 92 past days keyless under CC-BY, and is the same phenology-and-weather class of model as Google's (`pollen-page-facts`: Google is a simulation with no station assimilation). The two baselines are the season calendar from `pollenCalendar.ts` and persistence, yesterday's count used as today's forecast.

The metric is a rank skill, not an error in µg/m³, because the units do not match on purpose. Google and CAMS report an index (UPI 0–5); the stations report grains or spores per cubic meter; the calendar reports a band. You cannot subtract those. You can compare order: on the station's own days, does the model rank the high days above the low days better than the calendar does. Spearman rank correlation against the measured series, plus a hit rate on the days the station called High, computed for the model and for both baselines, reported side by side. Skill is whether the model beats the calendar and beats persistence. If it ties them, the daily number carries no more information than the calendar.

Legible on the page, rigorous underneath. The reader sees a scatter of model index against measured count and one sentence ("the model called 41% of Milan's high-Alternaria days; the calendar called 38%"), while the JSON carries the correlations and the sample sizes.

Where the three-way runs and where it cannot:

- **Italy is the clean case.** Measured (POLLnet), an openly licensed model (CAMS via Open-Meteo covers Europe), and the calendar, all three over the same days. This is where "the model matches the calendar" gets its strongest number.
- **The US gets measured against calendar and persistence only.** There is no open US pollen model we can legally publish a backtest on. Google's Maps Platform terms forbid caching or redisplaying its values (`data-sources-catalog.md`), so its history cannot sit behind a public chart. The US finding is the swing itself: real counts jump week to week in a way no month-constant calendar and no 1 km surface is tracking.
- **Mold has no model anywhere.** No consumer source even carries the field (`mold-sources.md` §7). The comparison is measured against calendar and persistence, and the result is that there is nothing to test — the number some apps print is a climatology at best.

Criteria pollutants are the control. Run the same rank test on PM2.5 or ozone, where the model has real inputs and a dense monitor network to verify against, and it does fine. The control matters because it shows the test is fair: PM2.5 passes it and pollen does not, so the pollen result reads as a finding rather than a grudge against models.

### The page

`/coverage` is a prerendered document, like `/pollen` and `/glossary` — a real file under `public/`, matched by the SPA-exclusion patterns in `vite.config.ts`, not an app route the client renders cold. The prose thesis, the station counts, and the backtest headline are baked into the HTML so the page ranks and reads with JavaScript off. The map is a lazy-loaded island that hydrates after first paint, so its weight never blocks the argument.

The basemap has to be license-clean and visually neutral, not Google's tiles. Which one is an open question below.

### Licensing, kept straight

The brand is honesty, so the map cannot cut a corner the app would refuse.

- The AAAAI National Allergy Bureau runs the obvious pollen and mold directory, and its terms forbid use without written consent — the whole dataset, and arguably the station list (`mold-sources.md` §2 caveat). **Owner decision 2026-09-17:** map the individual NAB stations now — locations, names and freshness only, never counts — while the owner pursues written consent, and edit after if the answer narrows what we can show. The map credits the NAB by name and the provenance comment records the pending-consent state. The `MOLD_NAB_ENABLED` gate on ingesting their *readings* (spec 28) is untouched.
- No Google heatmap tiles. Each tile is billable and the terms forbid caching or redisplay (`data-sources-catalog.md`). The model surface is our own flat wash, drawn to represent "a value painted everywhere," not a screenshot of theirs.
- PurpleAir stays out, on the same license grounds the rest of the app keeps it out (spec 21, public repo). If consumer-sensor density is ever worth showing, AirGradient's keyless world endpoint is the clean source.
- Open-Meteo is CC-BY: one attribution line in the footer, as elsewhere.

## Acceptance

- `/coverage` renders the thesis, the per-variable station counts, and the backtest headline with JavaScript disabled. The map hydrates as a separate island and its bundle does not load until the map scrolls into view.
- Station layers are build artifacts under `public/coverage/`, one GeoJSON per variable, produced by a script and refreshed on a schedule. `npm test` fails if any layer is empty, or a point lacks lat, lon, or a freshness date.
- The pollen and mold layers carry the NAB stations as points with location, name and freshness only — no readings — credited to the NAB, with the pending-consent state recorded in the page's provenance comment (owner decision 2026-09-17).
- The backtest script pulls POLLnet and Open-Meteo past pollen for a set of Italian stations, computes rank correlation and high-day hit rate for the model, the calendar, and persistence, and writes `public/coverage/backtest.json`. `npm test` checks the schema and that both baselines are present for every station scored.
- The criteria control runs: the same metric on at least one criteria pollutant, over EPA/OpenAQ monitors, reported next to the pollen result.
- A location readout names the nearest fresh station distance per variable for a US point, and prints "model only" for pollen wherever the nearest count is past a set radius.
- No Google tiles load. No Google pollen history is stored. The Open-Meteo attribution is present.

## Non-goals

- Live per-visitor station fetches. Locations are baked; only live air readings are barred from baking, and these are not that.
- Ingesting or displaying NAB readings. The map carries station locations and freshness only; the data itself stays behind spec 28's consent gate.
- Any accuracy claim in µg/m³ or grains/m³. The units do not match and the backtest is ordinal skill only. An RMSE would be a lie about precision we do not have.
- A complete global station census. The harvest is best-effort from open feeds, and a region with no feed is a labeled gap, not a claim that nothing is measured there.
- Calling criteria pollutants unmeasured. They are the best-measured thing in the air, and the map says so.
- A routing or "cleanest path" feature. This is a page that makes one argument.

## Open questions

- **Phase order.** The cleanest backtest is European (POLLnet + CAMS), the home audience is American, and the US pollen story is coverage plus swing rather than a model score. Build the EU three-way first because it carries the strongest claim, or the US coverage layer first because that is who visits? Leaning EU-first for the backtest and US-first for the map, shipped together, but that is a sequencing call.
- ~~**Open the AAAAI consent conversation now?**~~ Resolved 2026-09-17: stations go on the map now, the owner opens the consent conversation in parallel (The Weather Company's commercial NAB license is the precedent to cite, `mold-sources.md` addendum), and we edit after if the answer requires it.
- ~~**Basemap.**~~ Resolved in implementation: hand-rolled SVG, projected at build time from Natural Earth / Census geometry (public domain, via the `world-atlas`/`us-atlas` packages as devDependencies). No tiles, no runtime map library, no attribution surprises, and the geometry ships inside the prerendered page so the map is there with JavaScript off.
- **Canada is close to a blank for pollen and mold on purpose.** The one real network (Aerobiology Research Labs, 31 stations) sells its data and publishes none (`mold-sources.md` §5). Draw the country empty with that explanation, which is itself the finding, or leave Canada out of v1 to avoid explaining a near-empty layer?
