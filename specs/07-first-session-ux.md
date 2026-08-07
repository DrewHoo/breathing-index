# First-session & held-out UX — the first tap must feel counted

**Status:** proposed · **Effort:** S · **Deps:** none · **Priority:** high — retention at the moment it's decided

## Problem

The held-out-today statistics are sound; the presentation reads as rejection.

- Cold-start copy promises "Your first tap starts the learning — good days count double," then
  the screen still says "unpersonalized", "not you, yet", and — contradictorily — "No diary
  yet" (the Why block keys off the held-out model diary, which is empty when all entries are
  today's).
- "Good days count double" is an invented quantitative claim with no basis in the engine.
- After a reload, the saved-entry card vanishes entirely: `showCard` requires the in-session
  `justSaved` state (`src/routes/index.tsx:135`), so the spec'd echo ("You rated it noticeable ·
  logged 9:05 AM" + *log again*) never renders across sessions. A user who logged a **4 —
  Dangerous** in the morning reopens the app to a serene headline with no trace of their own
  emergency and no way to log again from the home screen.

## Design

1. **Persist the echo.** Derive the saved-card state from the diary itself, not `justSaved`:
   if `todaysSimilarEntries` is non-empty, render the saved card in its "echo" form — level
   pill, "logged 9:05 AM", chips still amendable, plus a **log again** button (sets
   `forceLog`). `justSaved` remains only as the freshest-entry pointer for undo (undo stays
   session-scoped; amending chips works any time).
2. **Fix the Why contradiction.** When the full diary is non-empty but the model diary is
   empty (all entries held out), the Why block reads: "Your first entries are from today, so
   they're held aside — today's rating can't grade itself. Tomorrow they start driving this
   forecast." Never render "No diary yet" when `diary.length > 0`.
3. **Honest first-tap payoff.** Replace "good days count double" with something true and
   equally motivating: "Easy days teach the most — they prove today's whole mix is fine for
   you." After the first save, the forecast section keeps "unpersonalized" but gains a
   one-line delta: "1 entry banked · starts counting tomorrow."
4. **Tomorrow's reward.** On the first day where held-out entries enter the model (first open
   of the next local day), the Why line acknowledges it once: "Now drawing on your 3 entries."
   Cheap, and it closes the loop the first-tap copy opened.
5. **Label honesty sweep** (same file, same PR): rename the "◌ no data" status chip to
   "◌ unrated" or "◌ no evidence yet" — it sits beside a live measurement and reads as a
   missing reading. The conditional legend in the section note becomes unconditional the first
   time any non-default chip appears.

## Acceptance

- Log, reload: saved card persists in echo form with *log again*; headline note explains the
  hold-out; no "No diary yet" anywhere.
- Log a 4, reload: the echo shows the 4 — a Dangerous rating is never invisible.
- Next local day: Why cites the entry count.
- No copy claims a mechanism the engine doesn't implement (audit strings against
  `docs/copy.md`, and reconcile the level-1 name — copy.md says "Excellent", labels.ts says
  "Easy"; pick one everywhere).
