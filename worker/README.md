# breathing-index-worker

The relay: the one server breathingindex.com runs. It exists because keyed
APIs cannot be called from a public client. It holds the keys, refuses any
location sharper than one decimal degree (~11 km), caches by (route, grid
cell) for an hour, and never logs, stores, or derives anything about a user.
The code being public is part of the privacy promise: read `src/index.ts`.

## Routes

| Route | Upstream | Key |
| --- | --- | --- |
| `GET /v1/airnow?lat=&lon=` | AirNow monitoring-site observations, 48 h of hourly concentrations in a ±0.25° box, plus today's reporting-area forecast for its Action Day flag | free |
| `GET /v1/pollen?lat=&lon=` | Google Pollen 3-day forecast | metered |
| `GET /v1/smoke?lat=&lon=` | NOAA HMS smoke plumes (USFS AirFire GeoJSON), point-in-polygon for the cell centre | free |
| `GET /v1/mold/stations` | The mold station directory — this worker's own `src/mold/stations.ts`, minus the URLs | — |
| `GET /v1/mold?station=<id>` | One counting station's newest reading, scraped from whatever that station publishes | free |

`/v1/smoke` is the odd one out: its upstream is keyless, and it goes through the
relay because the file is a ~230 KB national GeoJSON and the answer is one
number. The file is cached whole under a single key (`smoke:file:v1`, one hour
— it is republished at :37 past), and each cell's answer is cached under its
own, so the common path never parses the file at all. It answers
`{ density: 0|1|2|3, start, end, fetched }`, where 0 is "no plume over this
cell", the density is the *worst* of the plumes containing it (they overlap),
and start/end are that plume's observation window converted from HMS's
`YYYYDDD HHMM`. Satellites need daylight to see smoke, so overnight the latest
analysis is yesterday afternoon's and the client says "as of" with `end`. A
file that does not parse answers density 0 with `stale: true` rather than an
error — see `src/geo.ts`, which holds the geometry and is unit-tested off the
root vitest config.

AirNow allows 500 requests an hour per key per service and will not raise it;
the hour of KV holds a grid cell to one call, well under. The route used to
call `aq/observation/latLong/current/` and `aq/forecast/latLong/`, both retired
2026-09-30 — see `specs/21-airnow-migration.md`. `/v1/purpleair` went with
them: nothing called it, and PurpleAir's licence forbids combining its data
with open-source code, which this repo is.

`lat`/`lon` must have at most one decimal place or the relay answers 400.
Upstream errors pass through uncached so the client falls back the way it
already knows how (calendar estimate, "no evidence yet").

## Mold, and a parser per shape

The two `/v1/mold` routes are the exception to everything above: they take a
station id and no coordinates, so they are routed before the coordinate gate
and keep only the origin gate. A counting station is a place the user picked by
name — stations are 50–100 miles apart, so there is no grid cell to round to —
and the reading is the same reading for everyone who picked it.

No vendor sells a trap-derived mold number (`research/mold-sources.md` is the
sweep that establishes that). What exists is a scatter of health departments,
hospitals and clinics that post a number on a web page once a weekday morning.
So `src/mold/` is one module per *publishing shape*, not per station, and
`stations.ts` is the config that points each station at one:

| Module | Station | What it reads |
| --- | --- | --- |
| `rss.ts` | `stl-county` | St. Louis County's RSS feed — `Mold Count: 54862 (Very High)` in a title, date from `pubDate`. Total only |
| `houston.ts` | `houston-hhd` | Houston Health Department, two fetches: crawl the index for the newest daily link, then parse that page's summary box and 20 named spore rows |
| `kc.ts` | `kc-childrens-mercy` | Children's Mercy Kansas City — the mold column of the summary table, plus its rotating Top 5 Molds table |
| `canton.ts` | `canton-oh` | Canton City Public Health — `Cladosporium (4310)` and friends out of a CivicPlus editor blob; total is their sum |
| `nab.ts` | `nab:<guid>` | The AAAAI National Allergy Bureau's public GraphQL endpoint. **Gated** — see below |

Every parser is a pure function from text to an observation and is unit-tested
beside its module, off the root vitest config, against trimmed captures in
`tests/fixtures/mold/`. Only the fetching lives in `index.ts`. There is no HTML
parser dependency: the shapes are small, and a regex over tag-stripped text is
honest about being a scraper where a DOM library would only look sturdier.

**The observation date is required.** A parser that cannot find the date the
page states returns null and the route answers 502 `{"error":"no date"}` — never
a reading. Waterbury Hospital has rendered a normal-looking count page every
day for four years past its last real reading, and a number with no date is
indistinguishable from that.

Readings are cached six hours per station (`mold:v1:<id>`); the directory,
24 hours. Stations post once a weekday morning, so N users of one station cost
four fetches a day of somebody's health department site.

Houston's slugs are hand-typed and inconsistent (`september-112026` one day,
`september-9-2026` the next, `/Services/` about a quarter of the time), so the
newest day is found by crawling the index's links and reading the date out of
each — never by constructing a URL from today's calendar.

### The NAB flag

`nab:` stations answer 403 `{"error":"nab disabled"}` and are absent from
`/v1/mold/stations` unless `MOLD_NAB_ENABLED` is exactly `"1"`. It is a plain
`[vars]` entry in `wrangler.toml`, not a secret, and it is pinned to `"0"`.

This is a licence term wearing a feature flag. The endpoint is public,
unauthenticated and unmetered; none of that is permission. The NAB states that
any use without the AAAAI's prior written consent is prohibited, and its
data-release policy excludes commercial use. Production stays off until that
consent is on file — `specs/28-mold.md` §1 has the ask and the precedent to
cite. The client is written now because it is small and because the licensing
conversation goes better with a working thing to point at.

## First deploy

```bash
cd worker
npm install
npx wrangler login                     # one-time browser auth
npx wrangler secret put AIRNOW_API_KEY
npx wrangler secret put GOOGLE_MAPS_API_KEY
npx wrangler kv namespace create CACHE # then paste the id into wrangler.toml
npx wrangler deploy                    # prints the *.workers.dev URL
```

The KV cache is optional but is the cost control: without it every request
goes upstream. The Cache API is not used because it is a no-op on
`*.workers.dev` domains.

## Local dev

Copy `.dev.vars.example` to `.dev.vars` (gitignored), fill it from your
`.env.local`, then `npm run dev` and curl `localhost:8787`.

## CI deploys

`.github/workflows/deploy-worker.yml` deploys on pushes to `main` that touch
`worker/**`. It is inert until the repo has a `CLOUDFLARE_API_TOKEN` Actions
secret (Cloudflare dashboard → My Profile → API Tokens → "Edit Cloudflare
Workers" template). Until then, deploy manually with `npx wrangler deploy`.

## Spend protection

The Origin allowlist filters casual freeloading, nothing more. The real
protection is at each vendor: the Google key is API-restricted to Pollen with
a hard daily quota cap, and the free keys are rate-limited by their vendors.
If someone burns the day's quota, the app degrades to its keyless behavior —
never a broken screen.
