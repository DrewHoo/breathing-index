# Premium data sources — better air data as the paid upgrade path

**Status:** proposed; §4 (relay) shipped, and the pollen half of §3 shipped via
[18-measured-pollen.md](18-measured-pollen.md) — no tiers or BYO keys yet, everyone rides the
proxied key while there is nobody to meter · **Effort:** M · **Deps:** [05-pollen.md](05-pollen.md) (variable plumbing), [12-encrypted-sync.md](12-encrypted-sync.md) (tier + proxy backend) · **Priority:** later monetization — build after Plus exists

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

7. **PurpleAir is no longer speculative — the regulatory network measurably misses days**
   (added 2026-09-16, evidence in [`research/proxy-validation.md`](../research/proxy-validation.md)).
   Five days on which the diary's owner had severe attacks were checked against both networks.
   On three of the four Ann Arbor days a sensor 1.2 miles away carried **1.6–2.1× the particle
   load of its own surrounding week**, and the regulatory monitors 6.5–24 miles away showed
   nothing unusual:

   | date | local PM2.5 median | its ±4-day window | ratio | regulatory daily mean |
   |---|---|---|---|---|
   | 2019-11-02 | 13.8 | 6.7 | **2.05×** | 6.5–9.2 (hourly max 12.9) |
   | 2020-08-23 | 16.1 | 10.1 | **1.59×** | 11.9–13.8 |
   | 2023-09-30 | 22.4 | 13.2 | **1.70×** | 13.0–15.4 |
   | 2024-09-15 | 16.6 | 16.4 | 1.02× | 8.0 |

   On 2019-11-02 the local sensor's *median* exceeded the regulatory network's *maximum hourly
   value* for the whole day. That is the day every official index called Good.

   The elevation is particles, not the `_atm` humidity artifact: sensor-internal RH on each day
   sits within 2 points of its window, so the same bias applies to both halves of every ratio.
   Absolute values still run high against FEM and need the EPA correction (§2) before they can
   sit beside a monitor reading on the same row.

   Two controls worth keeping. 2024-09-15 shows no elevation at 1.02× and it used the *closest*
   sensor (0.3 mi), so this is not a Burns Park quirk. Hamden on 2025-10-04 read 3.5 µg/m³,
   *below* its regulatory monitor's 9.6 — the correction cuts both ways.

   **What this changes:** hyperlocal PM stops being a nice-to-have and becomes the fix for a
   known defect. The app grades particles on a feed whose nearest instrument is miles from the
   user, and at least three times out of four that feed understated the air they were in.

8. **API notes for whoever builds it.** `GET /v1/sensors` with a bounding box returns
   `date_created` and `last_seen` per sensor, which is how you pick one that was alive on a past
   date — 24 sensors in the Ann Arbor box, 12 around New Haven, the oldest live since 2017.
   `GET /v1/sensors/:id/history` takes `average=10` for ten-minute means and returns
   **`pm10.0_atm` alongside `pm2.5_atm`**, so a coarse fraction is available at the user's own
   address, which the regulatory network cannot give: Washtenaw County has no PM10 monitor at
   all and the nearest two are 24 miles out on a 1-in-6-day schedule. Pull `pm2.5_cf_1` rather
   than `_atm` if you intend to apply the EPA/Barkjohn correction, which is defined on cf_1.
   A sensor created days before the date you want may return zero rows; fall back to an older
   one nearby rather than assuming the window is empty.

   One correction to the record: earlier research notes dismissed low-cost optical counters on
   the strength of the literature showing they cannot identify pollen taxa. That is true and
   irrelevant here. Identifying what a particle is and measuring how much mass is in the air are
   different jobs, and these sensors are only bad at the first one.

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
