# Sick as a signal — one chip, no dates

**Status:** proposed · **Effort:** S · **Deps:** none · **Priority:** high

## Problem

`sick` is a confounder. The entry stays in the diary and leaves inference.

The research says a viral infection is a multiplier on allergen exposure, not an independent trigger. Virus alone is null (Green 2002: OR 1.67, interval crossing 1). Virus plus sensitization plus allergen exposure is OR 8–19 (Murray 2005 in children, Green in adults). So a sick day is the most informative day about allergen triggers the diary will get, and today it's thrown away.

The constraint: one tap logs a rating. Chips are optional. Nobody types an onset date.

## Design

1. **`sick` changes kind.** It moves from `kind: 'confounder'` to a new chip kind, `exposure`. Toggling it writes `viral: 1` into the entry's exposure vector; untoggling deletes the key (absent, not 0). Same chip, same tap, same place in `SAVED_CHIPS`.

2. **The engine doesn't change.** `viral` is a variable with floor 0 and prior `{ 2: 1 }`. A bad sick day with oak up yields `{viral, oak}` ambiguous. A fine sick day with oak down proves `viral` tolerated at 1. A repeat of sick-plus-oak floors on the combo clause without attribution. That is the interaction the literature describes, and the doc's combo-repeat rule already handles it.

3. `viral` is not source-scoped and not an indoor proxy. It survives a source switch.

4. **No separate confounder for other illness.** A stomach-bug day rated 1 is tolerance evidence like any other. Rated 3, it lands in a candidate set with whatever was elevated, and `viral: 1` is a fair reading of "sick" either way. Fewer chips.

5. **The conflict card's `sick` tag patches instead of filing.** `CONFLICT_TAGS` in `diary.tsx` currently adds a confounder. It should do what the pollen tag does: patch the entry with `viral: 1` so the day re-enters inference with the candidate it was missing. Same shape as `calendarPollenPatch`, with no calendar.

6. **Lag is a known gap.** Exacerbations land 1–3 days after cold onset and can outlast it. The chip records the day it's tapped. No carry-forward, no decay, no onset date. If the diary later shows sick days clustering the day before bad days, an engine-side rule can widen the window without touching the UI.

7. **Community prior, later.** NREVSS `rgnm-fkqb` publishes rhinovirus/enterovirus positivity weekly for the ten HHS regions, and the school-return peak sits at Labor Day + 17.7 days. Either could raise `viral`'s prior as a ceiling. Not this spec.

## Acceptance

- Tapping `sick` on a saved entry writes `exposure.viral = 1`; untapping deletes the key; the entry is never excluded from inference for it.
- Fixture: rating 3 at `{pollen_oak: 4, viral: 1}`, then rating 1 at `{pollen_oak: 4}` → oak tolerated at 4 and `viral` suspected-strong at level 3 with context `{pollen_oak: 4}`. Then rating 3 at `{pollen_oak: 4, viral: 1}` again → the combo floors at 3.
- Old entries with `sick` in `confounders` migrate on load: `viral: 1` added to `exposure`, `sick` removed from `confounders` (the `TAG_ALIASES` pattern in `diaryStorage.ts`).
- The diary renders the chip as "sick" wherever it rendered the confounder.

## Non-goals

Onset dates. Decay windows. Which virus. Wastewater.
