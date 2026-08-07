# Content pages — give the domain something to rank

**Status:** proposed · **Effort:** M (writing-bound) · **Deps:** none · **Priority:** the only growth spec; start with one page

## Problem

breathingindex.com is a single-URL SPA with app-shell content — Search Console is registered
but there is nothing for Google to rank. Meanwhile the queries the product answers are being
searched verbatim by exactly the target user: "AQI moderate but hard to breathe",
"why is AQI fine but I can't breathe", "smoke vs ozone asthma", "what AQI is bad for
asthma". The README's "gaslit by Moderate" story is already the best essay in this niche and
it's buried in a git repo.

## Design

1. **Static, prerendered pages under the apex** — `/why-aqi-lies-to-your-lungs/`,
   `/smoke-vs-ozone/`, `/aqi-70-explained/` — real HTML at build time (vite-plugin markdown →
   HTML, or plain .html in `public/`; no client-render dependency for content). Each page:
   the essay, the app's own visual language, one quiet CTA into the app, proper
   title/description/OG per page. The existing site chrome and share-card design carry over.
2. **Launch set (3 pages, in order):**
   - *The AQI isn't calibrated for your lungs* — the README/intro thesis, expanded with the
     Amsterdam/Hamden receipts and the max()-hides-the-driver mechanics.
   - *Smoke vs ozone: same AQI, different lungs* — the M1 findings doc is 80% of this
     already (fine-fraction fingerprint, co-elevation day the composite hid).
   - *What "Moderate" actually means* — breakpoint tables translated to µg/m³ and to the
     app's 1–4 behavioral scale; the page version of the scoreboard argument.
3. **Structured data:** `Article` JSON-LD; a real `sitemap.xml` listing content pages
   (exists today but should enumerate them); internal links between pages.
4. **The scoreboard share-cards ([08](08-scoreboard.md)) link here,** not to the app root —
   a person seeing "officials said Moderate, I rated it Limiting" wants the explainer first.
5. **Voice rule:** these are essays with receipts, not content marketing. No listicles, no
   "top 10 air purifiers", nothing that smells like the sites this project exists to rebuke.
   Same medical-framing sentence (spec-09) in the footer.

## Acceptance

- `curl` of each page returns the full article HTML with no JS execution (verify what
  Googlebot sees is the content).
- Search Console shows the pages indexed; each has unique title/description/OG image.
- Lighthouse SEO ≥ 95 per page; app bundle untouched (content pages ship no app JS beyond
  the shared stylesheet).

## Open questions

- Cadence: three launch pages, then only when there's something true to say. A stale blog is
  worse than none; an evergreen trio is the whole v1 ambition.
