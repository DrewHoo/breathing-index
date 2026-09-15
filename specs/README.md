# Specs

One file per idea from the 2026-08-07 adversarial review (source, copy, live-site walkthrough,
engine audit). Each spec: problem → design → acceptance. Statuses live in the files.

## Product integrity (do these first)

| # | Spec | Effort | One line |
|---|------|--------|----------|
| 04 | [Verified breakpoints](04-verified-breakpoints.md) | S | Ozone prior under-warns vs EPA (160 vs ~139 µg/m³) — hotfix today, then derive constants from primary sources in CI |
| 01 | [Data durability](01-data-durability.md) | S | `storage.persist()`, install/backup nudges, eviction detection, iOS-safe export — the diary must survive the platform |
| 02 | [Honest analytics](02-honest-analytics.md) | S | Ratings currently go to Mixpanel under a "never leaves this phone" promise; strip payloads, kill IP geo, add opt-out |
| 09 | [Medical framing, privacy & terms](09-medical-disclaimer.md) | S | One canonical not-medical-advice sentence, rescue-plan clause on predicted 4s, `/privacy` + `/terms` pages |
| 06 | [Location UX](06-location-ux.md) | S–M | Denied geolocation silently fakes Hamden and poisons the model; place search replaces lat/lon fields |
| 07 | [First-session UX](07-first-session-ux.md) | S | Saved-entry echo must survive reload; kill the "No diary yet" contradiction and the untrue "counts double" claim |
| 03 | [Engine robustness](03-engine-robustness.md) | L | Noise margins, k-repetition, symmetric recency, context-bound confirmations — stop treating single taps as permanent proofs |
| 05 | [Pollen](05-pollen.md) | M | The promised variable that never shipped; EU live data + US calendar prior, `estimated` provenance |
| 10 | [Freshness & offline logging](10-freshness-and-offline-logging.md) | M | Cached air is stamped fresh; failed fetches block logging entirely. Data-derived staleness + pending-exposure entries |
| 11 | [UI polish batch](11-ui-polish.md) | M | Smoke/Dust honesty, AQI-unit bridge + per-pollutant disagreement captions, dark mode, 44px targets, screen-reader state, persisted dismissals |

## Monetization (no ads, in build order)

| # | Spec | Effort | One line |
|---|------|--------|----------|
| 16 | [Supporter tier](16-supporter-tier.md) | XS | Sponsors + Stripe link in Settings; validates that anyone pays at all |
| 13 | [Forecast alerts](13-forecast-alerts.md) | L | "Tomorrow is a 3 — walk before 10" push/email; the retention loop, Plus tier |
| 15 | [Premium sources](15-premium-sources.md) | M | Real US pollen + PurpleAir via proxied keys; BYO-key stays free; historical backfill scores sources against the diary |
| 18 | [Measured pollen](18-measured-pollen.md) | M | Three pollen-type rows (0–5 index) via Google through the relay; calendar becomes the estimated fallback; delivers the pollen half of 15 |

## Deferred (per PR #1 review)

| # | Spec | Note |
|---|------|------|
| 08 | [Scoreboard](08-scoreboard.md) | Deferred indefinitely; official-index capture continues so it stays buildable |
| 12 | [Encrypted backup & sync](12-encrypted-sync.md) | Deferred pending Drew's feedback |
| 14 | [Doctor-visit report](14-doctor-report.md) | Deferred; premium (Plus) feature when revived |

## Growth

| # | Spec | Effort | One line |
|---|------|--------|----------|
| 17 | [Content pages](17-content-pages.md) | M | Three prerendered essays so the domain can rank for "AQI moderate but hard to breathe" |
| 19 | [Pollen content pages](19-pollen-content-pages.md) | M | The first content wave, reshaped: per-plant pages + the region×month calendar, generated from the app's own data |
| 36 | [Glossary pages](36-glossary-pages.md) | M | The one `/glossary` page becomes thirteen: an index and a page per thing in the air, so twelve questions can rank apart |

## Measurement and sources (September 2026 research)

Research in [`research/`](../research/). Order matters for the first three; the rest are independent.

| # | Spec | Effort | One line |
|---|------|--------|----------|
| 21 | [AirNow migration](21-airnow-migration.md) | S+M | The relay's two AirNow endpoints retire 2026-09-30; move to `aq/data/`, which returns concentrations, and make AirNow an engine source. Delete the dead PurpleAir route |
| 22 | [Exposure windows](22-exposure-windows.md) | S | One window per mechanism: ozone mean8h, PM2.5 mean24h, grass 3-day; a window change bumps the source so old bounds go inert |
| 23 | [Dew-point air](23-dew-point-air.md) | S | `dry_air` and `humid_heat` from dew point replace heat, cold-dry and the 72-h humidity proxy |
| 24 | [Vector diet](24-vector-diet.md) | S | PM10 display-only, NO₂ out, `near-traffic` chip in |
| 25 | [Smoke variable](25-smoke-variable.md) | M | NOAA HMS polygons via the relay, gated on the fine-fraction fingerprint, as a variable the engine can learn |
| 26 | [Sick as signal](26-sick-as-signal.md) | S | The `sick` chip writes `viral: 1` into the vector instead of discarding the day |
| 27 | [One ozone](27-one-ozone.md) | M | One ozone number, window on the label, station over model when a monitor is near |
| 28 | [Mold](28-mold.md) | L | Ingest any published spore count, station chosen by distance; a dry-spore weather proxy everywhere else |
| 29 | [Sulfur dioxide](29-sulfur-dioxide.md) | S | Admit SO₂ everywhere behind a 20 µg/m³ floor; a row only when present; measured from the monitor where one reports it |
| 30 | [Glossary](30-glossary.md) | M | One content module, a prerendered `/glossary`, and a `?` on every row that opens the same entry in a sheet |
| 31 | [Temperature swing](31-temperature-swing.md) | S | The day's range, graded only at the tail (RR 1.72 at P95); free, threshold-shaped, lagged |
| 32 | [Dust](32-dust.md) | S | Open-Meteo's dust column as a second attributed slice of particulate, behind a high floor; supersedes spec 20's Asia-only plan |
| 33 | [NWS alerts](33-nws-alerts.md) | S | Official warnings as a banner and diary metadata, never a variable |
| 34 | [Viral season](34-viral-season.md) | S/M | A ceiling-only calendar term around Labor Day + 17.7 days; NREVSS regional rhinovirus as phase 2 |
| 35 | [Traffic mixture](35-traffic-mixture.md) | S/L | Measured NO₂ from near-road monitors as the tracer; TEMPO satellite NO₂ as phase 2 |

## Dependency sketch

```
04 ──► 03 ──► 05 ──► 15
              │
01 ──► [12] ─► 13        [deferred: 08, 12, 14]
02 ──┘   └──► (Plus tier shared)

21 ──► 27
22 ──► 23 ──► 24 ──► 25
22 ──► 27
26, 28 independent (28 wants 23 for the humidity retirement)
21 ──► 29
29 ──► 30 (the glossary needs the final row list) ─► 36
29 ──► 31, 32, 35 (the floor argument and the absent line)
33, 34 independent; 30 wants all of them for entries
```

Everything in the first table is shippable independently except 03→05 ordering (pollen wants
the `estimated` evidence grade) and 04 before 03 (same file, five minutes, do it first).
