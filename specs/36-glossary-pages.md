# Glossary pages — one page per thing in the air

**Status:** built 2026-09-15 (branch `claude/glossary-split`) · **Effort:** M · **Deps:** [30-glossary.md](30-glossary.md) (the content module and the generator), [19-pollen-content-pages.md](19-pollen-content-pages.md) (the generator pattern) · **Priority:** high. The glossary is the only substantial crawlable text on the domain and it spends all of it on one URL.

## Problem

The crawlers behind ChatGPT, Claude and Perplexity fetch raw HTML and do not run JavaScript. Measured 2026-09-15: the app root hands them 152 words, `/glossary/` hands them 2,975. Everything else on the domain is the app shell, a legal document, or the two pollen pages.

A page ranks for one thing. The twelve sections of `/glossary/` are twelve separate questions people type: whether dew point affects breathing, whether ozone is bad for asthma, what a mold spore count is. They share one `<title>`, one description, one canonical URL and one `<h1>` that reads "What's in the air", so a search engine holding the dew-point question gets a page whose heading is about the air in general and whose first three hundred words are about fine particles.

Twelve pages is twelve titles, twelve descriptions and twelve canonical URLs. It is also eleven links from each page to the others, and that is the part a split alone does not buy. A crawler that lands on one term page finds the other eleven without going back through the index, and a reader who came for ozone can see that mold is a thing this app knows about.

## Design

1. **The slug lives beside the copy.** `GlossaryEntry` gains `slug`, `title` and `description`. The slug spells the thing the way a person searches for it rather than the way the engine names the variable: `dew-point`, not `dewpoint`; `sulfur-dioxide`, not `so2`; `colds-and-asthma`, not `viral`. `glossaryHref(key)` is the only place a glossary path is assembled, so the sheet's link, the rail, the cards and the canonical tag cannot disagree about where a thing lives. `title` and `description` are page metadata and not entry copy: the part rules of spec 30 §5 do not reach them, and a test holds them to 60 and 155 characters so a search result shows all of both.

2. **The generator owns whole files.** `scripts/generate-glossary.mjs` writes thirteen complete HTML files instead of filling one block between `begin generated` markers. Twelve hand-kept shells around twelve generated blocks would be twelve more places for a page to drift from the module, and the shells are identical anyway. The page chrome the old shell held — the intro line, the breadcrumbs, the footer — is a named constant in the script, and the disclaimer is imported from `src/ui/labels.ts` rather than copied. `--check` and `--write` keep their contract and `--check` stays in `npm test`.

3. **`--check` also catches a rename.** A slug that changes leaves the old directory on disk and Pages goes on serving a page nothing links to and no canonical claims. The script treats a directory under `public/glossary` that no slug claims as drift, and `--write` removes it when it holds nothing but an `index.html`.

4. **A rail of all twelve on every term page.** Grouped under four headings, which are an editorial claim and not derivable: Particles (fine, coarse, smoke), Gases (ozone, SO₂), Spores and pollen (mold, dry-spore conditions, the three pollens), Weather and you (dew point, sick). A link back to the index reading "All twelve" sits above the groups. The current term is marked and not linked, since there is nowhere for it to go. `coverage()` fails the build when an entry is added to the module and forgotten in the rail.

5. **On a phone the rail is a scrolling row of chips, pinned under the header.** Most of the traffic is mobile, so this is the case that had to work, and there is no script on these pages to arrange it with. One list of markup serves both: the rail is a flex container, the group names are hidden at phone width, and the current term takes `order: -1` so it sits first. The row is 44 px of thumb, full bleed to the screen edges so a chip cut off at the right reads as more to scroll, and sticky at the top so the twelve stay reachable while the entry scrolls past.

6. **Previous and next along `GLOSSARY_ORDER`**, which is the air table's own order. Fine particles has no previous and Sick has no next; the side that exists keeps its half of the line.

7. **`/glossary/` becomes an index of cards**, one per term, each with the entry's photograph, its name and its mono meta line. Sick has neither photo nor meta, so its card gets a blank tile of the same ratio and the grid stays even. Each card carries `id="{key}"`, because the sheet that shipped links to `/glossary#pm25` and an old anchor should land on the card that leads to the page.

8. **The sheet's "Full glossary" link lands on the entry's own page.** The words stay true: that page carries the rail to the other eleven, which is what the anchor on the long page used to offer.

9. **All thirteen URLs go in `public/sitemap.xml`**, in air-table order, which is the order the pages link each other in. The sitemap is written by hand and the slugs are not, so a test asserts every `glossaryHref` appears in the file.

10. **The dev server matches the slug by shape.** `vite.config.ts` rewrites `/glossary/<slug>` to `/glossary/<slug>/index.html` rather than listing twelve paths that would have to be typed out again every time a slug is added. Pages needs no telling.

## Acceptance

- `node scripts/generate-glossary.mjs --check` passes, fails on a hand-edited generated page, and fails on a directory under `public/glossary` that no slug claims.
- Each of the twelve term pages carries its own title, description and canonical, eleven links to its siblings and a link to the index, and 156 to 395 words of body text with no script on the page.
- At 390 px the chip row scrolls horizontally, the current term is first, and nothing on the page overflows sideways.
- `npm run build` and `npm test` pass; `/glossary/ozone/` resolves in `vite dev` and off disk.

## Non-goals

Open Graph or per-term share images. `/glossary/` keeping the full text of every entry. A page for a retired variable. Renaming a slug after it has shipped, which would want a redirect this site has no way to serve.

## As built

- **A stylesheet, not the inline block.** The one-page glossary kept its chrome inline and said why: /pollen earned its own stylesheet by being five pages. This is thirteen, and they are generated, so an inline block is two hundred lines written thirteen times by a script. `public/glossary.css` loads after `legal.css` the way `pollen.css` does, and every colour in it is one of legal.css's variables.

- **The photo credit moved once.** Every term page carries its picture's credit in the figure caption, as spec 30 requires. The index shows twelve of those pictures as thumbnails and has no room for twelve captions, so it credits the set in one line and leaves each picture's own credit a tap away.

- **The hero photo is not lazy.** On a term page the picture is the first thing under the name and is usually what the browser paints last, so `loading="lazy"` came off it. The index's thumbnails keep it.

- **The index lost its words and that is the point.** It went from 2,975 body words to 187. The twelve pages carry 3,809 between them, so the domain gained about a thousand crawlable words and twelve titles while the hub became a hub.

- **The service worker precaches thirteen files where it precached one.** `globPatterns` picks up every HTML file in `dist`, so an installed PWA carries the whole glossary offline instead of one page of it. That is 95 KB of glossary where there was 33 KB, against a precache of 1.1 MB. Not worth a `globIgnores` entry until the precache is a problem.
