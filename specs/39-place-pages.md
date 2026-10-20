# Place pages — what's in the air where you are, and how good the data is

**Status:** proposed 2026-10-19 · **Effort:** M (the pages) + S (the plumbing) · **Deps:** [36-glossary-pages.md](36-glossary-pages.md) (the generator pattern), [19-pollen-content-pages.md](19-pollen-content-pages.md) (the calendar prior), [21-airnow-migration.md](21-airnow-migration.md) (monitor sites with coordinates), [28-mold.md](28-mold.md) (the station directory) · **Priority:** the growth spec. Supersedes [17-content-pages.md](17-content-pages.md), whose three essays never shipped; the one that matters becomes a question page here.

## What Streak King taught us

Streak King's search traffic went from nothing to the largest referrer in four days
(Oct 13 to 17, 2026), and the mechanism is specific enough to copy.

1. The clicks come from Google's AI Mode, not classic results. Of 112 clicks on Oct 17,
   five sat on a query Google reports; the visible tail was follow-up turns ("who has
   it now", "in the sec?", "double check your research"). A click there is a person
   tapping the source link under an AI answer.
2. AI Mode cites the page whose title and first sentence state the answer to the
   question shape, with a name and a number. 17 definition pages carried 120 of 125
   clicks. The vs-unranked page took 7% of its impressions at position 5 because its
   title starts "Current longest winning streaks". The history page, at position 8
   with the right snippet, took 0.3%. Rank mattered less than whether the page is an
   answer.
3. The page is the unit of measurement. Query rows are a 5% sample; page rows are
   complete. Each page stands for one question shape, so the scoreboard is impressions
   and clicks per page.
4. Discovery came first. Nothing happened until the sitemap was registered. Then
   Google read it once and had to be told again by API when pages were added.
5. The chat apps read the site through their own crawlers (ClaudeBot 383 hits in a
   week, GPTBot, PerplexityBot) and the live fetches they make while answering
   (ChatGPT-User). They run on Bing's and Brave's indexes, not Google's, so Bing
   is the other half.

`specs/seo.spec.md` and `specs/search-performance.spec.md` in that repo have the
numbers.

## Where breathingindex.com stands

Search Console for `sc-domain:breathingindex.com`, Sep 20 to Oct 17: 6 impressions,
0 clicks. Google knows three URLs (`/`, `/privacy`, `/terms`); the glossary, the
pollen pages and `/asthma-logbook/` are "unknown to Google". It last crawled the root
on Sep 23. No sitemap had ever been submitted to the property. Bing's index held one
page (`/terms`) on Sep 17.

I submitted `https://breathingindex.com/sitemap.xml` through the API on 2026-10-19
17:34 UTC. Google downloaded it within a second: 19 URLs submitted, 0 indexed. So
the glossary and pollen pages get their first real chance over the next two weeks.
That fixes discovery for the pages we have, which is the first of the five lessons.
The rest of this spec is about the other four.

## The question we can answer and nobody else does

The question is "what in the air is making it hard to breathe right now". Every
weather site answers it with a composite number and a color. The honest answer has
two parts, and the second is the one we own:

- Which components are high today, each with its own number and window. The app
  already computes this (the rows, the EPA Good ceiling guide, the "also checked, too
  low to matter" line).
- How much to trust each number here. Whether the ozone figure is a monitor or the
  CAMS model, how far the nearest PM2.5 monitor is, that the pollen number everywhere
  in the US is a model unless a counting station is near, that outdoor mold is
  counted at about 80 stations worldwide and the directory reads four of them while
  the NAB stays off. The app shows this per row ("New Haven monitor" vs "model",
  "Model ozone runs high in the eastern US in summer", the OpenAQ station's distance),
  but only after JavaScript runs, for the one place the user is standing.

An AI answer wants the second part. Pollen.com and the weather apps give it a confident
number with no provenance; a page that says "in Billings the nearest PM2.5 monitor is
in Billings itself, 3 km; ozone is a model here; pollen is a model everywhere in
Montana" is the better source and reads as one. That is the coverage thesis from
September, written one place at a time.

So the product is a page per place, in prose a crawler can read without JavaScript,
whose first sentence is the answer and whose body is the provenance.

## Design

### 1. Plumbing, this week

Built 2026-10-19 (uncommitted): `scripts/gsc.mjs`, `scripts/generate-llms.mjs` and
`public/llms.txt`, the IndexNow key file and `scripts/indexnow.mjs` with a deploy job,
and question-form titles with a `lead` sentence on every glossary entry. Left for Drew:
the Bing property and the AirNow form.

- Sitemap submitted (done). Resubmit through the API after any deploy that adds
  pages. `PUT sites/{site}/sitemaps/{url}` with the `webmasters` scope; the
  `search-console-access` memory has the auth.
- `scripts/gsc.mjs`, copied from Streak King with the property and prefix swapped
  (`sc-domain:breathingindex.com`, `https://breathingindex.com/`). The weekly read
  is `date`, `page`, then `query --rows 500` for the visible tail.
- Bing. Drew verifies breathingindex.com in Bing Webmaster Tools (the drewhoover.com
  property doesn't cover it) and submits the sitemap there. An IndexNow key file in
  `public/` and Streak King's `scripts/indexnow.mjs` adapted, run after deploy.
- `public/llms.txt`, Streak King's shape: one paragraph on what the site is, then one
  line per page with the fact the page states. The place pages add one line each.
- Titles become the question. The glossary pages are a definition first ("Ozone and
  asthma"; h1 "Ozone"; first body line "O₃ · µg/m³ · 8h average"). The question people
  type is "is ozone bad for asthma" and "why is ozone worse in the afternoon". The
  title and the first sentence answer it; the definition follows. Same for the
  twelve. This is wording, not structure, and the generator owns the files.

### 2. A page per place: `/air/<state>/<city>/`

Each place page has two layers, and the split is the point.

**The slow layer, rebuilt daily, true at any age.** How the air is measured here.

- Per pollutant the app shows: the nearest AirNow monitor that reports it, by name and
  distance, from the `aq/data/` bbox the relay already asks for. Where no monitor
  reports it within the relay's 50-mile box, the line says so and names what the app
  shows instead (the CAMS cell, 40 km globally, 11 km over Europe). Ozone monitors
  that run only in ozone season are called out as such.
- Pollen: "no pollen is counted within N km of here"; the nearest NAB or health
  department station from the mold directory when there is one; otherwise that the
  number in every app is a model. Tree, grass and weed seasons for the place's region
  from the calendar prior, which is our own data.
- Mold: the nearest counting station in `worker/src/mold/stations.ts`, by name and
  distance, or "no outdoor mold count exists within N km".
- Smoke: that HMS covers all of North America, and that satellites need daylight.
- One sentence of verdict at the top of the layer: "Particles are measured here, ozone
  is a model, nothing is counted for pollen or mold."

**The fast layer, rebuilt hourly, stamped.** What's high right now.

- The lead sentence: "As of 2 pm Oct 19, ozone is the thing that's up in New Haven:
  92 µg/m³ 8h average, from the Criscuolo Park monitor 3 km away. Fine particles are
  6 µg/m³. Pollen is a season estimate: tree season is over, ragweed is finishing."
  Every number carries its window and its instrument, the way the app's rows do.
- Below it, every pollutant above its EPA Good ceiling as a line, then the app's own
  "also checked, too low to matter" line, then the disclaimer.
- The `as of` is in the sentence, not a footer, because Google's copy of the page
  will be hours or days old. A stale fast layer reads as a dated statement, and the
  slow layer under it is still right.

The page ends with a link that opens the app at that place, which is where the
personal part lives. The JSON-LD is `WebPage` with `about` the place and nothing
else; no rich-result type we don't earn.

**Which places.** Start with every AirNow reporting area (about 400 US places,
each already a forecast region with a name) plus the state capitals that aren't one.
That set is exactly "places AirNow speaks about", so the measured half of the page
is never empty. Grow from Search Console's page rows. No pages outside the US in the
first wave: OpenAQ would carry the measured half abroad (spec 38), and that's a
second wave if US pages pull.

### 3. How it's built: a scheduled static build, not a worker

Two ways to produce a page that changes hourly. I'd start with the first.

**A GitHub Actions cron builds the pages.** `scripts/generate-places.mjs` runs at
build time (spec 19's `ts-ext-resolver.mjs` lets it import `src/sources/*`), fetches
each place, writes `dist/air/<state>/<city>/index.html`, and the Pages deploy ships
them. The cron runs hourly; the repo is public, so Actions minutes are free. Nothing
is committed; the pages exist only in `dist`.

Costs and the fixes:

1. AirNow's key allows 500 calls an hour and the relay's users share it. The build
   asks one `aq/data/` bbox per state (50 calls) and splits the rows by place, so the
   build never competes with users.
2. Open-Meteo is 10k calls a day on the free tier; 400 places hourly is 9,600. So
   the fast layer refreshes every two hours (4,800) until there's a reason to pay.
3. The service worker precaches every HTML file in `dist`. 400 pages changing hourly
   would churn every installed PWA's precache, so `/air/**` goes in `globIgnores`.
4. A build failure must not take the pages down. The generator writes nothing for a
   place whose fetch failed and the deploy keeps the previous page, the way the
   glossary's `--check` fails rather than writes.

**The Cloudflare worker in front of the site.** Drew's idea: render the page per
request from the relay's KV cache, the way `streak-king-share` rewrites heads for
drewhoover.com. What it buys is live numbers for the fetch a chat app makes while
answering (ChatGPT-User, Claude-User) and a count of crawler hits, which static Pages
can't give. What it costs:

1. The zone has to move to Cloudflare (nameservers are at Porkbun today; drewhoover.com
   moved on 2026-10-04 and the memory `cloudflare-share-worker` has the steps).
2. One more party sees every request. The privacy page says the relay never logs and
   the site is static on GitHub Pages. A proxy in front changes that sentence even if
   the worker stores nothing, and the privacy promise is the brand.
3. Google's AI Mode answers from its index, not from a live fetch, so live rendering
   buys nothing on the channel that sent Streak King its clicks.
4. Serving bots a page humans don't see is cloaking. Streak King avoided it by passing
   prerendered pages through untouched and rewriting only the head with the facts the
   page shows. A worker here would have to do the same, which means the static pages
   exist either way.

So the worker is the second step, taken if Search Console shows the place pages
pulling and the live-fetch crawlers show up in the question-tracker results below.
The static build is the first step and most of the work either way.

### 4. Question pages

Three pages whose title is the question, built like the glossary pages (prose in
`src/content/`, a generator, `--check` in `npm test`):

- "Why the AQI says moderate but it's hard to breathe". Spec 17's essay, the README
  thesis, with the max()-hides-the-driver mechanics and one real day's rows.
- "Is the pollen count measured or a forecast?" The NAB has about 67 active stations;
  everything else is a model; what a model gets wrong on a windy day; how to tell which
  one an app is showing you. Links to the place pages' pollen line.
- "How far away is the nearest air quality monitor?" What a monitor measures, that
  ozone and PM2.5 are measured at different sites, what the app shows between them.
  The place pages are the answer per place; this page is the one that ranks for the
  general question and sends people to theirs.

Each one follows the pollen-page rule: drafted in Drew's voice from exemplars, Drew
rewrites, fact-check agents per claim cluster, then rigor fixes. A provenance comment
instead of a label when he has rewritten it.

### 5. What each source allows on a public page

The pages store data a crawler reads later, which is not what the app does (the app
fetches live, for one user). Per source:

| Source | On a static public page | Condition |
|---|---|---|
| Open-Meteo (CAMS) | Yes | CC BY 4.0, non-commercial. One attribution line per page |
| AirNow | Yes | Guidelines: say the data are preliminary, credit the state and local agencies and EPA AirNow, don't alter values, and "make known" to the AirNow DMC that a product relies on the data. That last one is a form nobody has sent; it joins the letters pile |
| NOAA HMS smoke | Yes | Public domain |
| The calendar prior (spec 19) | Yes | Our own data |
| Google Pollen | No | The Pollen API policies prohibit pre-fetching, caching and storage, and text attribution has to read "Google Maps" in their type rules. So the place pages never show a Google pollen number. The pollen line is the calendar prior plus the provenance sentence, which is the honest version anyway |
| PurpleAir | Not yet | Derived per-cell values on a public page are the §4.3.d question the unsent licensing letter asks. Off the pages until it's answered, sensor counts included |
| Mold counts | Yes, cited | Each station's number with a link to the page it came from, dated. NAB stays off (`MOLD_NAB_ENABLED=0`) |
| OpenAQ | Second wave | Per-provider attribution; US pages don't need it |

### 6. Measurement

- Search Console page rows, weekly, into a `search-performance` section at the bottom
  of this spec: impressions and clicks per place page and per question page. The
  visible query tail for intents we haven't named.
- Bing's page and query stats once the property exists.
- A question tracker, the thing Streak King proposed and hasn't built: twenty
  questions in the shapes people use ("what's making it hard to breathe in Atlanta
  today", "is the air quality in Denver measured or estimated", "how accurate is
  pollen.com"), run weekly through the ChatGPT, Claude, Perplexity and Gemini APIs
  with search on, recording which sites get cited. It's the only way to see a zero.
  Cents a run. Share the script with Streak King.
- No crawler counts. Static Pages leave no log and the relay never logs by promise.
  The worker step in §3 is what buys them, and that's part of its case.

## Acceptance

- `curl` of a place page returns the lead sentence, the provenance layer and the
  attribution lines with no JavaScript. Word count over 200.
- The lead sentence names every pollutant above its Good ceiling with value, window
  and instrument, and carries the `as of` hour.
- The slow layer names a monitor and distance for each pollutant one reports within
  the box, and says "model" with the cell size where none does.
- A failed fetch for a place keeps the previous page; the build never ships a page
  with an empty fast layer.
- `/air/**` is excluded from the service worker precache.
- Search Console shows the place pages indexed within two weeks of the first deploy;
  the weekly read runs.

## Non-goals

- Pages for the user's own location. The app does that, and the privacy promise
  rounds locations to 0.1° for a reason.
- A Google pollen number on any static page.
- Prose generated per place. The lead sentence is a template over real values, the
  way the Streak King definition pages' lead is; the provenance layer is facts. The
  question pages are the only prose, and Drew writes them.
- Ranking work. No link building, no snippet tuning. The page either states the
  answer or it doesn't.

## Open questions

- The place set: all ~400 AirNow reporting areas on day one, or the 100 biggest and
  grow? 400 is more build and more Open-Meteo calls; the long tail is where the
  monitors are sparse, which is where the provenance answer is most different from
  pollen.com's. I lean 400 at a two-hour refresh, WDYT?
- The AirNow form. It's a one-page "we agree to the guidelines" with name and
  organization. Worth sending before the pages ship, or with the PurpleAir and NAB
  letters?
- Hourly vs two-hourly for the fast layer. Hourly means paying Open-Meteo or
  trimming places. Does anyone need the 3 pm reading on a page Google re-crawls
  every few days?
