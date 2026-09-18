# OpenAQ v3 — the mechanics behind spec 38

Agent-compiled (Claude, September 2026), verified against the live OpenAPI spec at api.openaq.org/openapi.json and OpenAQ's own database seed files, with unauthenticated probes for error shapes. Feeds [specs/38-openaq.md](../specs/38-openaq.md).

Sources: [rate limits](https://docs.openaq.org/using-the-api/rate-limits) · [locations](https://docs.openaq.org/resources/locations) · [latest](https://docs.openaq.org/resources/latest) · [licenses](https://docs.openaq.org/resources/licenses) · [terms](https://docs.openaq.org/about/terms) · [measurands seed](https://github.com/openaq/openaq-db/blob/main/openaqdb/lookups/measurands.sql) · [licenses seed](https://github.com/openaq/openaq-db/blob/main/openaqdb/lookups/licenses.sql)

## Auth and limits

`X-API-Key` header, self-serve keys at explore.openaq.org/register. **60/min and 2,000/hour**, no documented daily or monthly cap, 429 on over-limit with `x-ratelimit-*` headers, and the docs warn that repeat offenders get banned. v1/v2 are HTTP 410 Gone — nothing v2-shaped survives.

## The call pattern, and the join

There is no one-call answer. `GET /v3/locations?coordinates={lat},{lon}&radius=25000&monitor=true&limit=1000` returns metadata — name, provider, coordinates, licenses, `sensors[]` with each sensor's parameter and units, `datetimeLast` — but no values. `GET /v3/locations/{id}/latest` returns values only: `{sensorsId, locationsId, value, datetime}` with **no parameter and no unit**. The consumer joins `sensorsId` back to the location's `sensors[].parameter`. So a cell costs 1 + N calls, N = stations read.

Other facts a parser needs: max radius is 25 km; results are **not** distance-sorted (sort on the `distance` field, meters, present when `coordinates` was passed); `coordinates` + `bbox` together is a 422; `/latest` is one row per **sensor**, so group on `locationsId`; the reference-grade filter is the query param `monitor=true`, read back as `isMonitor` (there is no `sensorType` in v3, and the embedded `instruments[]` carry only id and name); `limit` caps at 1,000 in code though the spec doesn't say so; `meta.found` can be a string like `">100"`; `coordinates`, `name`, `locality`, `licenses` are all nullable. `/latest` carries no data-quality flags, so a flagged-bad value passes through it unmarked.

## Units — the big gotcha

The same pollutant has a **different parameter id per unit** (the measurands table is unique on measurand + units): pm25 is id 2 (µg/m³ only), but o3 is 3 (µg/m³) / 10 (ppm) / 32 (ppb), so2 is 6 / 9 / 101, no2 is 5 / 7 / 15. Filtering on one id silently drops every provider using another unit. Normalize on `sensors[].parameter.units`, never the name — and note OpenAQ serves AirNow's gases in **ppm**, not the ppb AirNow itself serves, while the EEA serves µg/m³.

## Freshness

Every timestamp is `{utc, local}`. Ingest lag is ~10 minutes for live feeds, but the docs are explicit that `/latest` is "the last measurement value in the series," which can be arbitrarily old — a station dead since 2019 answers cheerfully. There is no staleness filter server-side; gate on `datetimeLast.utc` at the station and `datetime.utc` at the value.

## Licensing

Attribution is required twice: the original source (when its license asks) and "OpenAQ as your access point." Each location carries `licenses[]` with `{id, name, attribution: {name, url}}`; the permission booleans (`commercialUseAllowed`, `modificationAllowed`, `shareAlikeRequired`, `redistributionAllowed`) live on `/v3/licenses/{id}`. In the seed, everything permits redistribution and one license restricts: **id 37, ACT Government (Australia) — no commercial use, no modification**; drop it rather than reason about it. CC BY-SA 4.0 covers all EEA providers, so most of Europe is share-alike; displaying attributed readings is comfortably inside it, but whether a *derived* per-cell number is a derivative dataset is a question worth an email to info@openaq.org. No explicit stance on caching relays; the terms ask for exactly the request-reducing behavior a KV cell cache is.

## Coverage

141 countries, 15,300+ active locations, ~75% reference-grade (their 2025 Year in Data). The texture: **Europe strong** (every EEA country plus DEFRA, GIOS, and the big city networks); **Latin America decent** (SINCA, CETESB, SINAICA, Bogotá, Quito, Buenos Aires); Australia by state, Taiwan, Japan, Thailand, Hong Kong, Israel, Turkey, South Africa. **China is dead** (every source inactive, the ingest repos archived). **Canada is absent** (no NAPS ingest). The US embassy monitors went dark March 2025, taking the only government-grade source in 13 countries with them. **India moved to the low-cost-sensor pipeline**, so `monitor=true` may exclude it — verify with a key before promising India. And the US provider is literally AirNow's own data drops, so inside AirNow coverage OpenAQ is redundant by construction.

## Not verified

Live authenticated payload shapes (`distance` population, `meta.found` strings in practice), `isMonitor` for India's CPCB stations, the production license table beyond the 11-row seed, and OpenAQ's view on derived values under CC BY-SA. First calls with a key: `/v3/providers` for `datetimeLast` per provider, `/v3/licenses` for restriction flags beyond id 37.
