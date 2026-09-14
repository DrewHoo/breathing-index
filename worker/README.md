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
