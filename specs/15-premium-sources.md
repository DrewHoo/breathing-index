# Premium data sources — better air data as the paid upgrade path

**Status:** proposed · **Effort:** M · **Deps:** [05-pollen.md](05-pollen.md) (variable plumbing), [12-encrypted-sync.md](12-encrypted-sync.md) (tier + proxy backend) · **Priority:** later monetization — build after Plus exists

## Why

The model is only as good as its exposure vector, and the two biggest data gaps map to paid
APIs: real US pollen (Google Pollen API / Ambee) and hyperlocal particulate (PurpleAir).
Bring-your-own-key stays free forever (it already fits the plugin architecture and costs
nothing); the paid convenience is *my key, proxied* — most users will never create an API
account, and metered proxying is the standard shape for this.

## Design

1. **Source plugins finish becoming plugins.** The SPEC's `fetch(lat, lon) → {variable:
   {value, unit, time}}` interface exists informally; formalize it (`src/sources/`) so a
   source can contribute variables (pollen species, corrected PM2.5) with per-variable
   provenance (`model | station | sensor | calendar | estimated`) that the engine's evidence
   grading (spec-03) and the UI sub-labels already understand.
2. **PurpleAir plugin:** nearest-sensor query, EPA correction applied (the famous
   overread), shown as a second reading on the PM rows alongside the model value —
   disagreement display already exists for AirNow. BYO-key: free. Proxied: Plus.
3. **US pollen plugin:** Google Pollen API through the proxy (its pricing fits small scale);
   replaces the spec-05 calendar prior transparently — same variable names, provenance
   upgrades from `calendar` to `model`, engine trusts it accordingly.
4. **Proxy:** same Cloudflare Worker; per-account daily quotas; cache responses by
   (rounded-coordinate, hour) so N users in one city cost one upstream call — air data is
   spatially shared, which is what makes proxying economical at all.
5. **Settings UI:** sources list grows rows with a key field (BYO) or a "Plus" chip; each row
   states coverage and what it improves, in the existing laconic style.
6. **Historical backfill — score sources against the diary** (added 2026-08-08). Several
   sources expose history (Open-Meteo archive, AirNow observations-by-date, PurpleAir sensor
   history); diary entries carry timestamps and places. So we can retro-fetch what *each
   source* said at every logged moment and answer two questions no live view can: (a) which
   source's numbers best explain this user's ratings — the source-scoring receipt that decides
   what the engine should listen to; (b) when a user upgrades sources, re-ground their
   existing entries in the new source's terms so learned bounds migrate honestly instead of
   restarting cold (the bridge [03](03-engine-robustness.md)'s source-scoped bounds
   anticipates). Backfilled vectors are tagged `backfilled` provenance and re-run through
   inference as a parallel bound set — never silently overwriting the original vectors.
   Rate-limit friendly: one batch fetch per (source, place, day), cached forever — history
   doesn't change.

## Acceptance

- BYO PurpleAir key: corrected sensor PM2.5 appears beside model PM2.5; diary entries record
  both with provenance; no Plus required.
- Plus user, no keys: pollen + PurpleAir data flow through the proxy within quota; quota
  exhaustion degrades to model data with a quiet note, never an error wall.
- Proxy cache: two nearby users in the same hour produce one upstream call (verify in Worker
  logs).

## Non-goals

Reselling raw data; any source whose ToS forbids proxying (check PurpleAir's current terms
before building — if proxying is disallowed, PurpleAir stays BYO-key-only and the paid story
is pollen alone).
