# Doctor-visit report — the diary, shaped for a pulmonologist

**Status:** proposed · **Effort:** M · **Deps:** [08-scoreboard.md](08-scoreboard.md) (it's the centerpiece), [09-medical-disclaimer.md](09-medical-disclaimer.md) (framing) · **Priority:** third monetization; zero backend

## Why

"What have your symptoms been doing?" is the first question at every asthma appointment, and
patients reconstruct it from memory in the hallway. The app holds the actual answer. A
clean printable report is genuinely clinically useful, entirely client-side, and the most
natural pay-what-you-want moment in the product — the user is extracting concentrated value
at a moment tied to real-world care.

## Product shape

Free to preview watermarked; $5 one-time (or pay-what-you-want, min $2) per generated report
via Stripe Payment Link — no accounts, no backend, license check is an honor-system unlock
code in the redirect URL. Deliberately low-ceremony: the goal is a tip jar with a deliverable,
and data for whether a paid tier ([12](12-encrypted-sync.md)) has an audience.

## Design

1. **Content, one printable page (plus appendix):**
   - Header: date range, entry count, place(s); the medical-framing sentence from spec-09.
   - **Symptom summary:** distribution of 1–4 ratings by month; worst days listed with their
     dominant exposures.
   - **Trigger evidence table:** per variable — status (confirmed/suspected/tolerated/unknown),
     the bound, and the n behind it (post-spec-03 evidence grades), phrased as observation
     ("Limiting days occurred when PM2.5 ≥ 22 µg/m³, 3 occasions") — never mechanism.
   - **The receipts:** the spec-08 official-vs-you matrix — this is the chart clinicians
     haven't seen before and the reason the report gets shown around.
   - Appendix: raw entry log (date, rating, key exposures, tags; notes **excluded by default**
     with an include toggle — notes are the most personal field).
2. **Rendering:** client-side print stylesheet → browser print-to-PDF (no PDF lib; matches
   the no-backend rule). A dedicated `/report` route with `@media print` CSS; on-screen it's
   the preview.
3. **The report is a document, not a claim.** Every number traceable to diary entries; the
   footer states data sources (CAMS model, station comparisons) and their limits in one line.

## Acceptance

- 60-entry synthetic diary renders a one-page report + appendix that prints correctly from
  iOS Safari and Chrome (the two that matter).
- Notes absent unless toggled; no coordinates anywhere on the report.
- Unpaid preview watermarks; the Stripe link round-trip unlocks on the same device without a
  server.

## Open questions

- Real clinician feedback: show a draft to one pulmonologist before polishing — the table
  stakes ("what meds, what rescue-inhaler frequency?") may reshape it. If that conversation
  confirms it, rescue-inhaler-use logging (one extra chip on the quick-log card) would give
  the report — and the engine — the objective signal every asthma app anchors on; that's a
  future spec of its own.
