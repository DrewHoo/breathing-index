# Pollen — the missing variable the docs already promised

**Status:** shipped (PR #11), then superseded in part by
[18-measured-pollen.md](18-measured-pollen.md) — measured data replaced the CAMS/calendar
split, three type rows replaced the single dominant-species row, and the grains/m³ species
variables retired; the calendar and the `estimated` evidence grade survive as the fallback
path exactly as designed here · **Effort:** M · **Deps:** engine unchanged (variables are data-driven); pairs well with [03-engine-robustness.md](03-engine-robustness.md) · **Priority:** high — core demographic

## Problem

The trigger-model doc spends sections on pollen, `config.ts` carries pollen priors and
negligible floors, and the conflict UI names pollen as the canonical missing suspect — but
`fetchExposureSeries` (`src/sources/openMeteo.ts`) never requests it, for any region. Most
asthmatics have an allergic component, and pollen co-travels with modeled variables (heat,
ozone, humidity), so pollen reactions don't even surface as clean `unmodeled-trigger`
conflicts — they build plausible-looking candidate sets over {o3, heat_stress, humidity} and
eventually false confirmations. Correlated omitted variable: the design's known-worst failure
mode, live, for the core demographic.

## Design

1. **Europe: live model data.** Open-Meteo air-quality API serves per-species pollen
   (grass/birch/ragweed/alder/mugwort/olive, grains/m³, CAMS) for Europe. Request the three
   species that already have priors; feed them through the standard window features (pollen
   acts within hours: `max(now, max8h)` is fine to start).
2. **US: calendar-region prior, clearly labeled.** Open-Meteo returns null for US pollen
   (verified in M1). v1 fallback per SPEC: a small static table keyed by climate region ×
   month → {species: low/med/high}, mapped to representative grains/m³ at the low edge of each
   band (conservative). The air-table row shows "calendar estimate" as its sub-label — it must
   never look like a measurement. An estimated variable **can seed candidate sets but never
   creates confirmed bounds on its own** (engine already distinguishes evidence quality after
   spec 03; tag the variable `estimated` in the entry).
3. **Upgrade path stays plugin-shaped:** Google Pollen API / Ambee as user-keyed or
   subscription sources later ([15-premium-sources.md](15-premium-sources.md)); same variable
   names, better data quietly replaces the calendar.
4. **UI:** one "Pollen" row (dominant species value + species name in the sub-label) rather
   than three rows; the diary "pollen" conflict tag stops being a dead end — tagging it on a
   conflict adds the calendar estimate for that day retroactively as `estimated`.

## Acceptance

- Amsterdam coordinates: pollen row appears with live grains/m³; a diary entry captures the
  pollen features.
- Hamden coordinates in August: pollen row shows ragweed calendar estimate labeled as such;
  entries record it tagged `estimated`; no confirmed pollen bound can arise from
  calendar-only data (fixture).
- Out-of-season US winter: row hidden or "negligible (calendar)".

## Open questions

- Region table granularity: state-level is probably enough for v1 (CT ragweed Aug–Oct etc.);
  county-level is a data-sourcing project, not a v1 blocker.
