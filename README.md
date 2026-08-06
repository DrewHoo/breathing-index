# breathing-index

A personal air quality PWA. Live at [drewhoover.com/breathing-index](https://drewhoover.com/breathing-index/).

## Why

In Amsterdam the Dutch air index read 7–8, "insufficient," and my asthmatic lungs were fine; back home in Hamden the US AQI read 70, "Moderate," and I could barely breathe outside. The composite AQI is a `max()` over pollutant sub-indices with population-calibrated labels, so it can't tell you which pollutant is elevated or what that level means for you specifically.

## How it works

The app shows every exposure variable separately (pollutants, heat, humidity), marks each by what your own symptom diary establishes about it (confirmed trigger / suspected / tolerated), and predicts your day on a four-level behavioral scale: 1 Excellent, 2 Noticeable, 3 Limiting, 4 Dangerous.

Each diary entry is a 1–4 rating plus the full exposure vector at log time. A good day is tolerance evidence for everything in that day's air; a bad day with several elevated variables produces an ambiguous candidate set, which the model keeps as-is until later entries confirm one candidate or exonerate another. It never invents an attribution it hasn't earned. The full model, with worked examples, is in [docs/trigger-model.md](docs/trigger-model.md); product spec and milestones are in [SPEC.md](SPEC.md).

There's also a scoreboard view comparing the official composite indices (US AQI, EU EAQI, NL LKI) against your logged ratings. It's the only place they appear in the app.

## Stack

TypeScript, React, Vite, TanStack Router (file-based routes), vite-plugin-pwa. The inference engine is a pure module at `src/engine/` with no UI dependencies; its contract is the fixture suite at `tests/fixtures/trigger-cases.json` (16 cases, 39 assertions, run with vitest).

## Data sources

- **Open-Meteo** air quality + weather APIs — model data, no key required, worldwide.
- **AirNow** keyless widget endpoint — station measurements for comparison, US only, unofficial.

All fetching is client-side; there is no backend. The diary lives in `localStorage` — export and import are in Settings.

Analytics is Mixpanel, lazy-loaded and anonymous. Diary note text and coordinates are never sent.

## Development

```sh
npm install
npm run dev     # local dev server
npm test        # engine fixture suite (vitest)
npm run build   # vite build + typecheck
```

Deploys to GitHub Pages via Actions. Push triggers currently aren't firing on this repo, so dispatch manually:

```sh
gh workflow run deploy.yml
```
