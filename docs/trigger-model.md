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
    "features": {                       // per-variable trailing-window features
      "pm25": { "now": 14.3, "max8h": 14.3 },          // µg/m³
      "o3":   { "now": 150.0, "max8h": 168.0 },        // µg/m³
      "pm10": { "now": 15.5, "max8h": 15.7 },          // µg/m³
      "no2":  { "now": 12.0, "max8h": 14.0 },          // µg/m³
      "heat_stress":     { "now": 1.2 },               // °C above 25
      "cold_dry_stress": { "now": 0.0 },               // °C below 10, gated on low humidity
      "humidity":        { "mean72h": 68.0 }           // %RH, multi-day (mold/dust-mite lag)
    }
  }
}
```

For inference, each variable `p` is reduced to one scalar `x_p` per entry, via a per-variable
window chosen to match its mechanism of action:

| Variable | v1 feature | Why |
|---|---|---|
| o3, no2 | `max(now, max8h)` | acute, acts over hours |
| pm25, pm10 | `max(now, max8h)` | v1 simplification; consider `mean24h` later |
| heat_stress, cold_dry_stress | `now` | felt immediately |
| humidity | `mean72h` | drives indoor mold/dust-mite load, which builds over days |
| pollen (per species) | `max24h` when measured; calendar prior otherwise | daily cycle, seasonal |

Window choices are an open tuning question; feature extraction is the only place they live.

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
C = { p : x_p > max(tol_p,L, negligible_p) }
```

`negligible_p` is a per-variable background floor (engine config): an exposure below it cannot be
a suspect even with no tolerance evidence — otherwise every bad day would implicate trace levels
of all six pollutants (o3 at 6 µg/m³ is background, not a candidate). Floors sit well below any
health-relevant level; they encode "measurably present," not "harmful."

- `|C| = 1` → **confirmed**: `θ_p,L ≤ x_p` for that pollutant. Clean attribution.
- `|C| > 1` → **ambiguous constraint** `(C, x, L)`: one or more of C, possibly synergistically,
  suffices at these exposures. Stored as-is; never forced into a single attribution.
- `|C| = 0` → **conflict**: every elevated pollutant was separately proven tolerable at these
  levels. Two kinds, distinguished by re-running the candidate test with only tolerance evidence
  *predating* the entry: if the set would have been non-empty (later evidence emptied it) the
  entry is **superseded** — sensitivity drifted, recency wins; if it was empty even then, the bad
  day was unexplainable when it happened → **unmodeled-trigger** (see the missing-variable
  detector below). See Conflicts.

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

Personal evidence only alarms at exposures **at or above** ones actually observed on bad days —
strictly, the threshold could sit anywhere in the untested gap below, but alarming on the whole
gap would make everything "potentially triggering" forever. The priors cover that gap: they stay
active in production (ceiling-only) even after personal evidence exists, so a novel-low exposure
still warns at population levels while the personal model stays silent.

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

**Cold start:** with an empty diary, predictions come entirely from prior thresholds (published
breakpoints — EPA AQI for PM and ozone, WHO guideline values for the other gases — seeded with the
v0 "Drew profile" sensitivities), all marked `prior`, contributing to ceiling only, never to floor.
Every diary entry replaces prior with person — concretely, a prior for (p, L) is **suppressed** at
exposures the user has personally tolerated below level L: rating a 2 while ozone sat at 168
refutes the population claim "potentially a 3 at 139" for any exposure up to 168.

**No max(), no composite score.** The 1–4 rating is the max of *predicted levels*, but levels are
grounded in per-pollutant/per-combination evidence — co-elevation is represented as a first-class
constraint rather than collapsed into one pollutant's sub-index. Whether a *novel* combination
(both pollutants slightly below their individually suspected exposures) deserves a synergy bump is
an open question; v1 does not extrapolate, it only matches evidence and priors.

## Beyond pollutants: weather and pollen are just more dimensions

The model is deliberately **variable-agnostic**: nothing above is specific to pollutants. Humidity,
heat, cold-dry air, and pollen species enter the exposure vector as additional dimensions, and
tolerance/causation/candidate-set/combo-repeat semantics apply unchanged. Costs and consequences:

- **Monotone encoding is mandatory.** The model assumes "more = worse," but temperature is
  U-shaped for asthma (heat stress *and* cold-dry bronchospasm). Non-monotone variables are split
  into one-sided stress features before inference: `heat_stress = max(0, T − 25°C)`,
  `cold_dry_stress = max(0, 10°C − T)` gated on low absolute humidity. The inference engine only
  ever sees monotone features; U-shapes are a feature-extraction concern.
- **The real cost is identifiability, not code.** Each added variable enlarges candidate sets on
  bad days, and disambiguation needs days where variables *decorrelate* — which nature may rarely
  supply (ozone forms photochemically on hot days, so heat and ozone travel together; humidity and
  mold season likewise). Attribution slows; prediction safety does not: a known-bad combination
  still matches via the ambiguous-constraint clause without attribution. You lose explanation
  speed, not conservatism. Keep the vector small and mechanistically plausible for the user rather
  than throwing every available signal in.
