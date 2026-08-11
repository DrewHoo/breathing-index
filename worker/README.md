# breathing-index-worker

The relay: the one server breathingindex.com runs. It exists because keyed
APIs cannot be called from a public client. It holds the keys, refuses any
location sharper than one decimal degree (~11 km), caches by (route, grid
cell) for an hour, and never logs, stores, or derives anything about a user.
The code being public is part of the privacy promise: read `src/index.ts`.

## Routes

| Route | Upstream | Key |
| --- | --- | --- |
| `GET /v1/airnow?lat=&lon=` | AirNow official observations (AQI points; the client bridges to µg/m³) | free |
| `GET /v1/purpleair?lat=&lon=` | PurpleAir outdoor sensors in the grid cell | free |
| `GET /v1/pollen?lat=&lon=` | Google Pollen 3-day forecast | metered |

`lat`/`lon` must have at most one decimal place or the relay answers 400.
Upstream errors pass through uncached so the client falls back the way it
already knows how (calendar estimate, "no evidence yet").

## First deploy

```bash
cd worker
npm install
npx wrangler login                     # one-time browser auth
npx wrangler secret put AIRNOW_API_KEY
npx wrangler secret put PURPLEAIR_API_KEY
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
