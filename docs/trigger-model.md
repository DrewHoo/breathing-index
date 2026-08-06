# Trigger model: learning what gets *you* from diary entries

The problem M1 exposed: on a co-elevation day (smoke-like PM2.5 **and** USG ozone), a symptom
report cannot be attributed to either pollutant alone. The model below represents that ambiguity
explicitly, instead of pretending a weighted score resolves it.

## Data model

**DiaryEntry** — the only thing the user creates. One tap plus optional annotations.

```jsonc
{
  "id": "e-2026-08-06-1930",
  "time": "2026-08-06T19:30:00-04:00",
  "rating": 3,                          // Breathing Index 1–4 (behavioral, see SPEC)
  "note": "walk cut short at the park",
  "confounders": [],                    // e.g. "sick", "allergies", "exercise", "indoors-all-day"
  "exposure": {                         // captured automatically when the entry is saved
    "source": "airnow",
    "location": { "lat": 41.396, "lon": -72.897 },
    "features": {                       // µg/m³; per-pollutant trailing-window features
      "pm25": { "now": 14.3, "max8h": 14.3 },
      "o3":   { "now": 150.0, "max8h": 168.0 },
      "pm10": { "now": 15.5, "max8h": 15.7 },
      "no2":  { "now": 12.0, "max8h": 14.0 }
    }
  }
}
```

For inference, each pollutant `p` is reduced to one scalar `x_p` per entry — v1: `max(now, max8h)`.
(The right window per pollutant — ozone acts on ~hours, PM2.5 accumulates over ~a day — is an open
tuning question; the feature extraction is the only place it lives.)

**Everything else is derived.** The trigger model is a pure function of the diary: recomputed from
scratch on every change, never incrementally mutated. This makes inference order-independent — a
clean day observed *next week* retroactively disambiguates an ambiguous entry from *last month* —
and means there is no stored state to corrupt or migrate.

## The unknowns

For each pollutant `p` and severity level `L ∈ {2,3,4}`, there is an unknown personal threshold:

> **θ_p,L** = the lowest exposure of `p` that *by itself* pushes this user to level ≥ L.

Monotone in both directions: more pollutant is never better (`x_p ≥ x'_p` can't lower the rating),
and `θ_p,2 ≤ θ_p,3 ≤ θ_p,4`. We never learn θ exactly — we learn *bounds* on it, and the width of
those bounds is the honest measure of how well the app knows the user.

## Constraints extracted from an entry

An entry with exposure vector `x` and rating `r` (not confounded) says two different things:

**Tolerance (∀ — unambiguous).** The user did *not* reach any level above `r`. Under monotonicity,
each pollutant alone is upper-bounded by the combined exposure, so for every pollutant `p` and
every level `L > r`:

```
θ_p,L > x_p
```

A rating-1 entry is therefore the most informative kind: it raises the "known tolerated" floor for
*all* pollutants at all levels. Good days are data. The app must make logging them frictionless.

**Causation (∃ — ambiguous).** If `r ≥ 2`, *something* elevated caused it, for each level `L ≤ r`:

```
∃ non-empty S ⊆ pollutants such that the exposures {x_p : p ∈ S} jointly suffice for level L
```

Define `tol_p,L = max x_p over all entries rated < L` (0 if none) — the exposure of `p` already
proven tolerable at level L. The **candidate set** for this entry at level L is:

```
C = { p : x_p > tol_p,L }        // pollutants not already exonerated at this exposure
```

- `|C| = 1` → **confirmed**: `θ_p,L ≤ x_p` for that pollutant. Clean attribution.
- `|C| > 1` → **ambiguous constraint** `(C, x, L)`: one or more of C, possibly synergistically,
  suffices at these exposures. Stored as-is; never forced into a single attribution.
- `|C| = 0` → **conflict**: every elevated pollutant was separately proven tolerable at these
  levels. See Conflicts.

Note the asymmetry Drew called out: **confirmation of one candidate never exonerates the others.**
A rating-3 on a PM2.5-only day proves PM2.5 is a trigger; it says nothing about ozone. Only a
tolerated (low-rating) exposure exonerates. There are therefore two distinct paths to
disambiguating an ambiguous entry, and both are passive — just keep logging:

1. **Direct confirmation** — a bad day when only one of the candidates is elevated.
2. **Exoneration** — a *fine* day when one candidate is at least as elevated as it was in the
   ambiguous entry; the recompute then collapses the old candidate set toward the other pollutant.

## Prediction (the point: tell the user their 1–4 ahead of time)

Given a forecast exposure vector `y`, evaluate levels from 4 down to 2:

- **Guaranteed ≥ L** if some confirmed threshold is met (`∃p: y_p ≥` confirmed bound for `θ_p,L`),
  **or** some ambiguous constraint `(C, x, L)` is *fully* matched (`y_p ≥ x_p` for every `p ∈ C`).
  The second clause matters: a repeat of a known-bad *combination* is predictable **without
  attribution**. You don't need to know whether it was the smoke or the ozone to know that
  smoke-plus-ozone at those levels wrecked you last time.
- **Potentially ≥ L** if any single member of any candidate set is matched (`∃(C,x,L), ∃p ∈ C:
  y_p ≥ x_p`). This is exactly the requested conservatism: until disambiguated, a day with *either*
  suspect pollutant at the observed exposure is treated as potentially triggering.

```
prediction = [floor, ceiling]
  floor   = highest guaranteed level (default 1)
  ceiling = highest potential level  (default floor)
```

Display the range honestly: **"2–3 — still learning whether ozone alone affects you."** A
single-number prediction is earned by disambiguation, not assumed. The gap between floor and
ceiling doubles as a data-collection prompt: the app can literally say *"today is an ozone-only
day — logging how you feel tonight would teach me a lot."* (High-information days are the ones
where candidate sets would collapse.)

