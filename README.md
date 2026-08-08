# breathing-index

A personal air quality PWA. Live at [breathingindex.com](https://breathingindex.com/).

## Why

I’ve always struggled to correlate the published air quality index with my personal ability to breathe. It’s no fun being gaslit by a “moderate” AQI of 70 that some days is fine to breathe and somedays is cripplingly bad. The AQI is doesn't take into account how the combination of pollutants affects breathing, but your lungs sure do! So this app helps you create your own BQI (Breathing Quality Index) by recording how you feel about your breathing alongside a vector of all available measures, helping you map how your lungs are affected by different pollutants like ozone, smoke, pollen, dust, mold, etc, many of which are lumped into broad-based categories by AQI that, again, your lungs don't consider whilst breathing.

Instead of a uselessly granular 1-500 AQI index, your BQI has four ratings:  
1. Easy -- choose this when you can take a carefree breath of fresh air and are enjoying life without thinking about your asthma  
2. Noticeable -- choose when you can notice something's off but can otherwise carry on with your plans, e.g. your mid-afternoon walk  
3. Limiting -- when you have to cut your walk short or use the peloton instead.  
4. Dangerous -- when you're worried about your ability to keep breathing.  

Each diary entry is a 1–4 rating plus the full exposure vector at log time. A good entry is tolerance evidence for everything in that entry's measured air; a bad entry with several elevated variables produces an ambiguous candidate set, which the model keeps as-is until later entries confirm one candidate or exonerate another. The full model, with worked examples, is in [docs/trigger-model.md](docs/trigger-model.md); product spec and milestones are in [SPEC.md](SPEC.md).

Official composite indices (US AQI, EU EAQI) are captured on each diary entry for possible later comparison, but never appear in the UI and are never used by inference.

## Stack

TypeScript, React, Vite, TanStack Router (file-based routes), vite-plugin-pwa. The inference engine is a pure module at `src/engine/` with no UI dependencies; its contract is the fixture suite at `tests/fixtures/trigger-cases.json` (16 cases, 39 assertions, run with vitest).

## Data sources

- **Open-Meteo** air quality + weather APIs — model data, no key required, worldwide.
- **AirNow** keyless widget endpoint — station measurements for comparison, US only, unofficial.

All fetching is client-side; there is no backend. The diary lives in `localStorage` — export and import are in Settings.

Temperatures display in °F for browsers whose locale resolves to a Fahrenheit region and °C everywhere else, overridable in Settings. Stored exposures are always metric, so the setting relabels the display and never rewrites diary history.

Analytics is Mixpanel, lazy-loaded, pseudonymous (a device ID, not an account) and content-free: events record that a screen was viewed or an entry saved, never what was rated, tagged, noted, or measured, and IP geolocation is off. Turn it off entirely in Settings. Fonts are self-hosted, so the app makes no third-party request for chrome either.

## Development

```sh
npm install
npm run dev     # local dev server
npm test        # breakpoint-derivation check + engine fixture suite (vitest)
npm run build   # vite build + typecheck
```

Deploys to GitHub Pages via Actions on every push to `main`. To redeploy without a new commit — or when an Actions incident swallows the push trigger — dispatch it manually:

```sh
gh workflow run deploy.yml
```
