# Viral season — a calendar term and a regional feed, ceiling only

**Status:** proposed · **Effort:** S for the calendar, M with the feed · **Deps:** [26-sick-as-signal.md](26-sick-as-signal.md) · **Priority:** medium. The one piece of the viral story that is precise enough to schedule.

## Problem

Spec 26 records "sick" when the user taps it. It records nothing about the season, and the season is the strongest signal in the viral literature that the app can know without being told: pediatric asthma emergency visits peak 17.7 days after Labor Day (95 % CI 16.8–18.5), adults 6.3 days later, at 2.2× background, with 20–25 % of the year's pediatric admissions falling in September. It is the school-return rhinovirus wave, not ragweed: in September 2020 with schools closed the rise was 6 % against 89–193 % in surrounding years.

The honest scale of it: community viral positivity explains 1.5–13 % of asthma visits in the one study that tested it directly (Satia 2020, 649,666 visits), and the population attributable fraction is about 32 %, not the 80 % that gets quoted. It multiplies allergen exposure rather than adding to it (virus × sensitization × exposure OR 8–19).

## Advantages

- The calendar term is free, precise to a day, and needs no feed: Labor Day is computable and the offset is published.
- Ceiling-only by construction: an `estimated` variable can suspect and never confirm, so the app never floors a day on a calendar.
- It explains the September wall a user sees every year without the app having to guess at rhinovirus.
- A regional feed exists that most people assume does not: CDC NREVSS publishes rhinovirus/enterovirus percent positivity weekly by HHS region (`rgnm-fkqb` on data.cdc.gov, keyless Socrata JSON). Connecticut is Region 1, New England.

## Challenges

- **Stickiness.** A near-binary variable can never be exonerated from candidacy under the 15 % noise margin (a tolerance at 1 guards at 0.91, and the next 1 clears it). For three weeks every bad day carries `viral_season` as one more candidate, and no fine day quiets it. That is the truth of a season, and it slows attribution for everything else elevated in September.
- **Estimated forever.** As a calendar term it is tagged `estimated`, so it can never confirm and never set a floor. The combo-repeat clause also refuses estimated constraints. So the term only ever raises ceilings; a user whose Septembers are reliably bad gets a "possible 3" and never a "will be 3" from it.
- **It is a pediatric curve.** The 17.7-day peak is school-age children; adults lag 6.3 days and the amplitude is smaller. One offset for everyone is wrong for someone.
- **The feed's resolution is the worst in the catalog.** NREVSS rhinovirus is published for the nation and ten HHS regions only; state rows exist only for RSV and SARS-CoV-2. It is lab-based with about a week's lag. No wastewater program tracks rhinovirus (respiratory-shed, not fecally shed). "Rhinovirus is up in New England this week" is the most it can say.
- **It is not `viral`.** The user's own "sick" tap is a fact about them; the season is a prior about everyone. They are different variables and must not share a name, or a fine September day would exonerate "I was sick."

## Design

1. **`viral_season`**, an `estimated` variable, 0–1: a bell around Labor Day + 17.7 days with a half-width of 10 days (`1` at the peak, `0.5` at ±10 days, absent beyond ±20 days). Computed from the entry's local date; no fetch. Floor 0.3; prior, ceiling only, `{2: 0.7}`. Not source-scoped. Tagged `estimated` on every hour that carries it.
2. **Adults**: a settings flag is out of scope; document the offset and revisit if the diary shows the peak landing late.
3. **Phase 2, the feed**: relay route `/v1/viral?region=` fetching `rgnm-fkqb` (`percent_pos` for `RHINOVIRUS/ENTEROVIRUS`, the HHS region from the location's state), cached 6 hours. `viral_region`, an `estimated` variable 0–1 scaled to the region's typical peak (percent positive / 30). Same floor and prior shape. The relay maps state → HHS region from a constant table.
4. **Rows**: no air-table row for either (they are not air). The diary evidence panel shows them conditionally; the forecast's "Why" line can name them ("it's the school-return virus season"). The glossary entry explains both and the 32 % number.
5. **Interaction**: nothing new. When the user also taps sick, `viral` (spec 26) is the measured half and the combo clause does the rest.

## Acceptance

- On 2026-09-24 (Labor Day + 17) `viral_season` is ≈ 1 and `estimated`; on 2026-10-20 it is absent; on 2026-09-04 it is ≈ 0.5.
- A bad day at `{pollen_oak: 4, viral_season: 1}` yields an ambiguous, estimated constraint that raises the ceiling and never the floor (fixture).
- Phase 2: a Connecticut location resolves to HHS Region 1 and the relay returns the latest week's rhinovirus percent positive with its week-ending date.

## Non-goals

Wastewater (no rhinovirus). Flu, RSV, COVID feeds (contribute almost nothing to asthma). Per-user age offsets. Anything that floors.
