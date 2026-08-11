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

## Builder's field notes (from the 2026-08-10/11 session that shipped spec 18)

Start this in a fresh context window — owner's call; the build deserves full headroom.

**Process, per Drew, before writing a word:**

1. Pull the prose-writing skills from "the faerelund repo in Projects" — the goal is
   avoiding LLM tells in the copy. *Not found under `~/Projects` as of 2026-08-11* (no
   directory matches); confirm the repo's name/path with Drew first.
2. Use the passages of this site Drew re-wrote by hand as style exemplars. Ask him to point
   at them; one verified pure-Drew edit is commit `931a9f2` (intro copy: cut a hedging
   clause, gave the sentence a plain subject — "Rate your breathing from 1 to 4, and the app
   learns your triggers"). Note that squash-merged PR commits lost their Co-Authored-By
   trailers, so trailer archaeology alone cannot separate his hand from generated copy.
3. Register: the site's voice, but "go easy on the swearing."

**Content material already in the repo, discovered while building spec 18:**

- The NAB grains-per-m³ category table (low/moderate/high per species) lives in the
  `pollenCalendar.ts` docstring — exactly the material for explaining what a "count" is and
  why the app shows an index instead.
- The calendar's deliberate blanks are honest editorial gold, not embarrassments: no birch
  season in the South/Southeast/Southwest/California because birch doesn't grow there, and
  the real seasons those regions have (mountain cedar in Texas, oak and pine in the
  Southeast) are what the measured feed knows and a calendar can't. "Here is what a calendar
  can honestly claim, and here is where it stops" is the page's credibility.
- The birch-not-oak argument has a concrete mechanism to describe without hand-waving: the
  diary separates plants on the days their indices diverge — overlapping seasons still
  produce divergent days, and that's when candidate sets collapse. No other pollen site can
  tell this story because no other pollen product does attribution.
- UPI semantics for the levels explainer: integer 0–5, category words None→Very High;
  Google's own `indexDescription` strings describe symptom likelihood per category (read a
  live payload for the exact wording — paraphrase, don't quote).

**Traps and mechanics, learned the hard way:**

- Google's forecast window opens on the *UTC* day: late-evening local hours fall back to the
  calendar until local midnight. If a page says "updated daily," this is the asterisk.
- Do not republish Google's `plantDescription` text or hotlink `pollen-pictures` images —
  their content, their attribution rules (also the reason `healthRecommendations` strings
  never ship). Cross-reaction facts: rewrite from primary allergy references and cite.
- Prerender mechanics that already work: static HTML in `public/` (see `/privacy`,
  `/terms`), shared `public/legal.css`, sitemap has a canonicalization comment explaining
  which URLs are content vs app state — follow it, and give content pages their own
  canonical tags (unlike app routes, they are their own pages).
- The homepage's only crawlable prose is the `noscript` block in `index.html` — updated with
  pollen vocabulary in PR #22; keep it in step if the pitch changes.
- The relay caches pollen by (grid cell, hour) and the Google key is quota-capped, so page
  examples can safely be generated against the live relay at build time if ever wanted —
  but the design intent is that page tables come from `pollenCalendar.ts`, not the API.
