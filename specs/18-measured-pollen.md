# Measured pollen — three type rows via the relay

**Status:** in progress · **Effort:** M · **Deps:** relay deployed ([15-premium-sources.md](15-premium-sources.md) §4, done), PR #20 (relay client plumbing) · **Supersedes:** the one-row/dominant-species display of [05-pollen.md](05-pollen.md) §4, by owner decision 2026-08-10; delivers the pollen half of [15-premium-sources.md](15-premium-sources.md) §3 (proxied key for everyone — no BYO tier yet, no Plus gate: there are no users to meter)

## Problem

The pollen row is wallpaper. The calendar prior ships a month-constant number
("ragweed 10 grains/m³, calendar estimate") that cannot explain any particular
bad day, never contradicts anyone, and is `estimated` forever, so no pollen
bound can ever confirm. Meanwhile the Google Pollen API — key restricted,
quota-capped, cached behind `/v1/pollen` on the relay — returns real daily
per-type indices for the US (and ~65 countries) that nothing reads.

## What Google actually returns (verified against the live relay, Aug 2026)

Per day, up to 5 days: `pollenTypeInfo[]` for **TREE / GRASS / WEED**, each
with `inSeason` and a Universal Pollen Index (`indexInfo.value`, integer 0–5,
with category words None→Very High) — *a type with no data omits `indexInfo`
entirely*, which must read as "no row", not zero. Plus `plantInfo[]`: per-plant
UPI and season flags for region-relevant species (ragweed, oak, birch, elm,
cottonwood, graminales…), each with a `plantDescription` (family, season,
identification text, cross-reactions, photo URLs). No grains/m³ anywhere: UPI
is an index. We spent spec 11 removing index vocabulary from the air table, but
pollen has no concentration unit an end user could independently check anyway;
0–5 with the category word is the honest ceiling of what any consumer source
offers. v1 uses type-level UPI + in-season plant names; per-plant indices and
descriptions are display depth for later (a tappable "which plants" detail),
not exposure variables.

## Design

1. **Three new variables, one scale.** `pollen_tree`, `pollen_grass`,
   `pollen_weed`, each UPI 0–5, from every source. New names on purpose: the
   old species variables (`grass_pollen` etc.) are grains/m³, and a diary entry
   holding `grass_pollen: 20` must never be compared against a UPI 3 wearing
   the same name. Old variables retire from the live vector; entries that carry
   them keep them as inert history ([15-premium-sources.md](15-premium-sources.md) §6
   backfill is the future path to re-grounding those, not a silent rescale).
2. **Sources, in order.** (a) Google via `/v1/pollen`, values used for the
   local dates it covers (today forward), provenance measured. (b) The
   spec-05 calendar, re-expressed on the UPI scale (`low→1, med→3, high→4` —
   low sits at the negligible floor exactly as its grains version did), for
   dates Google doesn't cover (the past-48h tail) and whole fetch failures,
   `estimated`-tagged per hour exactly as today. (c) CAMS Europe species
   pollen: **deleted**. Google covers Europe; one pipe, one scale.
3. **Windows.** Pollen values are daily: an hour's exposure is its local
   date's UPI, no max8h (a daily figure smeared through a running max is just
   the same number). The null discipline holds: a type Google omits is absent
   from the vector, not zero. Observed in verification: Google's forecast
   window appears to open on the *UTC* day, so late-evening local hours (a
   Norfolk 11 PM is already tomorrow in UTC) can fall to the calendar until
   local midnight — visible as the "calendar estimate" note, honest, and
   self-healing at the day boundary.
4. **Engine config.** Floors: 1 (Very Low never suspects). Priors:
   `{2: 3, 3: 4, 4: 5}` — Moderate is potentially a 2 for a sensitive person,
   High potentially a 3, Very High potentially a 4. Heuristic starts, same
   epistemic status as the weather rows. Engine code: untouched (variables are
   data-driven; `estimated` grading already does what spec 05 built it for).
5. **UI: three rows** — Tree pollen / Grass pollen / Weed pollen, value shown
   as `N of 5`. Sub-label: the in-season plant names Google lists for that
   type ("ragweed · nettle"), or "calendar estimate" when the hour is running
   on fallback. A type at 0 or without data shows no row (out-of-season winter
   shows no pollen rows at all, matching spec 05's acceptance). The forecast
   why-sentence needs no change: it already names any variable the vector
   carries.
6. **Privacy page.** First feature where user traffic flows through the relay
   by default, so the relay paragraph lands here: requests for pollen (and
   station data) go to a relay we run; it receives coordinates rounded to
   ~11 km — sharper is refused in code — holds the keys, keeps no logs, and
   its source is public in this repo.

## Acceptance

- Norfolk, August: three rows appear with today's Google values (weed in
  season, named "ragweed"); a diary entry captures `pollen_*` values untagged
  (measured), and a confirmed pollen bound is now reachable.
- Relay down or quota spent: rows fall back to the calendar on the UPI scale,
  sub-labeled "calendar estimate", `estimated`-tagged; entries logged that day
  can seed but never confirm — bit-for-bit the spec-05 behavior.
- Out-of-season winter (Google returns 0s/omissions): no pollen rows.
- Old diary entries with `grass_pollen`/`birch_pollen`/`ragweed_pollen` still
  render wherever entries are shown and never join a candidate set with the
  new variables.
- `npm test` covers: payload parse (real-shape fixture), calendar band→UPI
  mapping, date-keyed hour assignment, fallback tagging.

## Non-goals (v1)

Per-plant exposure variables; plant-description detail UI; BYO-key settings
rows; Plus gating; historical backfill; relay-side payload trimming.
