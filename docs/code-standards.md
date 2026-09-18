# Code standards

**Status:** draft, not yet adopted

This document writes down the conventions the codebase already follows, and adds
request-discipline rules it doesn't follow yet. The app's whole cost structure is
client-side fetching against free-tier APIs, so most of the new rules are about
when a request is allowed to happen. Rules that describe existing practice cite
the reference implementation; rules marked **(new)** describe behavior the code
doesn't have today.

## Layering

- Dependency direction is `routes → ui → sources → engine`. The engine imports
  no fetch, no localStorage, no Date, no React. The caller owns time and storage.
- Pure-data modules that several layers need (`pollenPlants.ts`, the smoke
  fingerprint in `ui/smoke.ts`) are shared vocabulary, not layer members. When
  one is next touched, it moves to a shared module so `sources → ui` imports
  stop existing.
- Route files hold layout and wiring. Logic worth testing moves to a `.ts` in
  `src/ui/` (`evidence.ts` and `evidenceStrip.ts` are the pattern). `buildAirRows`
  at 425 lines inside `routes/index.tsx` is the counterexample to shrink.

## Requests

The budget problem is per-user request count against shared quotas: AirNow's
limit is per key and the key lives in the relay, so every user draws from one
bucket. Google Pollen has 5,000 free calls a month, about 166 a day. Open-Meteo
weights a request by variable count, so one fat air-quality call is more than
1.0 calls against their limits.

1. **One fetch owner per screen.** `fetchExposureSeries` is the only place the
   multi-source fan-out happens, and `getSeries` is the only way to invoke it.
   No component calls a source fetcher for data the series already carries.
   **(new — `MeasuredStrip` refetches AirNow the series already parsed, and
   `backfillPending` bypasses `getSeries` entirely.)**
2. **If a component needs a piece of what the series fetched, the series
   exposes it.** Refetching is never the way to get at a field. **(new)**
3. **Raw geolocation coords never appear in a URL or cache key.** Round to the
   grid cell first. GPS jitter changes the raw value on nearly every read, and
   every upstream grid is coarser than 1 km, so unrounded coords bust caches
   and buy nothing. The relay already enforces 1 dp at its edge
   (`worker/src/index.ts`); the client enforces it independently (`relay.ts`).
4. **In-flight dedup is a module-level `Map<cellKey, Promise>` plus a
   short-TTL memo of the settled result.** The Map alone doesn't work here:
   render order means the second caller usually arrives after the promise
   settled and got deleted. `airnow.ts` has the Map and still double-fetches
   for exactly that reason. **(new)**
5. **Refetch floors follow upstream cadence, not timers.** Open-Meteo air
   quality reruns every 12–24 h and publishes hourly values; AirNow posts the
   previous hour 10–30 minutes past; Google Pollen is a daily bucket; HMS smoke
   is analyzed twice a day; mold counts post weekday mornings. So the floor for
   a series refetch is 15 minutes, refreshing before :10 past the hour buys
   nothing, and refetching smoke at night returns the same polygons. Never
   `setInterval`. Refresh on `visibilitychange` gated by payload age. **(new —
   today there is no resume refresh at all, so an installed PWA reopened after
   eight hours shows eight-hour-old air until remount.)**
