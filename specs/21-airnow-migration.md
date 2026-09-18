# AirNow migration — the relay's two endpoints retire this month

**Status:** built 2026-09-14 (branch `claude/spec-21-airnow-migration`); the design below is amended to what was built · **Effort:** S for the endpoint swap, M for AirNow as an engine source · **Deps:** relay (shipped) · **Priority:** urgent. AirNow retires `aq/observation/latLong/current/` and `aq/forecast/latLong/` in fall 2026. The September research put the date at 2026-09-30.

## Problem

`worker/src/index.ts` calls exactly the two endpoints on AirNow's retirement list. When they go, the measured strip goes dark and the Action Day banner with it.

Both endpoints only ever returned AQI points. That's why the strip needs `src/sources/aqi.ts` to walk points back to concentrations, and why AirNow never reached the engine.

## Design

1. **Observations move to `aq/data/`** (Observations by Monitoring Site). Parameters: `bbox` as `minLon,minLat,maxLon,maxLat`, `parameters=OZONE,PM25,PM10`, `datatype=B` (AQI and concentration both), `includerawconcentrations=1`, `verbose=1` (site name and coordinates), `startdate` / `enddate` as `YYYY-MM-DDTHH` UTC, `format=application/json`. It returns one row per monitor per hour with `RawConcentration`, `AQI`, `SiteName`, `Latitude`, `Longitude`. The relay builds the bbox from the coarse cell (±0.25°, about the current 50-mile radius) and asks for the trailing 24 hours in one call, so the client gets a series rather than a snapshot.

2. **The forecast moves to `aq/forecast/current/`.** That is the survivor the docs call "Current Forecasts By Reporting Area, Lat/Long, or Zip Code"; its path is behind the docs login and was found by probing (every other spelling 302s to the docs site). Its rows are camelCase (`reportingArea`, `actionDay`) where the retired one's were PascalCase. It exists only to carry `actionDay`. AirNow answers "no forecast issued" with HTTP 200 and `{WebServiceError: [...]}`, so the relay normalises both halves to arrays.

3. **AirNow becomes an exposure source, not just a strip.** With hourly concentrations the client builds the same window features it builds from CAMS ([22-exposure-windows.md](22-exposure-windows.md)) and labels the series `source: 'airnow'`. The engine already scopes bounds by source, so `src/engine/` doesn't change. The rule: when the nearest monitors inside the bbox reported pm25 and o3 in the trailing 24 hours, the series source is `airnow`; pm10 rides along when a monitor has it; no2 is absent (AirNow rarely measures it, and absent is unknown under the null discipline; [24-vector-diet.md](24-vector-diet.md) drops it anyway). Otherwise the series is `cams`. Learned bounds attach to one source per series.

   Forecast hours are the exception to "one source": AirNow has no hourly forecast and the home screen's curve needs one, so hours after now on an `airnow` series come from CAMS and carry `Hour.forecastSource: 'cams'`. Nothing is logged against them; a diary entry captures the current hour, which is measured. [27-one-ozone.md](27-one-ozone.md) draws the seam.

4. **Nearest monitor per parameter.** `verbose=1` gives site coordinates. Pick the nearest site for each parameter and carry `SiteName` in the series metadata so a row can name it.

5. **Concentrations, not bridged points.** The rows and the strip read `RawConcentration` directly. `aqi.ts` stays for the scoreboard. AirNow's ozone "current" AQI is a NowCast, a weighted multi-hour average; the raw hourly concentration is not, which is what a window we compute ourselves wants.

6. **The strip stops duplicating.** When `airnow` is the row source, the rows already name the site, so "Measured nearby" renders only on an Action Day, with the banner. When the rows run on CAMS, the strip keeps its current job.

7. **Cache.** Same KV pattern, key `airnow:v3:{lat},{lon}`, TTL 1h. `aq/data/` is capped at 500 requests per hour per key per service; the cache stays well under.

8. **Delete `/v1/purpleair`.** It has no client caller, and it returned PurpleAir's raw payload shape, which §4.7 of their terms bars serving to third parties. Remove the route and the secret. (The license claim this section shipped with — "forbids combining its data with open-source code" — overstated §4.5: PurpleAir staff read that clause as barring redistribution of the data, not open-source code calling the API, and repo visibility is irrelevant to it. The full reading, with the shape of a legal integration, is [research/purpleair-license.md](../research/purpleair-license.md); spec 37 builds it. AirGradient remains the keyless alternative — CC-BY-SA 4.0, so attribution plus share-alike on derived datasets, not obligation-free.)

9. **Backfill follows the same source policy.** `backfillPending` passes the AirNow setting to every history fetch, or a backfilled `cams` entry could be the newest recorded source and push the airnow bounds into `inert`. A pending hour older than the 48 h the monitors cover resolves to an `airnow` series with pm25 and o3 absent, which is correct: unknown air proves nothing.

10. **Coverage is a bounding box, not a country code.** `reverseGeocode` returns a label only. The contiguous US, Alaska, Hawaii and Puerto Rico as rectangles; a false positive over Tijuana costs one relay call that comes back empty.

11. **The row's number when the hour hasn't posted.** AirNow publishes the NowCast before the raw hourly, so the current hour's `RawConcentration` is usually −999. The row shows the window feature in that case rather than vanishing. [22-exposure-windows.md](22-exposure-windows.md) makes every row show its window feature anyway.

## Acceptance

- No request to a retired path. `npm test` parses an `aq/data/` payload from a real-shape fixture.
- In Hamden with AirNow on, the PM2.5 and ozone rows show the New Haven monitor's concentrations, the sub-label names the site, and new diary entries carry `source: 'airnow'`.
- With AirNow off, or outside the US, the rows run on CAMS exactly as today.
- The Action Day banner survives the forecast endpoint change. On an `airnow` series the strip is absent unless there is an Action Day.
- A pending entry backfilled while AirNow is on carries `source: 'airnow'`.
- `/v1/purpleair` returns 404 and `PURPLEAIR_API_KEY` is gone from `Env`.

## Non-goals

Historical backfill ([15-premium-sources.md](15-premium-sources.md) §6). `aq/data/` with a date range is the path when that's built.
