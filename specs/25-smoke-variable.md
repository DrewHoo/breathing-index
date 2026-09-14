# Smoke as its own variable — HMS polygons gated on the fine fraction

**Status:** built 2026-09-14 (branch `claude/spec-25-smoke-variable`); amended to what was built · **Effort:** M · **Deps:** relay; [24-vector-diet.md](24-vector-diet.md) (pm10 in `raw`) · **Priority:** high through the smoke seasons

## Problem

Smoke is a sub-label on the PM2.5 row. The engine never sees the split, so it can't learn "smoke PM2.5 gets me at 15 µg/m³, ordinary PM2.5 doesn't until 35." The research puts wildfire PM2.5 at 2–3× urban PM2.5 per µg for asthma ED visits (Wang 2025; the 10× that gets quoted is an artifact of range-to-range division). That's the kind of gap a per-variable bound captures.

Open-Meteo's `pm10_wildfires` was the obvious feed. I tested it for Hamden: 48 of 48 hours null. Europe only.

## Design

1. **Source: NOAA HMS smoke polygons.** USFS AirFire republishes them hourly as GeoJSON at `airfire-data-exports.s3.us-west-2.amazonaws.com/hms/v1/geojson/latest_smoke.geojson`. Verified live 2026-09-14: 114 features, `Density` codes 5 / 16 / 21 for Light / Medium / Heavy, `Start` and `End` as `YYYYDDD HHMM`. No key, no auth.

2. **Relay route `/v1/smoke?lat=&lon=`.** The worker fetches the GeoJSON (KV, TTL 1h, one key for everyone since the file is national), runs point-in-polygon for the coarse cell center, and returns `{ density: 0 | 1 | 2 | 3, start, end, fetched }`. The file is ~230 KB; ray casting is a few dozen lines. As built: the geometry is its own module, `worker/src/geo.ts`, free of Workers types so it unit-tests in plain node off the root vitest config, and it accepts `MultiPolygon` as well as the `Polygon` the live file is entirely made of. Plumes overlap, so a point's density is the *max* over every polygon containing it, and `start`/`end` come from that same winning polygon rather than from two. A file that does not parse answers density 0 with `stale: true` rather than an error status — the bucket serving something odd must not make every client retry a file that is fine for everyone else — while an upstream failure passes its status through uncached like the other routes. Two cache keys: `smoke:file:v1` for the file, `smoke:v1:{lat},{lon}` for the answer, so the common path never parses 230 KB at all.

3. **The variable is gated.** HMS is satellite column smoke. A plume aloft over clean surface air is flagged too. So:

   ```
   smoke = hms_density   if pm25 ≥ PRIORS.pm25[2]  and  pm25 / pm10 ≥ 0.85
         = 0             otherwise
   ```

   Both halves are the existing fingerprint in `src/ui/smoke.ts`, imported rather than restated. The gate turns "smoke somewhere overhead" into "smoke in the air you're breathing" without a surface smoke model.

   As built, the rule has a third outcome, and it is the one that took the thinking. "Otherwise" splits in two: a density whose gate *fails* is 0 — the satellite looked, and the air below the plume is not fine-mode — but a density whose gate cannot be *evaluated* is absent, because a variable recorded as 0 is tolerance evidence for a clean hour nobody measured. Unevaluable is a real state on a station series: AirNow publishes the NowCast first and the raw hourly behind it, so the current hour routinely has no raw PM at all. The gate therefore looks back up to two hours for an hour carrying both readings, and gives up after that rather than gating on stale air. An hour with no density, and every forecast hour, is absent on the same principle — HMS is a nowcast.

   The variable is deliberately **not** source-scoped. The density is a satellite product that reads the same whichever feed filled the PM columns, and the gate asks those columns a yes/no rather than putting their numbers in the vector.

   Coverage: the client asks only inside `inAirNowCoverage`. HMS's domain is wider — all of North America — but that box is the only North-America-shaped one the app has, it is already tested, and outside it the variable goes absent rather than recording a satellite's silence as a zero. The cost is named rather than hidden: Canada and Mexico are inside the analysis and outside the box.

4. **Engine config.** Floor 0 (Light is a suspect). Priors `{ 2: 1, 3: 2, 4: 3 }`: Light potentially a 2, Medium a 3, Heavy a 4. Heuristic start; the diary replaces it.

5. **Row.** "Smoke" with sub-label Light / Medium / Heavy, present only when `smoke > 0`. The PM2.5 row drops its "likely smoke" sub-label once this row exists. One claim in one place — and where HMS says nothing and the fingerprint still fires, the sub-label stays exactly as it was. As built the sub-label also names the instrument (`Light · satellite`) and, when the winning polygon's `end` is more than three hours old, says so (`· as of 11 AM`, on the *location's* clock): smoke detection needs daylight, so after dark the newest analysis is the afternoon's and a row that did not say so would be claiming a live reading. The row sits after the pollutants and before the pollen. On the log screen, the entry's exposure line lists `smoke` alongside the pollutants, and the evidence panel gains a `Smoke` row written `{n} of 3` — conditional rather than standing, on the panel's existing "once the diary holds a verdict" test: smoke's floor is 0 and most entries carry a 0, so a standing row would read "no evidence yet either way" forever. The test resolves to the right rule for free, because a 0 can neither be a suspect nor raise a tolerance — the row appears exactly when some entry was logged under a real plume.

6. **Sparkline.** HMS is a nowcast with no history in the file. The client keeps the trailing 48 h of `/v1/smoke` answers in localStorage, the same pattern as the pollen store in [22-exposure-windows.md](22-exposure-windows.md): `breathing-index.smokeHistory.v1`, per coarse cell, UTC hour key to density, 48 hours and 4 cells, every read and write in a try/catch. Only the current hour is ever written — a density filed against an hour it did not describe would be a reading the app invented. The sparkline draws `raw.hms_density`, the density *before* the gate, so the curve says "was there a plume" rather than "which hours had their PM posted yet".

7. **Not this spec:** HRRR-Smoke `MASSDEN`, the real surface smoke concentration at 3 km hourly. It's GRIB2 and painful in a worker. The gate above gets most of the value.

## Acceptance

- `/v1/smoke` returns density 0 for a point outside every polygon and the right code inside one (fixture: a small hand-built GeoJSON). ✅ `worker/src/geo.test.ts`, plus holes, `MultiPolygon`, overlapping plumes and the `YYYYDDD HHMM` conversion. Live against the local relay: Chicago Light, Arkansas Medium, Hamden none.
- HMS Medium overhead with PM2.5 at 8 µg/m³: no smoke row, no `smoke` in the vector. ✅ amended — `smoke` is 0 rather than absent, because the satellite did look. A 0 sits at the background floor, so there is no row and it can never be a suspect.
- HMS Medium overhead, PM2.5 at 20, fine fraction 0.9: `smoke: 2` in the vector, PM2.5 keeps its own value, and a bad day yields `{pm25, smoke}` ambiguous until a clean-air smoke day or a smoke-free PM day separates them. ✅ `openMeteo.test.ts` for the vector, `trigger-cases.json` for the candidate set and for the day that collapses it. One correction: only a smoke-free PM day can separate them in practice. The gate will not let a density into the vector below 9.1 µg/m³ of PM2.5, so a clean-air smoke day is not a thing anyone can log.

## Non-goals

HRRR-Smoke. Fire detections (FIRMS). Prescribed burns as distinct from wildfire.
