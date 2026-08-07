# Engine robustness — stop treating single observations as permanent proofs

**Status:** proposed · **Effort:** L · **Deps:** none (but do [04-verified-breakpoints.md](04-verified-breakpoints.md) first — it's the same file and five minutes) · **Priority:** high — correctness of the core claim

## Problem

The bounds-from-evidence design is sound, but v1 gives every observation the force of a logical
proof and makes every proof permanent. Four consequences, in order of damage:

1. **One unconfounded "fine" day exonerates everything, forever.** Tolerance is a never-decaying
   max over all low-rated entries (`src/engine/infer.ts`), and the exposure vector is *outdoor
   model air*, not what the user breathed. A rating-1 tapped after an indoor-AC day refutes the
   ozone prior at that day's level permanently — and good days are precisely the days nobody
   volunteers the "indoors all day" chip. Most people are indoors ~90% of the time; contaminated
   tolerance is the expected case, not noise.
2. **Recency wins in only one direction.** A newer fine day supersedes an older bad day, but a
   newer bad day *below* an old tolerance gets an empty candidate set, is labeled
   `unmodeled-trigger`, and contributes zero constraints. Ten consecutive rating-3 days below one
   stale good day teach the model nothing. Asthma worsening seasonally, post-virally, or
   progressively is the most likely real trajectory, and the engine structurally can't see it.
3. **Singleton confirmations assume zero synergy, then promise a floor.** When tolerance shrinks
   a bad day's candidates to one variable, the co-elevated background was still present. The
   engine records "PM2.5 alone ≥ 22 guarantees a 3"; the evidence only supports "PM2.5 ≥ 22
   *given that background*". Result: confident over-warning on clean days from n=1.
4. **Knife-edge comparisons on ±30–50% data.** Exact `≥` on CAMS model estimates and
   self-reported labels; a 19.9 vs 20.0 µg/m³ difference flips the forecast, and
   tolerance-vs-bad-day "contradictions" can be pure model error.

Secondary: suspect ceilings accrete forever (a rare smoke spike may never recur at ≥ its
original level, so its candidate set pins ceiling-3 permanently → alarm fatigue); negligible
floors admit near-universal background (humidity 55%RH-72h, co 300, heat_stress 0 ⇒ 25.1 °C)
so early candidate sets are bloated; missing data becomes exposure 0, excluding the real
trigger from candidacy.

## Design

The theme: **evidence gets weight, weight decays, and claims carry their context.**

1. **Noise margin ε per variable.** All threshold comparisons use a per-variable relative margin
   (start: 15% for model-sourced pollutants, 5% for temperature/humidity). Tolerance at x
   exonerates only up to x·(1−ε); a candidate needs exposure > max(tol, negligible)·(1+ε/2) to
   enter a set. Kills knife-edge flips and most spurious supersessions in one mechanism.
2. **k-repetition before hard claims.** A *confirmed* trigger bound requires the same variable
   to survive as the candidate on **2** independent bad days (or 1 bad day where it was the
   only variable above negligible — a genuinely clean singleton). Until then it is
   `suspected-strong`: drives the ceiling, never the floor. Symmetrically, a tolerance max set
   by a single entry is *provisional*; it suppresses priors only after a second low-rated entry
   within ε of that level.
3. **Symmetric recency: repeated contradictions re-open tolerance.** When **2** bad days arrive
   whose candidate sets were emptied by the same tolerance bound, drop that tolerance to just
   below the lower of the two bad-day exposures (with margin), re-run inference, and emit a
   `sensitivity-shift` conflict card ("Your recent bad days sit below air you handled fine in
   June — I've lowered what counts as proven-tolerable"). The old entries stay; only the
   derived bound moves. This is the v1 answer to threshold drift; time-decayed weighting stays
   a v2 question.
4. **Confirmations keep their context.** A confirmation extracted under co-exposure stores the
   background vector it was observed against. It acts as a floor only when current background is
   ≤ that context (per-variable, with margin); otherwise it acts as ceiling evidence. A
   confirmation from a genuinely-singleton day has empty context and behaves as today.
5. **Trim the candidate-set bloat.** Raise negligible floors to sit above routine background
   (humidity → 65 %RH-72h; co → 500; heat_stress epsilon so 25.1 °C isn't a candidate), and
   drop a variable from an entry — rather than recording 0 — when its window has no data.
   Either show so2/co in the air table or exclude them from evidence lines; never cite a
   variable the user can't see.
6. **Confidence surfaces to the UI.** `Prediction` gains an evidence grade per level:
   `prior | provisional (n=1) | confirmed (n≥2)`. The Why line already phrases evidence
   honestly; give it the vocabulary ("one day suggests…" vs "two separate days show…").

## Implementation notes

- All changes live in `src/engine/` + `tests/fixtures/trigger-cases.json`; the fixture suite is
  the contract, so **each rule above lands as fixtures first** (new cases: indoor-contaminated
  tolerance stays provisional; sensitivity-shift reopening; context-bound confirmation not
  firing as floor on clean background; ε swallowing a 5% supersession).
- Tighten the harness while in there: `expectConfirmed` should assert exactness (a regression
  that confirms extra variables currently passes), and conflict fixtures should assert kind,
  not just count.
- `Conflict` should carry both entry indices (the clashing pair), not one — the diary UI
  wants to show the two days side by side.
- Unify the confounder tag: UI writes `"indoors all day"`, doc says `"indoors-all-day"`. Pick
  one, migrate stored entries on load.

## Acceptance

- All existing fixtures pass or are consciously revised with a note in the fixture (`why`).
- New fixtures for rules 1–5 pass.
- Manual: a diary of one good day (tol pm25 20) + three later bad days at pm25 15 produces a
  lowered tolerance, a `sensitivity-shift` card, and a personalized ceiling-3 — not three
  discarded `unmodeled-trigger` conflicts.

## Open questions

- ε calibration: 15% is a guess; once AirNow comparison data accumulates, derive per-pollutant
  model-vs-station error empirically (the app already fetches both).
- Should `sensitivity-shift` also retroactively restore superseded confirmations? (Lean no for
  v1 — re-derive from scratch each run keeps the engine pure.)
