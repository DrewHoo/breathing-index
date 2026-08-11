# Pollen content pages — the search wedge spec 17 was waiting for

**Status:** proposed · **Effort:** M · **Deps:** [18-measured-pollen.md](18-measured-pollen.md)
(the plant catalog and season calendar are the content's data), prerender pattern from
`/privacy` + `/terms` · **Relation to 17:** the first wave of
[17-content-pages.md](17-content-pages.md), reshaped — pollen replaces the general essays as
the opening wedge because it is where the app owns original data and a differentiated angle

## Problem

The domain has nothing for a search engine to read except the homepage's meta and a noscript
paragraph. Meanwhile the app now holds two genuinely original assets nobody surfaces to
crawlers: a region × month season calendar (`src/sources/pollenCalendar.ts`) and a per-plant
attribution story ("birch and not oak") that no pollen site leads with. Pollen-intent
searches — the app's core demographic mid-crisis — cannot find us.

## Design

1. **Five prerendered pages**, static HTML in `public/` like `/privacy`:
   - `/pollen` — how pollen affects breathing; why *which plant* matters (the birch-not-oak
     argument, written for a person, linking the app as the way to find out)
   - `/pollen/ragweed`, `/pollen/birch`, `/pollen/oak`, `/pollen/grass` — per-plant: season
     timing by US region, what the 0–5 index levels mean, asthma-vs-hay-fever nuance, CTA
   - `/pollen/calendar` — the full region × month table
2. **The calendar tables are generated, not written.** A build script (pattern:
   `scripts/derive-breakpoints.mjs`) renders them from `pollenCalendar.ts`, and a test fails
   if the pages drift from the source — the same never-drift discipline the breakpoints use.
3. **Original copy only.** No republishing Google's `plantDescription` text or hotlinking
   their plant photos — their content, their attribution rules. Cross-reaction facts get
   rewritten from primary allergy references and cited.
4. **YMYL care.** Every page carries the canonical disclaimer, cites sources, and answers
   narrow questions well instead of padding — pollen + asthma is a health query class where
   thin content ranks worse than no content.
5. **Wiring:** sitemap entries with real `lastmod`, `FAQPage` JSON-LD where a page genuinely
   answers questions, breadcrumbs, cross-links between the pages and to the app, canonical
   tags per page (these are content, unlike the app routes).

## Acceptance

- Each page returns 200 static HTML with the content readable JS-off; Lighthouse SEO ≥ 95.
- The calendar page's table matches `calendarPollen`'s output exactly (generated + tested).
- Sitemap lists all five; no page duplicates Google's plant descriptions (spot-check).
- Search Console shows the pages indexed (verification after deploy, not a code gate).

## Non-goals

Ranking for head terms ("pollen count today"); location-personalized content pages; a blog
engine — five files and a generator script, nothing more.
