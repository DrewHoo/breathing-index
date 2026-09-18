# OpenAQ — reference monitors where AirNow ends

**Status:** building (branch `claude/spec-38-openaq`) · **Effort:** M · **Deps:** relay (shipped), [21-airnow-migration.md](21-airnow-migration.md) (the measured-strip pattern), [37-purpleair.md](37-purpleair.md) (the directory-and-reading KV shape), [research/openaq-v3.md](../research/openaq-v3.md) · **Priority:** medium — no current user needs it, but the coverage thesis does: outside the US the app is all model, and OpenAQ is the one free source of government-monitor concentrations there

## Problem

Inside AirNow coverage the app can put a real monitor beside the model. Everywhere else — all of Europe, Latin America, Australia — a user gets CAMS cells and nothing measured, which is exactly the gaslighting-by-model this app exists to check. OpenAQ aggregates government reference monitors in 141 countries, free, with raw concentrations and named stations: measured data with provenance, the shape the app wants. Its US feed is literally AirNow's own data drops, so it adds nothing inside AirNow coverage; its value is everywhere AirNow stops. China and Canada are holes ([research/openaq-v3.md](../research/openaq-v3.md), Coverage), and that is fine — absent stays absent.

Unlike PurpleAir, OpenAQ's licenses permit redistribution, so the relay may pass values through rather than deriving. What it must carry is attribution: the original provider's, where the license asks, and OpenAQ's as the access point.

## Design

1. **The relay serves the nearest stations' latest values: `GET /v1/openaq?lat=&lon=`.** Same coarse gate, same origin gate, `OPENAQ_API_KEY` absent → 403 (the spec-37 pattern). Response: up to three stations, each `{ name, provider, attribution, license, km, values: [{ variable, value, units, utc }] }`, plus `fetched`. Variables are the four the app tracks from monitors — pm25, pm10, o3, so2 — in the provider's own units; conversion lives in the client, where it has tests.

2. **Two KV layers, the spec-37 shape.** A *directory* per cell (`openaq:stations:v1:{lat},{lon}`, 7 days): one `/v3/locations?coordinates=&radius=25000&monitor=true` call, filtered to reference monitors that are not mobile, have coordinates, reported within the last 7 days, and don't carry a restricted license (the ACT's id 37 today; the drop list grows if `/v3/licenses` shows more). Nearest three by the `distance` field, each stored with its sensor→(variable, units) map so the reading phase joins locally — `/latest` rows carry a `sensorsId` and no parameter name. An *answer* per cell (`openaq:v1:{lat},{lon}`, 1 h): one `/latest` call per directory station, values older than 24 h dropped, newest per variable kept. A failed station is omitted rather than failing the cell. Budget: a cold cell costs 4 calls against a 2,000/hour limit; a warm one costs none.

3. **The client converts units and picks one station.** `src/sources/openaq.ts` parses `unknown` with guards and reduces to the fullest nearby station (most usable values, nearest on ties — the live Paris cell showed why: the nearest station carries only ozone, the one 800 m further both particle sizes): `{ station, attribution, license, km, time, values }` with everything in µg/m³ — the same 1.96 (o3) and 2.62 (so2) per-ppb constants airnow.ts uses, ×1000 first for ppm, particles µg/m³ passthrough only. One station rather than a blend, on spec 27's argument: one instrument the whole way across, named, is a claim a person can check. Null on every failure.

4. **Fetching is gated to where it adds anything: `!inAirNowCoverage(lat, lon)`.** Inside the box OpenAQ is AirNow re-served; outside it, `fetchOpenAq` joins the series fan-out like the other supplementary sources — null never takes the screen down — and hangs on the series as `series.openaq`. By construction it never coexists with an `airnow` series.

5. **Display is AirNow-style chips in "Measured nearby", with the attribution the license demands.** The strip (which already takes `purpleair` as a prop) gains `openaq`: chips per variable in µg/m³, the station named with its distance in km (these are non-US users; miles would be the wrong dialect), and a note crediting the provider and OpenAQ — "Measured at {station} — data from {attribution}, via OpenAQ." Settings' Sources section gains the matching row with the openaq.org link. `public/privacy.html` names `/v1/openaq` in the same commit.

6. **Comparison only in v1.** No exposure vector, no engine, no diary. The engine-source promotion — an `openaq:{station}` series the way `airnow` is one — is the real prize for a non-US user and a phase-2 spec of its own: it needs the 48 h window features, and OpenAQ prices history per *sensor* (`/v3/sensors/{id}/hours`), which is a different budget argument than one bbox call.

7. **Email info@openaq.org before leaning harder on this.** Attribution requirements are clear; whether a per-cell answer is a derivative dataset under the EEA providers' CC BY-SA is not, and OpenAQ has no published stance on caching relays. The ask costs a paragraph; the standing it buys is the same the NAB letter (spec 28 §1) and the PurpleAir inquiry (spec 37 §7) buy.

## Acceptance

- A European cell answers up to three named stations with fresh values in provider units; the second call inside the hour is a KV hit; values older than 24 h and stations silent for 7 days never appear.
- A cell with no reference monitor in 25 km answers `{ stations: [] }` and caches it; an unset key answers 403; restricted-license stations are absent from every response.
- Unit conversion has tests: µg/m³ passthrough, ppb and ppm branches for o3 and so2 with the shared constants, particles refusing gas units.
- A US user's series never fetches OpenAQ; a Paris user's home screen shows the chips with station name, distance in km, and the attribution note.
- privacy.html, the Settings row, and the strip attribution land in the same PR as the route.

## Out of scope (phase 2)

OpenAQ as an engine source abroad. History windows (`/sensors/{id}/hours` pricing). India, pending an `isMonitor` check on CPCB stations. Blending stations. NO₂ (spec 24 removed it; spec 35 is its way back in).
