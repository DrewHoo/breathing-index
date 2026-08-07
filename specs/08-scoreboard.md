# Scoreboard — ship the receipts

**Status:** deferred indefinitely (Drew, PR #1 review) · **Effort:** M · **Deps:** none (official indices already captured per entry)

> Kept for the record; official-index capture on diary entries continues so this stays buildable
> whenever it's revived.

## Problem

The pitch is "stop being gaslit by Moderate," and the receipts screen — "twelve days officials
called Moderate; you rated four of them a 3" — is the payoff, the retention hook, and the
shareable artifact. SPEC.md marks it shipped in M3; it does not exist (`src/routes/` has no
scoreboard). Official indices are dutifully captured on every diary entry
(`entry.official`) and shown nowhere. This is also the only place official indices are
*allowed* to appear, per the product's own rules.

## Design

A fourth screen, reachable from the Diary header ("Receipts →") — not the tab bar (three tabs
is right).

1. **The headline claim, computed.** Group logged days by official US-AQI category at log time;
   within each, show the distribution of the user's ratings as a compact dot matrix. The lede
   sentence is generated: "Officials called 12 of your days *Moderate*. You rated 4 of them
   Limiting." Pick the single most damning divergence for the lede; the full matrix sits below.
2. **Divergence both ways.** Days officials over-called (Unhealthy but you rated 1) count too —
   the honest story is "the number doesn't track *you*", not "the number always under-warns."
3. **Minimum data gate.** Below ~8 rated days, the screen shows the frame plus "Log N more
   days to see how the official scale scores against your lungs" — an explicit retention
   carrot.
4. **Receipt card export.** One tap renders the headline claim as a share-card PNG in the
   existing share-card design language (client-side canvas/SVG — the repo already draws a share
   card at build time). No social SDK; just the image + `navigator.share`. This is the growth
   loop: each card carries the domain.
5. **Per-day receipts in the diary.** Each diary entry row gains a small official-index chip
   (e.g. "AQI 68 Moderate") — muted, never colored by the official scale's palette, per the
   design rule that official indices don't get top billing.

## Acceptance

- With a synthetic imported diary (build a fixture JSON), the matrix and lede render and agree
  with hand counts, including the over-called direction.
- Under 8 days: gate copy with correct remaining count.
- Share produces a PNG matching the app's card design, containing no location or note text.
- Official indices still appear nowhere on Today.

## Open questions

- EU users: same screen keyed on EAQI bands when US AQI is absent; pick per-entry whichever
  official index was captured.
