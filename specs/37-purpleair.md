# PurpleAir — hyperlocal PM2.5 as a measured comparison

**Status:** building (branch `claude/spec-37-purpleair`) · **Effort:** M · **Deps:** relay (shipped), [21-airnow-migration.md](21-airnow-migration.md) (deleted the old raw route), [research/purpleair-license.md](../research/purpleair-license.md) · **Priority:** high — Drew's nearest AirNow monitor is one town over and PM2.5 is the variable smoke events move fastest

## Problem

The PM2.5 the app runs on is either a 45 km CAMS cell or the New Haven monitor. PurpleAir has tens of thousands of outdoor sensors, often within a mile of the user, updating every two minutes. During a smoke event the nearest sensor sees the plume arrive before the monitor does and long before the model does. Spec 21 deleted the old `/v1/purpleair` route because it returned PurpleAir's raw payload, which their terms bar serving to third parties — not because sensor data is unusable. The license reading in [research/purpleair-license.md](../research/purpleair-license.md) says what a legal integration looks like: the relay serves a *derived* value, never raw rows, with attribution and their health-context notice on the surface that shows it.

Raw PurpleAir PM2.5 also reads high. EPA published a correction (Barkjohn et al. 2021, extended for smoke) fit against collocated monitors, using the sensor's own cf_1 value and its humidity reading; the Fire and Smoke Map applies it to every PurpleAir sensor it shows. We apply the same one.

## Design

1. **The relay serves one derived number per cell: `GET /v1/purpleair?lat=&lon=`.** Same coarse-coordinate gate, same origin gate. The response is `{ pm25, sensors, nearestKm, time, fetched }` — the EPA-corrected median across the cell's nearest outdoor sensors, how many sensors that is, how far the nearest one is, and the payload's own timestamp. No sensor indices, no per-sensor rows, no raw fields leave the relay. `pm25: null, sensors: 0` where the cell has no usable sensors — absent, never zero.

2. **Two KV layers, like smoke's file-and-answer split.** A *directory* per cell (`purpleair:sensors:v1:{lat},{lon}`, 7 days): the nearest 5 outdoor sensors with confidence ≥ 70 inside ±0.15°, found with one bbox query. Sensors don't move, so discovery is the expensive query made rarely. A *reading* per cell (`purpleair:v1:{lat},{lon}`, 1 h): one `show_only` query naming those sensor ids, three fields each. The math from [research/purpleair-license.md](../research/purpleair-license.md): discovery is ~205 points over an urban cell, the reading is ~15–25 points per cell-hour, so the once-granted million points lasts years per active cell instead of months. An empty directory is cached the full 7 days — a cell with no sensors costs one discovery a week and answers instantly.

3. **Correction happens in the worker, per sensor, before the median.** `worker/src/purpleair.ts` holds the pure parts — the Barkjohn piecewise correction (cf_1 and sensor RH in, µg/m³ out), sensor selection, the median — and is listed in the root tsconfig like `geo.ts`, so vitest covers it. A sensor missing cf_1 or humidity is skipped, not defaulted: the formula was fit to sensor RH, and a guessed RH is a guessed correction. The reading call passes `max_age=3600` so a sensor that stopped reporting yesterday isn't in today's median.

4. **The key is optional and gates the route.** `PURPLEAIR_API_KEY` absent → 403 `{"error":"purpleair disabled"}`, the NAB pattern. The client treats 403 like every other failure: null, no row, no error screen.

5. **The client rides the series, not a component.** `src/sources/purpleair.ts` fetches through the relay, parses `unknown` with guards (the boundary standard), and returns `PurpleAirReading | null` — null on every failure path, because a sensor network outage may not take the screen down. `fetchExposureSeries` adds it to the fan-out unconditionally (PurpleAir is worldwide; a sensorless cell costs one cached relay hit) and hangs it on the series as `series.purpleair`. Nothing else fetches it — `MeasuredStrip` receives it as a prop, which is the pattern the AirNow half of that strip should also move to (docs/code-standards.md, Requests §1–2).

6. **Display is one line in "Measured nearby", with the obligations attached.** `PM2.5 ≈ N µg/m³ · nearest sensors` beside the AirNow chips, present whenever the reading is. Attribution rides the strip's note ("Data from PurpleAir"); Settings' Sources section gains a PurpleAir row whose hint carries the link ("Powered by PurpleAir") and the §7.3 notice that PurpleAir does not warrant its data in health contexts. `public/privacy.html` names `/v1/purpleair` in the relay-routes sentence, same commit — the contract. It is a comparison in v1: it never enters the exposure vector, never reaches the engine, and entries do not record it.

7. **Before any revenue ships (specs/16), written notice goes to PurpleAir** (§4.3.c), and the "Data Licensing Inquiry" email described in the research doc goes out regardless — the staff-interpretation ground this stands on is a forum post, and ten dollars a year of points is worth pairing with a sentence of written permission.

## Acceptance

- The relay answers `/v1/purpleair` for a cell with sensors: corrected median, sensor count, nearest distance; `x-relay-cache: hit` on the second call inside the hour.
- A cell with no sensors answers `{ pm25: null, sensors: 0 }` and caches it; an unset key answers 403; raw PurpleAir fields appear nowhere in any response body.
- Correction math has its own tests: both branches of the piecewise formula, the skip-on-missing-RH rule, the median over an even count.
- The home screen shows the sensor line only when a reading exists; AirNow off and PurpleAir present still shows the strip; both absent, no strip.
- privacy.html, the Settings source row, and the strip attribution land in the same PR as the route.

## Out of scope (phase 2)

PurpleAir as an engine source (provenance, bounds scoped to a `purpleair` series the way `airnow` is). History backfill via their `/history` endpoints (different point costs, different argument). A Settings toggle — v1 has no per-user switch; the row appears where sensors are. AirGradient as a second sensor network (CC-BY-SA share-alike, and PurpleAir's §4.5 bars merging the two into one derivative anyway).
