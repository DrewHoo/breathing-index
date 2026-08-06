# breathing-index

A personal, tunable air quality monitor. A progressive web app that tells you — quickly, on your phone — **what's actually in the air right now, which pollutant is driving the badness, and what that means for *your* lungs**, instead of a single opaque composite number.

## Motivation

The composite AQI numbers published by governments hide the information that matters to sensitive individuals:

- In Amsterdam (Aug 2026), the Dutch LKI read **7–8 ("onvoldoende"/insufficient)** — sounds alarming — yet walking around was manageable for an asthmatic: lungs working harder, but functional.
- Back in Hamden, CT, the US AQI read **70 ("Moderate")** — sounds mild — yet breathing outdoors was genuinely difficult.

Two plausible explanations, both of which this app should make visible:

1. **Different constituents affect people differently.** The working hypothesis is that Hamden's air is loaded with **PM2.5 wildfire-smoke particulate**, which hits asthmatic airways much harder than the ozone or NO₂ that often drives European urban readings. The composite number is `max()` over pollutant sub-indices, so "AQI 70" tells you nothing about *which* pollutant got you there.
2. **The scales are not comparable and the labels are not calibrated to individuals.** US AQI 70 for PM2.5 corresponds to roughly ~20 µg/m³; the category label ("Moderate") is a population-level judgment, not a personal one. Meanwhile the averaging windows (NowCast, 24h means) lag reality — the air can be much worse *right now* than the published number.

The fix: show the raw constituent concentrations, name the driver, and compute a **personalized index** whose weights reflect the user's own sensitivities.

## Goals

1. **Answer "what's driving it?" in one glance.** Open the app → see per-pollutant concentrations (PM2.5, PM10, O₃, NO₂, SO₂, CO) for your current location, with the dominant pollutant called out explicitly ("PM2.5 is driving this — likely smoke").
2. **Personalized breathing index.** Compute a 0–100 personal score from per-pollutant sub-scores with user-tunable sensitivity weights. V1 ships with a hard-coded "Drew profile": PM2.5 weighted heavily (asthma + demonstrated smoke sensitivity), ozone moderate, others baseline.
3. **Tunable sources.** Let the user choose/compare data sources, because model data and station data disagree in interesting ways (see Data sources).
4. **Scale translation.** Show the same air in US AQI, EU EAQI, and Dutch LKI side by side, to demystify "7/11 insufficient" vs "70/500 moderate."
5. **PWA ergonomics.** Installable on a phone home screen, loads fast, works from geolocation, degrades gracefully offline (show last fetch + timestamp).

## Non-goals (v1)

- No backend, no accounts. Profile lives in `localStorage`. Static hosting on GitHub Pages.
- No push notifications (no server to send them; revisit later).
- No historical archive beyond what the APIs return (typically ~few days hourly).
- No medical advice. The personal index is a lens on data, not a clinical instrument.

## The personal index

Design principles:

- **Keep `max()` semantics, not a weighted sum.** The composite stays interpretable: the score *is* the worst adjusted pollutant, so "what's driving it" always has a crisp answer. A weighted sum would smear an acute PM2.5 spike across five calm pollutants.
- **Personalization = per-pollutant sensitivity multipliers** applied to concentration before the sub-index lookup. E.g. `pm25_sensitivity = 2.0` means 20 µg/m³ *feels like* 40 µg/m³ to this user, and the sub-index is computed from the effective concentration using standard EPA piecewise-linear breakpoints.
- **Sub-scores normalized 0–100** (mapping the EPA 0–500 curve onto a saner range for personal use), with plain-language bands calibrated to lived experience: "clear", "noticeable", "hard going", "stay inside". Part of the point of this project is iterating those band edges against how Drew actually feels on a given day.

```
personal_score = max_over_pollutants( subindex( concentration_p × sensitivity_p ) )
driver         = argmax of the same
```

V1 hard-coded profile (Drew, asthmatic, smoke-sensitive) — tune from real days:

| Pollutant | Sensitivity | Rationale |
|---|---|---|
| PM2.5 | 2.0 | asthma + observed symptoms at "Moderate" |
| PM10 | 1.25 | coarse particulate, less deep-lung penetration |
| O₃ | 1.5 | known asthma trigger, but tolerable in AMS |
| NO₂ | 1.0 | baseline |
| SO₂ | 1.0 | baseline |
| CO | 1.0 | baseline |

