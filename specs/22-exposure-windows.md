# Exposure windows — one window per mechanism

**Status:** proposed · **Effort:** S · **Deps:** none; feature extraction lives only in `src/sources/openMeteo.ts` · **Priority:** high

## Problem

Every pollutant uses `windowMax(…, 8)`. The trigger-model doc calls that a v1 simplification. The September research says 8 hours fits ozone and nothing else. `config.ts` already notes that the PM priors are 24-hour means being compared against an 8-hour max.

The model data is also coarser than the app presents. Open-Meteo serves North America from the CAMS global run at 0.4° (~45 km), 3-hourly, refreshed every 12 hours, interpolated to hourly. I checked Hamden: the hourly values do vary hour to hour, so it is interpolated rather than repeated, but an 8-hour max over it has about three real samples in it.

## Design

| Variable | Today | New | Why |
|---|---|---|---|
| o3 | max8h | **mean8h** | The breakpoints are 8-h means. AirNow's ozone number is a NowCast of the same shape. The mechanism is dose over hours. |
| pm25 | max8h | **mean24h** | The breakpoints are 24-h means. ED-visit epidemiology is lag 0–2 days. |
| pm10 | max8h | mean24h | Display-only after [24-vector-diet.md](24-vector-diet.md). |
| no2 | max8h | dropped | [24-vector-diet.md](24-vector-diet.md). |
| dry_air, humid_heat | — | now | [23-dew-point-air.md](23-dew-point-air.md). Felt immediately. |
| grass pollen | day index | **max over trailing 3 days** | Erbas 2018 / Osborne 2017: the effect is cumulative, IRR 1.46 at a 3-day lag, threshold near a 3-day mean of ~70 grains/m³. |
| tree, weed pollen | day index | day index | No evidence for a longer window. |
| viral | — | the entry's flag | [26-sick-as-signal.md](26-sick-as-signal.md). |

I first left ozone on max8h because that's what the doc had and the M1 finding was about the composite hiding a ramp. But the ramp is on the sparkline either way, and max-of-hourlies against a mean prior over-warns by construction. So ozone goes to mean8h.

1. **Pollen history.** Google serves today forward, so a 3-day window needs the app to remember. The client keeps a per-day pollen map in localStorage keyed by coarse cell and date, written on every fetch; `pollenForHour` reads the trailing three days from it. The calendar stays the fallback for a missing day, tagged `estimated` as now.

2. **`past_days` stays at 3.** mean24h needs 24 hours. Open-Meteo allows up to 92, which is what [15-premium-sources.md](15-premium-sources.md) §6 wants for backfill.

3. **A window change is a source change.** Bounds are learned against features, and a new window makes old bounds mean something else. The engine can't version per variable and doesn't need to. Bump `EXPOSURE_SOURCE` from `cams` to `cams-w2`. The old cams bound set goes inert exactly as a source switch does. The diary is a month old, so the cost is small. The `airnow` source from [21-airnow-migration.md](21-airnow-migration.md) starts on the new windows from its first entry.

4. **Tree pollen priors warn later.** All plants share `{2: 3, 3: 4, 4: 5}` today. Population evidence for tree pollen and asthma is weak (London tree models inconclusive; Cupressaceae associated with fewer ED visits in Atlanta). Tree plants drop the level-2 row: `{3: 4, 4: 5}`. Grass and weeds keep theirs. Every plant stays a candidate; only the prior changes.

5. **A row's number and its verdict are the same quantity.** Today the ozone row shows the hour and grades the 8-h max. After this spec each row shows its window feature and the sub-label names the window ("8-h", "24-h", "3-day"). The sparkline keeps the hourly `raw` values so a spike stays visible. [27-one-ozone.md](27-one-ozone.md) owns the ozone row.

## Acceptance

- `openMeteo.test.ts` covers each window on a synthetic series, including gaps (a gap yields absent, never 0).
- Entries logged after the change carry `source: 'cams-w2'`; the earlier bounds appear under `model.inert`.
- A grass series where only day −2 was high still grades grass at that value today.
- Fixture 13 (prior suppression) passes with the ozone prior compared against `mean8h`.
- A tree plant at index 3 raises no prior; at 4 it raises a level-3 ceiling.

## Non-goals

Two features per pollutant. A 3-hour spike feature for PM2.5 was considered and dropped: it co-moves with the mean and inflates candidate sets.
