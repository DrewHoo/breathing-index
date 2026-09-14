# AirNow migration — the relay's two endpoints retire this month

**Status:** proposed · **Effort:** S for the endpoint swap, M for AirNow as an engine source · **Deps:** relay (shipped) · **Priority:** urgent. AirNow retires `aq/observation/latLong/current/` and `aq/forecast/latLong/` in fall 2026. The September research put the date at 2026-09-30.

## Problem

`worker/src/index.ts` calls exactly the two endpoints on AirNow's retirement list. When they go, the measured strip goes dark and the Action Day banner with it.

Both endpoints only ever returned AQI points. That's why the strip needs `src/sources/aqi.ts` to walk points back to concentrations, and why AirNow never reached the engine.

## Design

1. **Observations move to `aq/data/`** (Observations by Monitoring Site). Parameters: `bbox` as `minLon,minLat,maxLon,maxLat`, `parameters=OZONE,PM25,PM10`, `datatype=B` (AQI and concentration both), `includerawconcentrations=1`, `verbose=1` (site name and coordinates), `startdate` / `enddate` as `YYYY-MM-DDTHH` UTC, `format=application/json`. It returns one row per monitor per hour with `RawConcentration`, `AQI`, `SiteName`, `Latitude`, `Longitude`. The relay builds the bbox from the coarse cell (±0.25°, about the current 50-mile radius) and asks for the trailing 24 hours in one call, so the client gets a series rather than a snapshot.

2. **The forecast moves to the surviving reporting-area forecast service.** Its exact path is behind the docs login. It exists only to carry `ActionDay`.

3. **AirNow becomes an exposure source, not just a strip.** With hourly concentrations the client builds the same window features it builds from CAMS ([22-exposure-windows.md](22-exposure-windows.md)) and labels the series `source: 'airnow'`. The engine already scopes bounds by source, so `src/engine/` doesn't change. The rule: when a monitor inside the bbox reports every source-scoped variable the vector needs (pm25 and o3 after [24-vector-diet.md](24-vector-diet.md)), the series source is `airnow`. Otherwise it's `cams`. No mixing inside one series.

4. **Nearest monitor per parameter.** `verbose=1` gives site coordinates. Pick the nearest site for each parameter and carry `SiteName` in the series metadata so a row can name it.

5. **Concentrations, not bridged points.** The rows and the strip read `RawConcentration` directly. `aqi.ts` stays for the scoreboard. AirNow's ozone "current" AQI is a NowCast, a weighted multi-hour average; the raw hourly concentration is not, which is what a window we compute ourselves wants.

6. **The strip stops duplicating.** When `airnow` is the row source, "Measured nearby" shows only what the rows don't: the Action Day flag and the site name. When the rows run on CAMS, the strip keeps its current job.

7. **Cache.** Same KV pattern, key `airnow:v3:{lat},{lon}`, TTL 1h. `aq/data/` is capped at 500 requests per hour per key per service; the cache stays well under.

8. **Delete `/v1/purpleair`.** It has no client caller. PurpleAir's license forbids combining its data with open-source code, and this repo is public. Remove the route and the secret. If hyperlocal PM is ever wanted, AirGradient's public world endpoint is keyless and license-clean, with about a thousand online CONUS sensors.

## Acceptance

- No request to a retired path. `npm test` parses an `aq/data/` payload from a real-shape fixture.
- In Hamden with AirNow on, the PM2.5 and ozone rows show the New Haven monitor's concentrations, the sub-label names the site, and new diary entries carry `source: 'airnow'`.
- With AirNow off, or outside the US, the rows run on CAMS exactly as today.
- The Action Day banner survives the forecast endpoint change.
- `/v1/purpleair` returns 404 and `PURPLEAIR_API_KEY` is gone from `Env`.

## Non-goals

Historical backfill ([15-premium-sources.md](15-premium-sources.md) §6). `aq/data/` with a date range is the path when that's built.