**Cold start:** with an empty diary, predictions come entirely from prior thresholds (EPA
sensitive-group breakpoints, seeded with the v0 "Drew profile" sensitivities), all marked
`prior`, contributing to ceiling only, never to floor. Every diary entry replaces prior with
person.

**No max(), no composite score.** The 1–4 rating is the max of *predicted levels*, but levels are
grounded in per-pollutant/per-combination evidence — co-elevation is represented as a first-class
constraint rather than collapsed into one pollutant's sub-index. Whether a *novel* combination
(both pollutants slightly below their individually suspected exposures) deserves a synergy bump is
an open question; v1 does not extrapolate, it only matches evidence and priors.

## Conflicts and confounders

- **Confounded entries** (`confounders` non-empty) stay in the diary but are excluded from
  constraint extraction. When the recompute detects a conflict, the first remedy is to ask the
  user whether a confounder applies to one of the clashing entries.
- **Conflict** = an entry whose candidate set is empty, or a low-rating entry above a confirmed
  threshold. Sensitivity genuinely drifts (season, illness, fitness), so conflicts are expected
  occasionally. v1 policy: surface the two clashing entries in the UI and prefer **recency** —
  the older constraint is dropped from inference (never from the diary). Windowed/decayed
  inference is the v2 version of this.

## Test cases

Machine-readable fixtures live in `tests/fixtures/trigger-cases.json`; the inference engine (M3)
must pass them. Prose versions:

| # | Given (diary) | Expect |
|---|---|---|
| 1 | Empty diary | Prediction from priors only; ceiling-only, marked unpersonalized. |
| 2 | Rating 3 @ (pm25 20, o3 150) | Both suspected at level 3. pm25-only 20 → [1,3]; o3-only 150 → [1,3]. |
| 3 | Same as 2, forecast (pm25 20, o3 150) | Full combo match → [3,3]. Repeats are predictable without attribution. |
| 4 | Case 2 + rating 1 @ (pm25 4, o3 155) | o3 exonerated ≤155; old entry collapses to pm25: confirmed θ_pm25,3 ≤ 20. pm25-only 20 → [3,3]; o3-only 150 → [1,1]. |
| 5 | Case 2 + rating 3 @ (pm25 22, o3 6) | pm25 confirmed at level 3 — but o3 **stays** suspected: o3-only 150 → [1,3]. Confirmation ≠ exoneration. |
| 6 | Rating 2 @ (pm25 30, o3 40) | Tolerance for levels 3–4: θ_p,3 > x_p ∀p. Forecast (pm25 28, o3 30) → ceiling 2, never 3. |
| 7 | Confirmed θ_pm25,2 ≤ 12, then rating 1 @ (pm25 18) | Conflict flagged; recency wins: tolerance 18 stands, confirmation dropped from inference. |
| 8 | Rating 3 @ (pm25 25, o3 10), confounders ["sick"] | No constraints extracted; diary keeps the entry. |
| 9 | Rating 4 @ (pm25 40, o3 20) | Evidence cascades: constraints extracted for levels 2, 3, **and** 4 (a level-4 day also proves levels 2–3 were reached). |
