# Smoke as its own variable — HMS polygons gated on the fine fraction

**Status:** proposed · **Effort:** M · **Deps:** relay; [24-vector-diet.md](24-vector-diet.md) (pm10 in `raw`) · **Priority:** high through the smoke seasons

## Problem

Smoke is a sub-label on the PM2.5 row. The engine never sees the split, so it can't learn "smoke PM2.5 gets me at 15 µg/m³, ordinary PM2.5 doesn't until 35." The research puts wildfire PM2.5 at 2–3× urban PM2.5 per µg for asthma ED visits (Wang 2025; the 10× that gets quoted is an artifact of range-to-range division). That's the kind of gap a per-variable bound captures.

Open-Meteo's `pm10_wildfires` was the obvious feed. I tested it for Hamden: 48 of 48 hours null. Europe only.

## Design

1. **Source: NOAA HMS smoke polygons.** USFS AirFire republishes them hourly as GeoJSON at `airfire-data-exports.s3.us-west-2.amazonaws.com/hms/v1/geojson/latest_smoke.geojson`. Verified live 2026-09-14: 114 features, `Density` codes 5 / 16 / 21 for Light / Medium / Heavy, `Start` and `End` as `YYYYDDD HHMM`. No key, no auth.

2. **Relay route `/v1/smoke?lat=&lon=`.** The worker fetches the GeoJSON (KV, TTL 1h, one key for everyone since the file is national), runs point-in-polygon for the coarse cell center, and returns `{ density: 0 | 1 | 2 | 3, start, end }`. The file is ~230 KB; ray casting is a few dozen lines.

3. **The variable is gated.** HMS is satellite column smoke. A plume aloft over clean surface air is flagged too. So:

   ```
   smoke = hms_density   if pm25 ≥ PRIORS.pm25[2]  and  pm25 / pm10 ≥ 0.85
         = 0             otherwise
   ```

   Both halves are the existing fingerprint in `src/ui/smoke.ts`. The gate turns "smoke somewhere overhead" into "smoke in the air you're breathing" without a surface smoke model.

4. **Engine config.** Floor 0 (Light is a suspect). Priors `{ 2: 1, 3: 2, 4: 3 }`: Light potentially a 2, Medium a 3, Heavy a 4. Heuristic start; the diary replaces it.

5. **Row.** "Smoke" with sub-label Light / Medium / Heavy, present only when `smoke > 0`. The PM2.5 row drops its "likely smoke" sub-label once this row exists. One claim in one place.

6. **Sparkline.** HMS is a nowcast with no history in the file. The client keeps the trailing 48 h of `/v1/smoke` answers in localStorage, the same pattern as the pollen store in [22-exposure-windows.md](22-exposure-windows.md).

7. **Not this spec:** HRRR-Smoke `MASSDEN`, the real surface smoke concentration at 3 km hourly. It's GRIB2 and painful in a worker. The gate above gets most of the value.

## Acceptance

- `/v1/smoke` returns density 0 for a point outside every polygon and the right code inside one (fixture: a small hand-built GeoJSON).
- HMS Medium overhead with PM2.5 at 8 µg/m³: no smoke row, no `smoke` in the vector.
- HMS Medium overhead, PM2.5 at 20, fine fraction 0.9: `smoke: 2` in the vector, PM2.5 keeps its own value, and a bad day yields `{pm25, smoke}` ambiguous until a clean-air smoke day or a smoke-free PM day separates them.

## Non-goals

HRRR-Smoke. Fire detections (FIRMS). Prescribed burns as distinct from wildfire.
