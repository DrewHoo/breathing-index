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

1. **Show what's in the air, in one glance — without inventing a cause.** Open the app → see every exposure variable (pollutants, heat, humidity, pollen) for your current location, each marked by what the *diary evidence* says about it: confirmed trigger, suspected, tolerated, unknown. No "driven by" line — breathability depends on interactions between variables, and naming a single driver overstates what we know. Explanations cite evidence ("matches your Aug 6 bad day"), never mechanism.
2. **Personalized Breathing Index (1–4).** Predict, ahead of time, a four-level behavioral rating learned from the user's own symptom diary (see below). No 0–500, no 0–100: numeric scales are exactly the lie that motivated this project ("70 out of 500 can't be that bad").
3. **Tunable sources.** Let the user choose/compare data sources, because model data and station data disagree in interesting ways (see Data sources).
4. **Keep receipts on the official scales — off the home screen.** The composite indices (US AQI, EU EAQI, NL LKI) exist in the app only as a retrospective scoreboard: "officials said Moderate; you logged a 3." Their job is to demonstrate, against the user's own diary, how badly they predict the user's actual breathing — not to share top billing with the number that does.
5. **PWA ergonomics.** Installable on a phone home screen, loads fast, works from geolocation, degrades gracefully offline (show last fetch + timestamp).

## Non-goals (v1)

- No backend, no accounts. Profile lives in `localStorage`. Static hosting on GitHub Pages.
- No push notifications (no server to send them; revisit later).
- No historical archive beyond what the APIs return (typically ~few days hourly).
- No medical advice. The personal index is a lens on data, not a clinical instrument.

## The Breathing Index (1–4)

The personal scale is ordinal, four levels, each defined by **behavioral consequence** — what the
air makes you *do*, not where a needle points:

| BI | Label | Meaning |
|---|---|---|
| 1 | **Excellent** | The air isn't a factor. Do anything. |
| 2 | **Noticeable** | You'll feel it, but you can carry on as planned. |
| 3 | **Limiting** | Change the plan: shorter, slower, later, or elsewhere. |
| 4 | **Dangerous** | Outside is unsafe for you. Stay in filtered air. |