6. **Paint from storage first, revalidate behind the paint.**
   `breathing-index.lastSeries.v1` holds a complete valid series and today is
   read only in the fetch failure path, so a repeat open shows "Reading the
   air…" while usable data sits in storage. The stored series is the first
   paint whenever its cell matches; the network updates it. **(new)**
   A log made against a stale paint never takes its vector from the screen.
   The vector comes from a payload whose newest hour covers the entry's hour
   and is inside the freshness boundary; otherwise the entry saves pending and
   the revalidation already in flight resolves it, the same path an offline
   log takes today (`pendingExposure.ts`, with Open-Meteo's three-day history
   covering the entry's hour). The freshness boundary lives in one place
   (`freshness.ts`), so the screen's stale label and the log's pending
   decision can't disagree.
7. **A supplementary source never gates paint.** The existing rule is that
   pollen, AirNow, smoke, and mold return `null` on failure instead of taking
   the screen down (`openMeteo.ts`). Extend it: they don't get to *delay* the
   screen either. The two Open-Meteo calls gate paint; the rest land when they
   land. **(new — today one cold mold scrape holds the whole `Promise.all`.)**
8. **A failed fetch is retried by the next scheduled refresh, not by the
   trigger that fired it.** A pending diary entry waits for the next series
   refresh to backfill. **(new — today every diary mutation re-fires a full
   fan-out per unresolved place, serially, with no in-flight guard.)**
9. **The composition root states its request count in a comment, and any
   change to the count happens in the spec first.** A new exposure variable
   rides an existing request or justifies its own. **(new)**
10. **Relay routes set `Cache-Control: s-maxage` matching their KV TTL, and
    concurrent KV misses for one key coalesce into one upstream call.** Today
    the relay sets no cache headers, so every browser hit is a billed Worker
    invocation even when KV would answer, and a cache-expiry thundering herd
    is the way AirNow's shared budget actually dies. **(new)**
    Note on pollen: Google's caching policy reads as prohibiting caching
    forecast responses, and the relay caches them in KV for an hour anyway.
    That risk was reviewed and accepted (Sep 2026), so don't remove the cache
    or lengthen it without revisiting the decision.
11. **Fetching lives in route loaders, not effects. (new — adopted direction,
    not yet built.)** TanStack Router loaders with an explicit `staleTime`
    (the default is 0, which refires on every navigation) and `loaderDeps`
    carrying the rounded cell replace the per-component effect fetching in
    `useExposureSeries.ts`. This is what structurally prevents the Settings
    fan-out, the per-navigation geolocation handshake, and the paint
    waterfall, rather than each being patched in the hook.

## Parsing at the boundary

- A fetch payload lands as `unknown` and structural guards narrow it.
  `mold.ts` and `parseGeocodeResults` in `geocodeSearch.ts` are the reference;
  `(await res.json()) as Payload` in `airnow.ts` and `googlePollen.ts` is the
  form to migrate away from when those files are next touched.
- Sources return parsed, typed domain shapes, never wire JSON. Parsers are
  exported separately from fetchers so they're testable without a network.
- Parsing lives in the client, where it has tests. The relay normalizes shapes
  and never interprets (`worker/src/index.ts`).
- Absent is `null`, never `0`. Nobody-measured and measured-zero are different
  facts and the engine treats them differently.
- Freshness derives from the payload's own newest hour, never from arrival
  time. The service worker can serve a six-hour-old body that looks live
  (`freshness.ts`).

## localStorage

- Every key is `breathing-index.<name>.v1`, module-private, with the version
  bumped on shape change. Reads swallow to a default; writes swallow with a
  comment saying what the user loses. `settings.ts` and `dismissed.ts` are the
  reference. The one exception is the diary: `saveDiary` reports failure,
  because a tap that shows "Saved" and then evaporates on reload is worse than
  an error.
- Migrations are pure functions applied on read, idempotent, never a one-shot
  upgrade pass (`diaryStorage.ts`).
- History banks are capped on both axes and trim from the front. The quota is
  shared with the diary, which is the one thing that can't be refetched, so
  banks stay small (`pollenHistory.ts`, `hmsSmoke.ts`, `mold.ts`).

## Testing

- A `.ts` in `src/ui/` has a sibling `.test.ts`. A `.tsx` doesn't get tested;
  anything in one worth testing moves out to a `.ts` first.
- Tests run in plain Node. localStorage is stubbed with the module-scope Map
  pattern in `dismissed.test.ts`, cleared in `beforeEach`.
- The engine's contract is `tests/fixtures/trigger-cases.json`, not unit
  tests. `expectConfirmed` and `expectSuspectedStrong` are exact matches; a
  changed expectation carries a `why`. Changing engine behavior means editing
  a case, not writing a new test file.
- Prose gets tripwire tests: a regex that catches the known failure mode, with
  a comment saying it's a tripwire, not a proof (`glossary.test.ts`).

## Analytics and privacy

- `track()` never throws and never carries content: what was rated, tagged,
  noted, or measured stays on the device. `analytics.ts` holds the closed list.
- Any change to a `track()` call site lands in the same commit as the matching
  change to `public/privacy.html`. This contract should get a `--check` script
  like the generators have, because it has drifted twice already and it's the
  one contract with legal weight. **(new)**

## Generated artifacts

- Generators have three modes: no args prints, `--check` exits 1 on drift,
  `--write` rewrites. `--check` runs inside `npm test`.
- A constant that appears in more than one artifact is generated into all of
  them from one source. `DISCLAIMER` reaches the glossary pages this way and
  is still hand-copied into `index.html`, `privacy.html`, and `terms.html`;
  that's the gap to close. **(new)**

## Service worker and perf

- Targets at the 75th percentile of real users: LCP ≤ 2.5 s, INP ≤ 200 ms,
  CLS ≤ 0.1. CI can assert LCP and CLS in the lab (plus a TBT budget as the
  responsiveness proxy); INP does not exist without a user, so it is measured
  from the field only, never asserted in CI. The CLS risk here is async data:
  every value that arrives after a round trip gets a reserved box sized to the
  real content.
- NetworkFirst's `networkTimeoutSeconds` only helps when a cached copy exists;
  a cold cache waits for the full network regardless. So the timeout is the
  time a *returning* visitor waits before seeing data they already have, and
  8 s is too long. 3 s. **(new)**
- Runtime cache entries pin `cacheableResponse: { statuses: [200] }` so an
  error body never becomes the cached copy. **(new)**
- Every request the app makes is answerable by some cache layer: a service
  worker rule, a relay `Cache-Control` header, or an app-level memo. Today the
  five relay routes and geocoding search have none of the three. **(new)**
- Fonts stay self-hosted, at most two faces preloaded, `crossorigin` on the
  preload even same-origin.

## Tooling and types

- `tsconfig.json` already runs `strict` plus `noUncheckedIndexedAccess`,
  `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch`.
  Keep all of it. There are no `any` types in `src/` today; a change that
  introduces one carries a comment saying why the type can't be named.
- The residual type risk is assertions: about 47 `as X` casts and a scatter
  of non-null `!`s. Most of the casts are the cast-and-trust payload reads the
  parsing section already covers. New code narrows with guards instead of
  asserting.
- Adopt Biome, lint only. **(new — there is no linter today.)** ESLint is not
  actually an option: this repo is on TypeScript 7, whose npm package ships no
  programmatic compiler API, and typescript-eslint supports only `<6.1.0`
  until at least TS 7.1. Biome never touches tsc. Verified against this repo
  (Sep 2026): 95 files in 55 ms, 28 findings, including 8
  `useExhaustiveDependencies` errors, one of them on the `[data, diary]`
  effect behind the backfill request storm — the same rule two hand-written
  `eslint-disable` comments in `routes/index.tsx` reference for a linter that
  was never installed. Config: `formatter.enabled: false` and
  `assist.enabled: false` (assist runs under `biome ci` and would enforce
  import order), `noNonNullAssertion` off (207 hits, 87% of the noise),
  `routeTree.gen.ts` excluded (the only `any` in the tree is generated). Wire
  `biome ci` into `npm test`. The known gap: Biome has no `no-unsafe-*`
  family, the type-aware rules that police untyped JSON. The parsing
  section's `unknown`-plus-guards rule is the behavioral substitute; revisit
  the tooling when Biome's types domain leaves nursery.
- No formatter. Style by imitation has held, and a repo-wide reformat buys
  churn, not correctness. Biome's formatter stays off. Revisit if agent diffs
  get noisy.
- `worker/src/index.ts` is typechecked by nothing in CI: the root tsconfig
  hand-lists only the Workers-type-free worker files, and neither workflow
  runs the worker package's own typecheck. Add it to CI. **(new)** The
  hand-maintained `include` list is also a trap: a new `worker/src/*.test.ts`
  runs under vitest but silently skips typechecking.

## Copy

`AGENTS.md` and `docs/copy.md` carry the copy rules; they apply to all
user-facing text including error states. Never "row" in user copy. Windows are
"24h" / "8h", averages are "avg" in labels and "average" in prose, never
"mean". Copy constants live in `src/ui/labels.ts`.

## Comments

A comment carries the decision and the alternative that lost, not a
restatement of the code. Spec citations use the filename (`specs/28-mold.md
§5`). This is the convention most likely to erode silently and the one that
keeps the codebase legible to an agent six months later.
