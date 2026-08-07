# Personal forecast alerts — the retention loop and the premium feature are the same thing

**Status:** proposed · **Effort:** L · **Deps:** [12-encrypted-sync.md](12-encrypted-sync.md) (backend + account + tier), [03-engine-robustness.md](03-engine-robustness.md) (don't alert off a brittle model) · **Priority:** second monetization; biggest retention lever

## Problem

The app needs months of diary to pay off, and gives users zero reasons to open it during
those months. Meanwhile its single most actionable output — "tomorrow looks like a 3 for you;
walk before 10" — is exactly what people pay for and exactly what a static site can't send.

## Design

1. **The alert is the headline, personalized, one per day max.** Evening push/email: tomorrow's
   predicted level (or range) + the by-hour shape compressed to one clause ("worst 2–6 PM").
   Threshold is user-set: "alert me at Limiting or worse" default; "every morning" opt-in for
   the routine-lovers. No alert when nothing crosses the threshold — silence is the product
   working.
2. **High-information-day prompts (the SPEC's own idea, now deliverable):** when tomorrow is a
   rare decorrelation day for the user's ambiguous candidate set ("ozone-high, particles-low —
   a log tomorrow evening would settle a lot"), send at most one such prompt a week. This is
   the only mechanism that shortens the months-long learning period — it recruits the user
   into their own experiment.
3. **Mechanics.** Web Push (VAPID) from the same Cloudflare Worker; email (Resend/Postmark)
   as the fallback for iOS-Safari-non-installed users. The engine must run server-side for
   this: extract the already-pure `src/engine/` into a shared package the Worker imports —
   no rewrite, it has no UI deps by design. The user's model inputs (bounds, not raw diary)
   sync as part of the spec-12 encrypted blob; **prediction runs on decrypted-client-side
   bounds pushed as a compact opaque "alert profile"** — the server learns thresholds-per-
   variable (necessary for computing alerts) but never ratings, notes, or history. Document
   this honestly in the privacy copy: alerts require sharing your *sensitivity profile*, not
   your diary.
4. **Tier:** included in the same Plus tier as sync. Free users get the in-app by-hour curve
   as today, plus (cheap, no backend) an ICS "air outlook" calendar-feed experiment if demand
   appears.

## Acceptance

- Installed PWA, threshold Limiting: a forecast crossing 3 produces exactly one evening push;
  a clean week produces zero.
- Server store contains no ratings/notes/coordinates — only VAPID subscription, threshold,
  place, and the alert profile; deleting the account purges all of it.
- A high-information-day prompt fires only when the engine's ambiguous-set logic says the next
  day decorrelates it, capped weekly (fixture-tested server-side).

## Open questions

- Quiet-hours default (send 7–8 PM local?); DST handling per saved place.
- Whether the alert profile leaks health info by inference (thresholds imply sensitivity).
  It does, mildly — the mitigation is honest copy plus opt-in, not pretending otherwise.
