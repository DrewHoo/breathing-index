# Measured pollen — three type rows via the relay

**Status:** in progress · **Revised 2026-08-11, pre-merge:** variables moved from type
level to *plant* level after the owner asked how a user would ever learn "birch and not
oak" — under type variables, never: birch and oak were one number. Types remain as the
three display rows; plants are what the engine reasons about · **Effort:** M · **Deps:** relay deployed ([15-premium-sources.md](15-premium-sources.md) §4, done), PR #20 (relay client plumbing) · **Supersedes:** the one-row/dominant-species display of [05-pollen.md](05-pollen.md) §4, by owner decision 2026-08-10; delivers the pollen half of [15-premium-sources.md](15-premium-sources.md) §3 (proxied key for everyone — no BYO tier yet, no Plus gate: there are no users to meter)

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
offers. v1 uses the per-plant indices as the exposure variables and the type
indices as the three rows' headlines; plant descriptions and photos stay
display depth for later (a tappable "which plants" detail).

## Design

1. **Plant variables, type rows, one scale.** The exposure variables are the
   catalog's plants (`pollen_birch`, `pollen_oak`, `pollen_ragweed`, … —
   src/sources/pollenPlants.ts), each UPI 0–5, from every source; the three
   rows display the type index as their headline and every plant reading in
   their sub-label ("birch 4 · oak 2"), so any number an evidence line cites
   is on screen. Types are *not* variables: a type is roughly the max of its
   plants, and two numbers that co-move by construction must never both be
   candidates — and only plant-level variables can ever answer "birch and not
   oak," which is a real and common shape of the disease. The engine's
   existing machinery does the separating: overlapping seasons still produce
   days where one plant's index diverges from another's, and candidate sets
   collapse on exactly those days — within a season for the common cases,
   "still untangling" honestly in between. New names on purpose: the old
   species variables (`grass_pollen` etc.) are grains/m³, and a diary entry
   holding `grass_pollen: 20` must never be compared against a UPI 3 wearing
   a similar name. Old variables retire from the live vector; entries that
   carry them keep them as inert history
   ([15-premium-sources.md](15-premium-sources.md) §6 backfill is the future
   path to re-grounding those, not a silent rescale).
2. **Sources, in order.** (a) Google via `/v1/pollen`, values used for the
   local dates it covers (today forward), provenance measured. (b) The
   spec-05 calendar, re-expressed on the UPI scale (`low→1, med→3, high→4` —
   low sits at the negligible floor exactly as its grains version did) and
   speaking three of the same plant variables natively (birch, graminales,
   ragweed — the species its seasons were always written in), for
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
4. **Engine config.** Per plant — floors: 1 (Very Low never suspects);
   priors: `{2: 3, 3: 4, 4: 5}` — Moderate is potentially a 2 for a sensitive
   person, High potentially a 3, Very High potentially a 4. One shared
   heuristic start; the diary is what makes birch and oak diverge, not the
   prior. Engine code: untouched (variables are data-driven; `estimated`
   grading already does what spec 05 built it for).
5. **UI: three rows** — Tree pollen / Grass pollen / Weed pollen, headline
   `N of 5` (the type index), sub-label the plant readings ("birch 4 ·
   oak 2"), the row's verdict tracking its highest plant, plus the
   "calendar estimate" note when the hour is running on fallback. A type with
   no reporting plant shows no row (out-of-season winter shows no pollen rows
   at all, matching spec 05's acceptance). The forecast why-sentence needs no
   change: it already names any variable the vector carries — now by plant
   ("Ragweed pollen is past…").
6. **Privacy page.** First feature where user traffic flows through the relay
   by default, so the relay paragraph lands here: requests for pollen (and
   station data) go to a relay we run; it receives coordinates rounded to
   ~11 km — sharper is refused in code — holds the keys, keeps no logs, and
   its source is public in this repo.

## Acceptance

- Norfolk, August: pollen rows appear with today's Google values, sub-labeled
  per plant ("ragweed 2"); a diary entry captures per-plant `pollen_*` values
  untagged (measured), and a confirmed *plant* bound is now reachable.
- The birch/oak question: given diary coverage of days where the two plants'
  indices diverge, the engine can confirm a birch bound while oak stays
  clear — the candidate-set machinery, no new engine code (fixture-testable
  once spring fixtures exist).
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

Plant-description detail UI (photos, cross-reactions, ID text); BYO-key
settings rows; Plus gating; historical backfill; relay-side payload trimming.
