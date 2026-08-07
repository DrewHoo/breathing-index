# Verified breakpoints — fix the ozone prior, then make constants un-wrong-able

**Status:** proposed · **Effort:** S · **Deps:** none · **Priority:** highest — ships today, safety-relevant

## Problem

SPEC.md mandates deriving breakpoint constants from primary sources at build time; the TODO in
`src/engine/config.ts` admits that never happened, and the app is live. Audit result:

- **pm25 `{2: 9.1, 3: 35.5, 4: 55.5}` and pm10 `{55, 155, 255}` are correct** (2024 EPA revision).
- **o3 `{2: 100, 3: 160, 4: 200}` under-warns.** EPA 8-h ozone USG starts at 71 ppb ≈ **139
  µg/m³**; Unhealthy at 86 ppb ≈ **169 µg/m³**. A new asthmatic on a 150 µg/m³ day — squarely
  USG — sees "up to Noticeable". This is the one direction cold-start constants must not err.
- no2/so2/co rows are WHO-guideline-shaped, not EPA (conservative — harmless, but the "EPA
  sensitive-group breakpoints" claim in README is only true of the PM rows).
- Averaging-period mismatch: EPA PM breakpoints are 24-h means and ozone 8-h means, compared
  here against `max(now, max8h)` features — biased conservative for a ceiling, acceptable, but
  undocumented.

## Design

1. **Hotfix now:** o3 → `{2: 100, 3: 139, 4: 169}` µg/m³ (keep level-2 at 100, the WHO 8-h
   guideline, which is stricter than EPA Moderate and suits a sensitive-user ceiling).
2. **Provenance script:** `scripts/derive-breakpoints.mjs` holds the EPA table in ppm/ppb *as
   published*, plus the unit conversions (25 °C, 1013 hPa: o3 ×1.96, no2 ×1.88, so2 ×2.62,
   co ×1.145) and emits the µg/m³ constants block. `config.ts` imports nothing at runtime —
   the script writes/checks the constants and CI fails if `config.ts` drifts from the script's
   output. Each row carries a comment: source table, original units, conversion.
3. **Document the honesty tradeoffs** in the same file: instantaneous-vs-averaged comparison
   direction, and which rows are EPA vs WHO (label the source per row rather than claiming EPA
   globally; fix the README sentence to match).

## Acceptance

- `npm test` includes a check that `config.ts` constants equal the derivation script's output.
- A 150 µg/m³ ozone hour on a fresh profile forecasts a level-3 ceiling.
- README/copy no longer claim "EPA" for non-EPA rows.
