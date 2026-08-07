# Specs

One file per idea from the 2026-08-07 adversarial review (source, copy, live-site walkthrough,
engine audit). Each spec: problem → design → acceptance. Statuses live in the files.

## Product integrity (do these first)

| # | Spec | Effort | One line |
|---|------|--------|----------|
| 04 | [Verified breakpoints](04-verified-breakpoints.md) | S | Ozone prior under-warns vs EPA (160 vs ~139 µg/m³) — hotfix today, then derive constants from primary sources in CI |
| 01 | [Data durability](01-data-durability.md) | S | `storage.persist()`, install/backup nudges, eviction detection, iOS-safe export — the diary must survive the platform |
| 02 | [Honest analytics](02-honest-analytics.md) | S | Ratings currently go to Mixpanel under a "never leaves this phone" promise; strip payloads, kill IP geo, add opt-out |
| 09 | [Medical framing](09-medical-disclaimer.md) | S | One canonical not-medical-advice sentence + rescue-plan clause on predicted 4s |
| 06 | [Location UX](06-location-ux.md) | S–M | Denied geolocation silently fakes Hamden and poisons the model; place search replaces lat/lon fields |
| 07 | [First-session UX](07-first-session-ux.md) | S | Saved-entry echo must survive reload; kill the "No diary yet" contradiction and the untrue "counts double" claim |
| 03 | [Engine robustness](03-engine-robustness.md) | L | Noise margins, k-repetition, symmetric recency, context-bound confirmations — stop treating single taps as permanent proofs |
| 05 | [Pollen](05-pollen.md) | M | The promised variable that never shipped; EU live data + US calendar prior, `estimated` provenance |
| 10 | [Freshness & offline logging](10-freshness-and-offline-logging.md) | M | Cached air is stamped fresh; failed fetches block logging entirely. Data-derived staleness + pending-exposure entries |
| 08 | [Scoreboard](08-scoreboard.md) | M | The receipts screen the whole pitch promises — officials vs you, plus the share card |
| 11 | [UI polish batch](11-ui-polish.md) | M | Smoke/Dust honesty, AQI-unit bridge, dark mode, 44px targets, screen-reader state, persisted dismissals |

## Monetization (no ads, in build order)

| # | Spec | Effort | One line |
|---|------|--------|----------|
| 16 | [Supporter tier](16-supporter-tier.md) | XS | Sponsors + Stripe link in Settings; validates that anyone pays at all |
| 12 | [Encrypted backup & sync](12-encrypted-sync.md) | L | The paid tier: E2E-encrypted sync, ~$15/yr, one small auditable Worker — monetizes the #1 gap |
| 14 | [Doctor-visit report](14-doctor-report.md) | M | Client-side printable report (scoreboard as centerpiece); pay-what-you-want, zero backend |
| 13 | [Forecast alerts](13-forecast-alerts.md) | L | "Tomorrow is a 3 — walk before 10" push/email; the retention loop, same Plus tier |
| 15 | [Premium sources](15-premium-sources.md) | M | Real US pollen + PurpleAir via proxied keys; BYO-key stays free |

## Growth

| # | Spec | Effort | One line |
|---|------|--------|----------|
| 17 | [Content pages](17-content-pages.md) | M | Three prerendered essays so the domain can rank for "AQI moderate but hard to breathe" |

## Dependency sketch

```
04 ──► 03 ──► 05 ──► 15
              │
01 ──► 12 ──► 13
02 ──┘  └──► (Plus tier shared)
08 ──► 14, 17
```

Everything in the first table is shippable independently except 03→05 ordering (pollen wants
the `estimated` evidence grade) and 04 before 03 (same file, five minutes, do it first).