A settings screen exposes the multipliers as sliders so the profile stops being hard-coded the moment v1.1 exists.

**Verification note:** implementers must pull the current official breakpoint tables (EPA 2024 PM2.5 revision; EEA EAQI bands; RIVM LKI bands) from primary sources at build time — do not trust from-memory constants for the health-relevant math.

## Data sources (the "tunable" part)

| Source | Type | Auth | CORS/static-friendly | Notes |
|---|---|---|---|---|
| **Open-Meteo Air Quality API** | CAMS *model* data | none | ✅ yes | Default source. Free, no key, returns per-pollutant µg/m³ + US AQI + EU AQI, hourly, worldwide. Being model output, it can miss hyper-local smoke. |
| **AirNow API** (EPA) | Station measurements | free API key | key exposed client-side (acceptable: free tier, user-owned key) | Ground truth for US. User pastes their own key in settings → localStorage. |
| **PurpleAir** | Crowdsourced sensors | API key | ✅ with key header | Densest hyper-local coverage; famously reads high without correction (apply EPA conversion). Optional, user-keyed. |

Architecture treats sources as plugins behind one interface: `fetch(lat, lon) → { pollutant: {value, unit, time} }`. The UI can display sources side-by-side ("model says 18 µg/m³, nearest sensor says 34") — disagreement is itself signal that smoke is hyper-local.

## UX sketch

**Home screen (the one that matters):**
- Big personal score + plain-language band + trend arrow vs 3h ago.
- "Driven by: PM2.5 (34 µg/m³)" — the driver line, always present.
- Constituent strip: six small bars/dials, one per pollutant, colored by *personal* sub-score.
- Scale translation row: `US AQI 70 · EU EAQI 3 (Moderate) · NL LKI 6 (Matig)`.
- Location (geolocation w/ manual override) + data source + fetch timestamp.

**Detail screen:** 48h hourly sparkline per pollutant (past + CAMS forecast), so "should I walk now or at 7pm?" is answerable.

**Settings:** sensitivity sliders, source selection + API keys, saved locations.

Mobile-first; this is primarily a phone-on-the-sidewalk app. Desktop is the debug view.

## Architecture

- **Stack:** Vite + React, hand-rolled CSS per the drewhoover.com sibling-site conventions (system fonts, neutral palette + semantic data colors). D3 only if the sparklines need it.
- **PWA:** `vite-plugin-pwa` — manifest, icons, service worker with stale-while-revalidate for the app shell and network-first for API calls; cached last-good readings shown with a staleness banner when offline.
- **State:** profile + keys + saved locations in `localStorage`; current view state mirrored to the URL (shareable "look at Hamden right now" links) per the sibling-site URL-state pattern.
- **All fetching is client-side.** No build-time data baking — air quality data is only useful live.
- **Hosting:** GitHub Pages via Actions workflow, `base: '/breathing-index/'` in `vite.config.js`. **Repo is private for now**, which means no Pages deploy until it's flipped public (user-site routing at `drewhoover.com/<slug>/` requires a public repo). Local dev + phone-on-LAN testing until then.

## Milestones

1. **M1 — Data spike:** fetch Open-Meteo for Hamden, log per-pollutant readings, confirm/refute the PM2.5-smoke hypothesis with real numbers.
2. **M2 — Home screen:** personal score, driver line, constituent strip, scale translation. Hard-coded Drew profile. Deployable locally.
3. **M3 — PWA:** installable, offline last-known, geolocation.
4. **M4 — Tunability:** settings screen (sliders, sources, AirNow/PurpleAir keys).
5. **M5 — Public:** flip repo public, Pages deploy, OG/meta/favicon polish, register on drewhoover.com index.

## Open questions

- Should sensitivity multipliers scale concentration (current design) or scale the sub-index directly? Concentration-scaling interacts with the piecewise breakpoints in a defensible way (it answers "what would this feel like to a typical person"), but test both against felt experience.
- Is there a symptom-journal loop worth adding ("log how breathing feels right now") to calibrate the multipliers empirically? Probably the most interesting v2 feature.
- Smoke detection: can we label "PM2.5 is elevated *and* PM2.5/PM10 ratio is high ⇒ likely smoke" reliably? (Fine-to-coarse ratio is a common smoke fingerprint.)
- Do we want NowCast-style recency weighting on our own display, or always show the latest hourly value? (Latest-hour is more honest for "can I walk right now.")
