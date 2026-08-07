# Medical framing — one honest sentence, everywhere it matters

**Status:** proposed · **Effort:** S · **Deps:** none · **Priority:** high — asymmetric risk, nearly free

## Problem

SPEC.md's "No medical advice… not a clinical instrument" never made it into the product, while
the UI issues imperatives predicted from unverified priors on day one: "Outside is unsafe for
you. Stay in filtered air." / "The air isn't a factor. Do anything." (`src/ui/labels.ts`). A
cold-start "Do anything" to a severe asthmatic on a bad hyperlocal-sensor day is an
asymmetric-risk statement, and the absence of any disclaimer is also plain legal exposure for
a solo project.

## Design

1. **One canonical sentence,** written once, reused verbatim: "Breathing Index is a diary lens
   on public air data — not medical advice. Trust your symptoms and your asthma action plan
   over anything on this screen."
2. **Placement:** intro (small, above the CTA), Settings footer, and the `index.html` noscript/
   meta description. Not on Today — the home screen stays clean; the intro and settings are
   where trust is negotiated.
3. **Soften the imperative edge of level copy where it's cheap.** Keep the behavioral anchors
   (they're the product) but phrase as the user's own report, not the app's instruction, in
   *forecast* contexts: level definitions in the intro/diary describe what *you* had to do
   ("You'd change the plan"), and the forecast headline already says "possible" — audit that
   no forecast surface renders bare "Do anything." Cold-start forecasts additionally carry the
   existing "averages for sensitive lungs — not you, yet" line, which stays.
4. **The 4-level gets one extra clause** wherever it's *predicted* (not logged): "— if
   breathing feels dangerous, use your rescue plan and get help, whatever this app says."
   Rendered once, small, under the forecast when ceiling = 4.

## Acceptance

- The sentence appears in intro, Settings, and page metadata; grep finds exactly one source
  string.
- Forecast ceiling of 4 renders the rescue-plan clause.
- No forecast surface issues a bare imperative sourced from priors alone.
