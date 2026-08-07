# Freshness honesty & offline logging — "is this now?" must never be wrong

**Status:** proposed · **Effort:** M · **Deps:** none · **Priority:** medium-high

## Problem

Two staleness mechanisms mask each other. `fetchExposureSeries` stamps
`fetchedAt: new Date().toISOString()` at *parse* time (`src/sources/openMeteo.ts`), and the
service worker serves Open-Meteo via NetworkFirst with a cache up to 6 h old
(`vite.config.ts`) — a cache hit looks like a successful live fetch, so the app-level
last-good fallback never fires, no staleness banner shows, and the header prints the current
time next to six-hour-old air. The sidewalk question — "is this now?" — gets a confidently
wrong answer, and diary entries bind to stale exposure vectors without a marker.

Separately, when the fetch fails entirely with no cache, the error path is a dead end: a bare
developer-facing status line ("Couldn't reach Open-Meteo: … (503/200)"), no retry, and no
quick-log card — an asthmatic having a bad-breathing moment in a dead zone loses the exact
data point the app exists to capture.

## Design

1. **Truth from the data, not the clock.** Derive display freshness from the series itself:
   the newest hour ≤ now in the payload. Header shows that hour; if it lags wall-clock by
   >90 min, show the staleness banner ("air data from 1:00 PM") regardless of how the bytes
   arrived. Delete the parse-time `fetchedAt` as a freshness signal (keep it as debug
   metadata).
2. **Cache-aware fetch.** Add a `X-Fetched-At` check or simply compare payload hours as
   above — no SW surgery needed; the SW cache stays as a resilience layer, the UI stops
   trusting arrival time.
3. **Stale-aware diary entries.** Entries record `exposureAgeMinutes` (log time minus newest
   payload hour). Entries logged against >3 h-old air are tagged and the engine treats their
   vectors as `estimated` (post-[03](03-engine-robustness.md): can seed candidates, can't set
   hard bounds alone).
4. **Degraded logging.** The failed-fetch state keeps the quick-log card: rating + timestamp
   save immediately with `exposure: pending`; a background retry (and next successful app
   open) backfills the vector from the API's hourly history for that hour, then the entry
   enters the model. Copy: "Saved — I'll attach the air readings when I'm back online." A
   human-readable error line plus a Retry button replaces the status-code dump.
5. **Reload resilience** (same territory): register a `vite:preloadError` handler that
   reloads once on stale-chunk 404s after a deploy — observed live on breathingindex.com when
   a pre-deploy tab loads post-deploy lazy chunks.

## Acceptance

- Kill network, reopen installed app: banner shows the data's own age; header never shows
  wall-clock next to old air.
- Simulate SW cache hit with 4 h-old payload: banner appears despite "successful" fetch.
- Airplane-mode log: entry saves, shows pending state in Diary, backfills on reconnect, then
  participates in inference (fixture for backfilled entry).
- Post-deploy stale chunk triggers exactly one automatic reload, not a loop.
