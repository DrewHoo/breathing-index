# Upstream limits and cadences — what a refetch can possibly buy

Agent-compiled (Claude, September 2026). The numbers behind the refetch floors in docs/code-standards.md (Requests §5): each source's rate limits, how often its data actually changes, and the caching behavior of the pipes in between. A client refetch faster than the upstream's own cadence returns the same bytes.

## Open-Meteo

- Free non-commercial limits: 600 calls/min, 5,000/hour, 10,000/day, 300,000/month (the monthly cap is stated but not yet enforced). Blocking is at their discretion, no notice. Non-commercial means no ads or subscriptions; CC-BY 4.0 attribution required. ([terms](https://open-meteo.com/en/terms), [pricing](https://open-meteo.com/en/pricing))
- **Calls are weighted**: more than 10 variables or more than 2 weeks of data counts fractionally as multiple calls (their example: 15 variables × 2 weeks = 1.5 calls). Our air-quality request is a fat one; it is not 1.0 calls.
- Data cadence: CAMS Europe air quality updates every 24 h (0.1° grid), CAMS global every 12 h (0.4°); weather models range hourly (HRRR/GFS) to 6-hourly (ECMWF). Values are published hourly; their status page asks clients to wait 10 minutes past availability. ([air-quality docs](https://open-meteo.com/en/docs/air-quality-api), [model updates](https://open-meteo.com/en/docs/model-updates))
- Measured by probe: responses carry **no `Cache-Control`, no `ETag`, no `Last-Modified`, no `Content-Length`** (chunked). Two consequences: the browser HTTP cache will never coalesce identical fetches (only an app-level in-flight map can), and workbox's `broadcastUpdate` can never detect a change (it compares exactly those three headers). SWR-with-notification against Open-Meteo has to be hand-rolled or the relay must add validators.
- So: an hourly value from a model that reruns every 12–24 h. A 15-minute client refetch floor is generous; refreshing on the hour boundary + 10 min is the honest schedule.

## AirNow

- Observations update once per hour, posted "generally between 10 and 30 minutes past the hour"; forecasts are issued once a day. The FAQ explicitly asks users to cache. Over the limit, the key returns nothing until the next hour. ([FAQ](https://docs.airnowapi.org/faq))
- The oft-cited **500 requests/hour/key is not confirmed by a primary source** — the per-service docs are login-gated; EarthSoft and Home Assistant both state 500/hr. Treat it as the working number.
- The limit is per key, and the key lives in the relay, so it is one shared budget across every user of the app. The relay's KV cache and (once built) request coalescing are what stand between a traffic spike and an hour of darkness.
- The old lat/long endpoints retired fall 2026; spec 21 moved the relay to `aq/data/` (built 2026-09-14).

## Google Pollen

- SKU "Pollen Usage": 5,000 free events/month (≈166/day), then $10 per 1,000. Quota 6,000 QPM. ([pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [FAQ](https://developers.google.com/maps/documentation/pollen/faq))
- Data is a daily bucket per 1×1 km cell, up to 5 forecast days. Google publishes no refresh interval beyond "continuously calculates."
- Policy: caching forecast responses reads as prohibited ("Content pre-fetching, caching, or storage is generally prohibited"; only heatmap tiles get an explicit 1-hour allowance), attribution "Includes pollen data from Google" is required. The relay's 1 h KV cache stands anyway — risk reviewed and accepted Sep 2026 (docs/code-standards.md, Requests §10). ([policies](https://developers.google.com/maps/documentation/pollen/policies))
- Refetching pollen more than a few times a day buys nothing: the bucket is daily.

## NOAA HMS smoke

- Human analysts draw the polygons: first classification 11 AM–12 PM ET, second 7–8 PM ET, additions through daylight hours, finalized the next morning. ([HMS product page](https://www.ospo.noaa.gov/products/land/hms.html))
- So smoke changes on a person's schedule, roughly twice a day. The relay's KV hour is already conservative; a client refetching smoke at night reads the same polygons every time.

## Mold stations

- Health-department pages post once each weekday morning. The relay caches 6 h per station ("four fetches a day against a page that changes once a weekday morning", specs/28-mold.md §5) and the station directory 24 h.

## The pipes

- Workbox `NetworkFirst.networkTimeoutSeconds` only resolves to cache when a cached entry exists; a cold cache waits out the full network request regardless. The timeout is purely how long a returning visitor waits before being shown data they already have.
- Workbox caches statuses `[0, 200]` by default — pin `cacheableResponse: { statuses: [200] }` or an opaque/error body becomes the cached copy.
- `ExpirationPlugin.maxAgeSeconds` can serve one stale response after expiry unless the response carries a `Date` header. Open-Meteo sends `Date`, so the ceiling holds there; a source without it would leak one stale serve.
- `stale-while-revalidate` as an HTTP directive is not honored by Safari's HTTP cache — on a phone-first PWA, SWR lives in the service worker or the app, and `s-maxage` + `stale-while-revalidate` from the relay still pays at the Cloudflare edge.
- The relay sets no `Cache-Control` today, so every browser hit is a billed Worker invocation even on a KV hit, and no browser or SW layer can absorb it (docs/code-standards.md, Requests §10).