Why behavioral definitions: they make diary entries self-validating (you report what you actually
had to do, not a vibe), they make forecasts actionable ("tomorrow is a 3 — move your run to
morning"), and four levels with no midpoint force a lean. The scale is *per-user by construction*:
one person's PM2.5=20 day is a 1, another's is a 3, and the app's job is to learn which.

**The headline goal: tell the user their 1–4 ahead of time.** Prediction is shown as a range
("2–3") while the user's triggers are still ambiguous — a single number is earned by data, not
assumed.

## Learning triggers from the diary (no `max()`, no weights)

M1 killed the v0 design (sensitivity multipliers + `max()` over sub-indices): on a co-elevation
day — smoke-like PM2.5 *and* USG ozone at once — a composite of any kind either hides a trigger or
fakes an attribution. Instead the model represents ambiguity explicitly. Full design + worked
examples: **[docs/trigger-model.md](docs/trigger-model.md)**; test fixtures the M3 engine must
pass: `tests/fixtures/trigger-cases.json`. The short version:

- A **diary entry** = a 1–4 rating + the full exposure vector captured at log time. The vector is
  **not just pollutants**: heat stress, cold-dry stress, humidity (multi-day window, as an indoor
  mold/dust-mite proxy), and pollen enter as additional dimensions under the same semantics —
  non-monotone variables like temperature are split into one-sided stress features first.
- Per variable and level, the user has unknown thresholds; the model learns **bounds** on them.
- A *fine* day is unambiguous tolerance evidence for **every** pollutant (nothing triggered you).
  A *bad* day is an ambiguous constraint over its elevated pollutants — resolved only when later
  entries confirm one candidate (bad single-pollutant day) or exonerate one (fine day with that
  pollutant just as high). Until then, **every candidate is treated as potentially triggering**.
- A repeat of a known-bad *combination* is predictable even without attribution.
- Cold start: EPA sensitive-group breakpoints (seeded with an asthma-tilted profile) act as priors
  that only ever raise the prediction ceiling; personal data replaces them entry by entry.

**Verification note:** implementers must pull the current official breakpoint tables (EPA 2024 PM2.5 revision; EEA EAQI bands; RIVM LKI bands) from primary sources at build time — do not trust from-memory constants for the health-relevant math.

## Data sources (the "tunable" part)

| Source | Type | Auth | CORS/static-friendly | Notes |
|---|---|---|---|---|
| **Open-Meteo Air Quality API** | CAMS *model* data | none | ✅ yes | Default source. Free, no key, returns per-pollutant µg/m³ + US AQI + EU AQI, hourly, worldwide. Being model output, it can miss hyper-local smoke. |
| **AirNow API** (EPA) | Station measurements | free API key | key exposed client-side (acceptable: free tier, user-owned key) | Ground truth for US. User pastes their own key in settings → localStorage. |
| **PurpleAir** | Crowdsourced sensors | API key | ✅ with key header | Densest hyper-local coverage; famously reads high without correction (apply EPA conversion). Optional, user-keyed. |
| **Open-Meteo Weather API** | Model/observations | none | ✅ yes | Temperature, humidity, dew point — feeds the heat/cold-dry/humidity exposure variables. Free, global. |
| **Pollen** | CAMS model (EU) / calendar prior (US) | none | ✅ yes | Open-Meteo serves per-species pollen for **Europe only** (verified `null` for US). US fallback: calendar-region priors (e.g. CT ragweed ≈ Aug–Oct); upgrade path: Google Pollen API or Ambee as user-keyed plugins. |

Architecture treats sources as plugins behind one interface: `fetch(lat, lon) → { pollutant: {value, unit, time} }`. The UI can display sources side-by-side ("model says 18 µg/m³, nearest sensor says 34") — disagreement is itself signal that smoke is hyper-local.

## UX sketch

**Home screen (the one that matters):**
- Quick log at the top: the one-tap 1–4 row, shown only while today hasn't already answered for
  air like this (same local day, exposure vector within a quarter of each variable's level-2
  prior — `src/engine/similarity.ts`). Once it has, the card shows what the user said instead
  ("You rated it noticeable · logged 9:05 AM") with a *log again* escape hatch. Good days are the
  most informative entries, so the ask has to cost one tap; asking twice about the same air is
  nagging.
- Big predicted Breathing Index for right now — a single digit, or a range ("2–3") with a
  one-line reason ("still learning whether ozone alone affects you"). The entries the quick-log
  card is reporting are **held out** of the model behind it: today's rating is evidence for air
  exactly like today's, so leaving it in collapses the range onto the number the user just tapped
  and the screen quotes them back to themselves. Held out, the headline stays what the *rest* of
  the diary expects — and the gap between "you said 3" and "your other days say 1–2" is the
  learning signal, not a bug. Other days' evidence is untouched: yesterday's 3 in this same air
  still drives a firm 3.
- **Evidence line**, replacing any notion of a "driver": the prediction explained by the evidence
  it matched, phrased as observation, not cause. "Ozone is above a level that alone has been
  enough for a 3" / "PM2.5 + ozone together match your Aug 6 bad day" / "nothing you've reacted
  to before is elevated." The app never says *because* about anything it hasn't isolated.
- Constituent strip: one small bar per exposure variable, colored by that variable's personal
  evidence status (confirmed / suspected / tolerated / unknown at current exposure). This is
  where "what's elevated" lives — as facts, not attribution.
- Today's curve: predicted BI by hour ("walk before 10am").
- Location (geolocation w/ manual override) + data source + fetch timestamp.

Deliberately absent from the home screen: official composite indices (US AQI / EAQI / LKI — see
Goals; they live in a retrospective scoreboard view) and any "driven by" claim.

**Diary (the input that powers everything):** one-tap "how's breathing?" → 1–4 + optional
confounder tags (exclude the entry) and observation tags like "worse when outdoors" (sharpen
attribution — see docs/trigger-model.md); exposure vector captured automatically. The app prompts on high-information days
("today is ozone-only — logging tonight would teach me a lot").

**Detail screen:** 48h hourly sparkline per exposure variable (past + forecast), so "should I walk now or at 7pm?" is answerable.

**Scoreboard screen (the receipts):** retrospective comparison of official composite indices vs the user's logged BI — "twelve days officials called Moderate; you rated four of them a 3." The only place US AQI / EAQI / LKI appear.

**Settings:** source selection + API keys, saved locations, diary/conflict review, temperature
units (auto from the browser locale's region, or forced °C/°F — display only; stored exposures
stay metric).

Mobile-first; this is primarily a phone-on-the-sidewalk app. Desktop is the debug view.

## Architecture

- **Stack:** **TypeScript (strict) + Vite + React + TanStack Router with file-based routing** — a deliberate departure from the plain-JS sibling-site paradigm; this app has a real domain model (exposure vectors, constraints, predictions) that deserves types. The inference engine is a pure, UI-free typed module (`src/engine/`) whose only contract is the fixture suite. Routes: `/` home, `/detail`, `/diary`, `/scoreboard`, `/settings`. GitHub Pages needs the SPA 404-redirect shim (or hash history) for deep links under `/breathing-index/`.
- **Styling:** hand-rolled CSS per the drewhoover.com sibling-site conventions (system fonts, neutral palette + semantic data colors). D3 only if the sparklines need it.
- **PWA:** `vite-plugin-pwa` — manifest, icons, service worker with stale-while-revalidate for the app shell and network-first for API calls; cached last-good readings shown with a staleness banner when offline.
- **State:** profile + keys + saved locations in `localStorage`; current view state mirrored to the URL (shareable "look at Hamden right now" links) per the sibling-site URL-state pattern.
- **All fetching is client-side.** No build-time data baking — air quality data is only useful live.
- **Hosting:** GitHub Pages via Actions workflow, `base: '/breathing-index/'` in `vite.config.js`. **Repo is private for now**, which means no Pages deploy until it's flipped public (user-site routing at `drewhoover.com/<slug>/` requires a public repo). Local dev + phone-on-LAN testing until then.

## Milestones

1. **M1 — Data spike:** ✅ done ([findings](docs/m1-findings.md)) — confirmed smoke-like PM2.5 *plus* an ozone ramp the composite AQI hid; this killed the multiplier/`max()` design.
2. **M2 — Scaffold + home screen:** ✅ done — TypeScript/Vite/TanStack-Router app; inference engine (`src/engine/`) passing all fixtures; predicted BI (from priors), evidence line, constituent strip with evidence-status coloring, hourly curve, live Open-Meteo exposures. Detail-screen sparklines deferred to M3.
3. **M3 — Diary + trigger inference:** ✅ done — one-tap diary with confounder tags and automatic exposure + official-index capture; conflict cards (superseded / unmodeled-trigger) with tag-to-resolve; detail sparklines; scoreboard receipts; personal-tolerance-overrides-priors added to the engine (fixture 13).
4. **M4 — PWA:** ✅ done — vite-plugin-pwa (autoUpdate SW, manifest, generated icon set via `scripts/generate-icons.mjs`), NetworkFirst runtime caching for Open-Meteo, plus an app-level last-good localStorage fallback with staleness banner and re-derived current hour. Geolocation was in from M2.
5. **M5 — Tunability:** ✅ done — settings screen: saved locations (follow-me or fixed), AirNow measured-comparison toggle, diary export/import JSON. Home shows the AirNow measured strip (per-pollutant AQI + Action Day flag) via the keyless widget endpoint. PurpleAir (needs user API key) still planned.
6. **M6 — Public:** ✅ done (2026-08-06) — repo public, Pages deploying via Actions (SPA 404 fallback), OG/Twitter meta + share card + drewhoover.com chrome, live at https://drewhoover.com/breathing-index/, registered on the drewhoover.com index.

## Open questions

- **Exposure windows per variable:** ozone acts over hours, PM2.5 over a day, humidity→mold over days. v1 window table lives in [docs/trigger-model.md](docs/trigger-model.md); tune against diary data.
- **How many variables is too many?** Each added dimension slows attribution (bigger candidate sets, and correlated pairs like heat+ozone rarely decorrelate naturally). Keep the vector mechanistically plausible for the user; let empty-candidate-set conflicts drive additions.
- **Indoor air:** outdoor humidity is a rough proxy for indoor mold/dust-mite load. Indoor sensor as a v2 source plugin?
- **Synergy extrapolation:** a novel combination with both pollutants slightly *below* their individually suspected exposures — bump the prediction or not? v1 doesn't extrapolate; revisit once real co-elevation diary data exists.
- **Threshold drift:** sensitivity changes with season, illness, fitness. Recency-wins conflict handling is the v1 answer; time-decayed inference is the v2 answer.
- Smoke detection: can we label "PM2.5 is elevated *and* PM2.5/PM10 ratio is high ⇒ likely smoke" reliably? (M1: the fine-fraction fingerprint looked strong — 0.93 on a smoke day.)
- Do we want NowCast-style recency weighting on our own display, or always show the latest hourly value? (Latest-hour is more honest for "can I walk right now.")
