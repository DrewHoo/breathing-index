# Medical framing, privacy policy & terms — one honest sentence, everywhere it matters

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

5. **Privacy policy & terms pages** (added per PR #1 review). Two static prerendered pages,
   `/privacy` and `/terms`, linked from the Settings footer and intro small-print — same
   no-app-JS treatment as [17-content-pages.md](17-content-pages.md), same laconic voice; no
   legalese boilerplate longer than the app itself.
   - **Privacy** states what is actually true (post-[02](02-honest-analytics.md), which this
     depends on): diary lives in browser storage only; content-free usage pings to Mixpanel
     (list the exact properties) with an in-app opt-out; air data fetched directly from
     Open-Meteo/AirNow (they see your coordinates in the request, nothing else); no accounts,
     no sale of data, no cookies beyond storage. Update this page in the same PR as any
     future telemetry or backend change — it's a contract, not marketing.
   - **Terms**: informational-not-medical (the canonical sentence), no warranty, provided
     as-is, liability limited to the maximum extent permitted, data sources' accuracy not
     guaranteed, US-style disclaimer language kept to ~a screen. Note plainly that a lawyer
     hasn't reviewed it and Drew is one person — honesty is the brand here too.

## Acceptance

- The sentence appears in intro, Settings, and page metadata; grep finds exactly one source
  string.
- Forecast ceiling of 4 renders the rescue-plan clause.
- No forecast surface issues a bare imperative sourced from priors alone.
- `/privacy` and `/terms` return full HTML without JS, are linked from Settings and intro,
  and the privacy page's telemetry list matches the actual `track(` call sites (checked by
  hand in review, kept honest by the spec-02 audit rule).
