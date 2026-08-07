# Supporter tier — the stopgap tip jar

**Status:** proposed · **Effort:** XS · **Deps:** none · **Priority:** ship this week; expect little, costs nothing

## Why

Honest, zero-backend, and live in an afternoon. The ceiling is low — tip jars on niche tools
convert well under 1% — but it validates that *anyone* values the thing enough to pay, which
is the cheapest possible signal before investing in [12-encrypted-sync.md](12-encrypted-sync.md).
It also gives grateful users (this category produces them — people who finally feel believed
about "Moderate" days) somewhere to put that energy.

## Design

1. **GitHub Sponsors** (no fees, fits the open-repo ethos) as primary; a Stripe Payment Link
   as the no-GitHub-account alternative. No Ko-fi/Patreon — two links max.
2. **Placement:** Settings footer ("Built by one asthmatic in Hamden. If it helps you breathe
   easier → support it") and the README. Never on Today, never a modal, never a nag. One
   sentence, in the app's own voice.
3. **Acknowledgment:** none in-product (no supporter badges — that's account infrastructure
   this deliberately avoids). A thank-you line in the release notes is plenty.

## Acceptance

- Both links live and tested end-to-end with a real $1.
- The ask appears in exactly two places; no analytics event on the click beyond a bare
  `Support link tapped` (no amount, no destination — spec-02 rules apply).

## Sunset

When Plus ([12](12-encrypted-sync.md)) ships, the Settings line points there instead;
Sponsors stays for the people who want to give without wanting anything back.