- **An empty candidate set is a missing-variable detector.** A bad day where every *modeled*
  variable is already proven tolerable can't be explained by the model — which is exactly the
  signature of an unmodeled trigger (pollen before pollen was added, an indoor exposure, illness).
  Surface it as: "None of the things I track explains today. Was it something else — pollen,
  being sick, indoor air?" Conflicts of this shape are the app's feature-discovery mechanism.
- **Indoor proxies are proxies.** Outdoor humidity drives indoor mold/dust-mite load only roughly
  (dehumidifiers, AC). v1 accepts outdoor RH with a long window; an indoor sensor source is the
  honest v2 upgrade.
- **Pollen data availability is regional.** Open-Meteo/CAMS serves per-species pollen for Europe
  only (verified: real values for Amsterdam, `null` for Hamden). US strategy: a calendar-region
  prior per species (e.g. CT ragweed ≈ Aug–Oct) acting like other priors — ceiling-only, never
  floor — with an upgrade path to a measured source (Google Pollen API, Ambee) as a user-keyed
  plugin. A calendar prior can make a season *suspected*; only measured data or diary
  disambiguation can confirm.

## Observation tags: the opposite of confounders

Confounders are reasons to *distrust* an entry, so inference excludes it. Observation tags record
something the user noticed that *sharpens* the entry — a within-day dose-response signal.

**`worse-outdoors`** (v1's only observation): symptoms tracked with being outside. Every entry
already implicitly blames outdoor air (the exposure vector is outdoor data); this tag makes the
implication explicit, so variables that proxy *indoor* exposure (`humidity`, the mold/dust-mite
proxy — see `INDOOR_PROXY_VARIABLES` in engine config) are removed from the entry's candidate
sets. On a muggy smoke day that can collapse {pm25, humidity} to a singleton confirmation.

Two consequences worth naming:

- **A worse-outdoors entry with only indoor proxies elevated yields an empty candidate set** —
  correctly flagged as an unmodeled *outdoor* trigger (pollen is the usual suspect). The
  missing-variable detector gets sharper, not noisier.
- **The sibling tag, `worse-indoors`, is deliberately withheld** until indoor air is measured
  better than by proxy: an observation tag that implicates a badly-measured variable invites
  false confidence. When it arrives, it should also replace the blunt "mostly indoors"
  confounder (which currently discards the entry) by re-aiming the entry at indoor-relevant
  variables instead.

Observation tags never affect tolerance extraction — a low rating proves every variable
tolerable at its exposure regardless of where the user spent the day.

## Conflicts and confounders

- **Confounded entries** (`confounders` non-empty) stay in the diary but are excluded from
  constraint extraction. When the recompute detects a conflict, the first remedy is to ask the
  user whether a confounder applies to one of the clashing entries.
- **Conflict** = an entry whose candidate set is empty, or a low-rating entry above a confirmed
  threshold. An empty candidate set should be read as a probable *unmodeled trigger* first (see
  the missing-variable detector above) and a contradiction second. Sensitivity also genuinely
  drifts (season, illness, fitness), so conflicts are expected occasionally. v1 policy: surface the two clashing entries in the UI and prefer **recency** —
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
| 6 | Rating 2 @ (pm25 30, o3 40) | Tolerance for levels 3–4: θ_p,3 > x_p ∀p. Forecast (pm25 30, o3 30) → ceiling 2, never 3; (pm25 28, o3 30) matches no evidence → [1,1] with priors off. |
| 7 | Confirmed θ_pm25,2 ≤ 12, then rating 1 @ (pm25 18) | Conflict flagged; recency wins: tolerance 18 stands, confirmation dropped from inference. |
| 8 | Rating 3 @ (pm25 25, o3 10), confounders ["sick"] | No constraints extracted; diary keeps the entry. |
| 9 | Rating 4 @ (pm25 40, o3 20) | Evidence cascades: constraints extracted for levels 2, 3, **and** 4 (a level-4 day also proves levels 2–3 were reached). |
| 10 | Rating 3 @ (pm25 4, o3 5, cold_dry 8) | U-shape via encoding: cold_dry_stress is the singleton candidate → confirmed. A hot day (heat_stress 6, cold_dry 0) predicts [1,1]; another cold-dry day predicts [3,3]. |
| 11 | Rating 1 @ (pm25 20, o3 100), then rating 3 @ (pm25 15, o3 80) | Empty candidate set → conflict flagged as probable **unmodeled trigger** (pollen? indoor?); no constraints forced onto modeled variables. |
| 12 | Rating 3 @ (o3 150, heat_stress 6) | Correlated pair stays ambiguous: o3-only → [1,3], heat-only → [1,3], but the repeat combo → [3,3]. Attribution waits for a hot-clean-air day; prediction doesn't. |
| 13 | Prior "o3 potentially 3 at 160"; rating 2 @ (o3 168) | Personal tolerance suppresses the prior: o3 165 → [1,2], not [1,3]. Above the tolerated exposure (o3 180) the prior reactivates → [2,3]. |
| 14 | Rating 3 @ (pm25 20, humidity 75) | Without observations: ambiguous, C = {pm25, humidity}. |
| 15 | Same entry + `worse-outdoors` | Humidity excluded → confirmed θ_pm25,3 ≤ 20. Humidity-only day predicts [1,1]. |
| 16 | Rating 3 @ (pm25 3, o3 10, humidity 80) + `worse-outdoors` | Empty candidate set → unmodeled *outdoor* trigger flagged (pollen?). |
