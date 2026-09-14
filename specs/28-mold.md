# Mold — take any measurement, run the proxy everywhere else

**Status:** built 2026-09-14. Source directory in [`research/mold-sources.md`](../research/mold-sources.md) · **Effort:** L · **Deps:** [23-dew-point-air.md](23-dew-point-air.md) (humidity retired), relay · **Priority:** high. Mold is the best-evidenced acute trigger after airway drying and the worst-served by data. One decision gates the plan (§1).

## Problem

Outdoor mold spores rival or beat pollen in asthma ED studies. Alternaria and near-fatal asthma: OR 190 (O'Hollaren 1991, wide interval, robust direction). Dales 2000/2004: every fungal group larger than any pollen group. Spores are 2–10 µm, small enough to reach the lower airway directly. Lag 0–2 days for Alternaria, 0–3 for Cladosporium.

No consumer API sells a trap-derived mold number. Every pollen API is a model with no mold field (Google, Ambee, Tomorrow.io, Open-Meteo). Ambee's marketing page says "mold spore counts"; its API docs don't. AccuWeather and weather.com sell modeled indexes. The measurements exist at NAB-certified counting stations and a scatter of hospitals, health departments and clinics that post a number on a web page, a PDF or a social feed. The research found about 80 stations worldwide with free, public, current numbers.

The app's current mold proxy, `humidity mean72h`, has the wrong sign for the spores that matter. Alternaria and Cladosporium are dry-weather spores. They peak on warm, dry, windy days in late summer and fall; rain suppresses them and raises basidiospores instead.

## Design

1. **The licensing question comes first.** The AAAAI National Allergy Bureau runs an undocumented public GraphQL endpoint, `POST https://pollen.aaaai.org/graphql/public`, no key, no rate limit observed, introspection on. It returns genus-level spore counts in spores/m³ for every NAB station with history to 1998, and it returns raw counts even for stations whose public page shows only Low/High. 19 US stations are mold-active within 30 days. That is roughly 55–60 % of the world's retrievable public mold in one client.

   The NAB's terms say any use without written consent is prohibited, and the data-release PDF says the AAAAI "chooses not to release data for commercial or for-profit use." The app is free today and has a supporter tier and a Plus tier in the spec queue ([16](16-supporter-tier.md), [13](13-forecast-alerts.md), [15](15-premium-sources.md)). So: write to the NAB Scientific Director before building on it, describing the app as a free personal tool with an optional supporter tier, and ask for a per-app exception. The precedent to cite: The Weather Company sells a licensed relay of this data (`U.S. Pollen Observations 1.0`, measured, "collects data from allergist offices"), so the AAAAI does license it commercially. Build the GraphQL client in parallel; it's small. If the answer is no, the fallback is §2 with about 8 US stations instead of 19, or TWC's relay, which is US-only, weekday-only, a single 0–4 mold index with the raw count dropped.

   **Built, and still off.** The GraphQL client exists behind `MOLD_NAB_ENABLED`, pinned to `"0"`; nothing is deployed with it on until written consent is on file. The client half needed one rule because of it: Houston and St. Louis are both a local health department *and* an NAB station, so with the flag on the directory holds two rows for one microscope. `nearestStations` collapses rows within ~2 km onto the ungated one (`src/sources/mold.ts`), because the ungated row is the one that survives the flag going off — a saved station that vanished on a config change would take the user's mold history with it.

2. **Ingest anything, by shape rather than by station.** Each shape is one relay module; each station is a config row naming its shape, URL and units. Four scraper shapes cover about 80 % of what exists: (a) the NAB GraphQL client; (b) an OGC WFS/GeoJSON client, which unlocks POLLnet Italy's 58 stations under CC-BY 4.0 and any other GeoServer; (c) a static-HTML extractor with a date parser; (d) a generic JSON REST client for SAPNET South Africa and keyed vendor APIs. Headless-browser and PDF shapes are phase two.

   **Built** (`worker/src/mold/`, one module and one test file each). A "static-HTML extractor with per-site selectors" turned out to be the wrong abstraction: the four pages have nothing structurally in common, and the shared part is small enough (tag stripping, entity decoding, thousands commas, `Month D, YYYY`) to live in `reading.ts` while each site gets its own module. So five modules, not a framework:

   | Module | Station id | Source | Reading |
   |---|---|---|---|
   | `rss.ts` | `stl-county` | St. Louis County DPH's RSS feed | total only, `units: 'count'` — the page never states a unit |
   | `houston.ts` | `houston-hhd` | Houston Health Department, two fetches | total + 20 genera, spores/m³ |
   | `kc.ts` | `kc-childrens-mercy` | Children's Mercy Kansas City | total + a rotating top five |
   | `canton.ts` | `canton-oh` | Canton City Public Health | Cladosporium / Alternaria / Unidentified; total is their sum |
   | `nab.ts` | `nab:<guid>` | AAAAI NAB GraphQL, 19 mold-active stations | genus-level, gated |

   No HTML parser dependency: the shapes are small and a regex over tag-stripped text is honest about being a scraper. Three of the four pages have a trap in them, and each is a test: Houston's slugs are hand-typed and inconsistent, so the newest day is found by crawling the index's links rather than constructing a URL; Children's Mercy renders a *later* regional forecast date a few lines below its own reporting date; Canton lays grass, tree, weed and mold out as four identical columns, mold last.

   The NAB rides `MOLD_NAB_ENABLED`, a plain `[vars]` entry in `wrangler.toml` pinned to `"0"`. Exactly `"1"` turns it on; `nab:` ids answer 403 `{"error":"nab disabled"}` and are absent from the directory until it does. §1 is unchanged: nothing is deployed with it on until written consent is on file.

3. **Two precision tiers.** About half of what exists is spores/m³ and half is Low/Moderate/High with no published mapping. `mold` carries a `precision: 'count' | 'category'` field. Category readings map to the 0–5 index scale the pollen rows use and are `estimated`; counts are measured. Never fake a number from a category.

   **Built, and unreached.** Every station in v1 publishes a number, so the category branch in feature extraction (`moldValue`, `src/sources/openMeteo.ts`) has never run against a real reading. It is there because the type allows it and half the world's mold is words. It also has a live problem the day a category station is admitted: the floors and priors in `engine/config.ts` are in spores/m³, so a 0–5 index graded against them sits below the floor forever. A category station needs its own variable or its own scale, and admitting one without that would be the row quietly going silent rather than saying "high".

4. **Genus where the source has it.** `mold` is the total. `mold_alternaria` and `mold_cladosporium` appear when the station splits them (Houston, Children's Mercy, Canton, Sciensano, every NAB genus station). Same engine semantics as pollen plants under their type row.

   **Built, as a client-owned map of exactly two keys** (`GENUS_VARIABLES`, `src/sources/mold.ts`). The relay slugs what the publisher wrote and deliberately does not canonicalise taxonomy — Houston writes `Dreshslera/Helminthosporium`, the NAB writes `Drechslera` — so the mapping table is the client's and it matches *exact* keys. Two traps it exists to avoid, both live: `ascospores` (Houston) and `ascospores_undifferentiated` (NAB) are one taxon under two spellings, and `alternaria_aspergillus_penicillium` (Children's Mercy, 378 spores) starts with "alternaria" and is three genera in one bucket. A prefix match would have filed that bucket as an Alternaria count and let the engine learn a bound from it. Everything else the stations count — ascospores, basidiospores, rusts, smuts — rides in the total and gets no variable, because no acute-asthma evidence attaches to it.

5. **Station by distance, not by cell.** Counting stations are 50–100 miles apart. The user picks a station in Settings from the directory, nearest first, the way they pick a saved location.

   **Built.** `GET /v1/mold/stations` returns the directory — `worker/src/mold/stations.ts`, one row per station with its name, city, coordinates, cadence, precision, units and genus slugs, and never its URL or parser shape — cached in KV for 24 h, keyed by the NAB flag's state so a flip is not hidden behind a day of stale menu. `GET /v1/mold?station=<id>` returns one normalised reading: `{ stationId, name, date, total, precision, category, units, genera, fetchedAt }`, cached under `mold:v1:{id}` for **6 h**. No cron: a cron would fetch every station in the directory whether anyone had chosen it or not, and pull-with-a-long-TTL gets the same "N users of one station cost one fetch" without scraping a health department's site on behalf of nobody. Six hours is four fetches a day against a page that changes once a weekday morning. An unknown id is 404, never an empty reading.

   Both routes take a station id and no coordinates, so they are routed *before* the relay's coordinate gate and keep only its origin gate — `/v1/mold?station=…` would otherwise 400 for the crime of not sending a location it has no use for.

   **The client half is a select in Settings**, under the saved places: the directory cached for a day (`breathing-index.moldStations.v1`), sorted nearest-first against the active location by Haversine, each row reading `{name} · {city}, {state} · {n} mi`, with "None" first and default. Nobody is seeded a station — the nearest one to Hamden is 300 miles away, and a count from Olean, NY offered as a default is the gaslighting this app exists to undo. The copy under it says the two things the picker cannot: stations are 50–100 miles apart, and switching stations starts mold's learned bounds over in practice, because two stations count different air with different microscopes and nothing in the model can see that they disagree.

6. **The observation date is required.** The scraper stores the date the page states. A page with no date is a failed fetch, not a reading. The Asthma Center Philadelphia renders a live-looking mold category with no date on three pages; Waterbury Hospital has rendered a normal-looking count page for four years past its last reading (2022-08-19). A reading older than 3 days is `estimated` under the [18](18-measured-pollen.md) provenance rule, and the row shows the date.

7. **The proxy, everywhere without a station.** `dry_spore_index`, an `estimated` variable computed from weather the app already fetches.

   **Built as a count, not a product.** Five conditions: temperature > 20 °C, RH < 60 %, wind > 2 m/s, under 0.5 mm of rain in the trailing 48 h, at least 5 mm in the trailing 7 days. The index is how many are met, 0–5. Multiplying five factors would put a number with four decimal places on a screen and claim a resolution the inputs do not have; "3 of 5" is what the thing actually knows. Season is by hemisphere off the location's latitude and the hour's local month — northern July–October, southern January–April — and out of season it is **absent, not 0**, because a February vector carrying a zero would read to every tolerance bound as a day this person handled fine.

   The wet-spell condition is why the weather feed is now asked for `past_days=7` where the air feed stays at 3. Floor 2 (two of the five are met on most days of the season — it is warm and it is windy), priors `{2: 4, 3: 5}`, and always `estimated`, so it can suspect a dry spell and never confirm one however often it repeats. It is computed whenever the season is on, station or no station: it is a different claim from a count, and where a station exists it fills the days between weekday readings.

8. **Test the hypothesis on what's already logged.** `unmodeled-trigger` conflicts are the missing-variable detector. If unexplained bad days pile up on August–October dry spells, that's mold's signature. A script over the exported diary, not a feature.

   **Built** as `scripts/mold-hypothesis.mjs`, which takes an export path, runs `buildModel` through the repo's TS resolver, and prints the unmodeled-trigger days: the Jul–Oct count against the rest of the year, a bar per month, and the dates themselves so they can be checked against the weather by hand. It clusters by month and not by the proxy's conditions — the proxy is computed from a weather feed the script has no access to, and refetching a year of hourly weather to answer a question the diary can answer badly on its own is the wrong shape for a script that exists to say whether this is worth pursuing.

9. **Windows.** 3-day max for the measured variable (Cladosporium lag 0–3). The proxy is daily.

   **Built, counting station days rather than calendar days.** Every station works weekdays, so a calendar window empties itself every Monday and would answer "no mold" on the day after a long weekend — a fact about the microscope, not about the air. The window is the three most recent days the station actually reported on or before the hour's local date; the staleness rule in §6 is what stops that reaching back a month. A reported day with a null total contributes nothing and is *not* staleness.

10. **Row.** "Mold" with the count or category, the genus split when available, the station name and the reading's date. Out of season, no dry-spore row.

    **Built as two rows, both shown when both exist.** The Mold row carries the 3-day max, the genus split as its sub-label (`cladosporium 591 · alternaria 4 · 3-day`), the station's own unit — "count" for St. Louis, which prints a number and never says per what — and a note reading `Houston Health Department · Sep 11`, plus `· estimate` when the reading has aged past three days. The Dry-spore row shows whenever the variable is in the vector, station or no station, rather than only in its absence: the engine grades it either way, and this app's standing rule is that an evidence line may only cite a number the reader can see on the screen.

11. **Hamden.** No live station within reach. Waterbury is dead, and the nearest NAB mold stations are Olean NY and Silver Spring MD. The proxy is what Hamden gets until something changes.

12. **Outside the US and Europe.** One numeric source: Montevideo publishes daily Alternaria and Cladosporium in spores/m³ as open CKAN CSVs (shape d, trivially ingested, one city). South Africa is weekly and ordinal. Canada's real network (Aerobiology Research Laboratories) sells its data. Australia collects Alternaria at Deakin and gives it to the state health department, not the public. Asia publishes nothing. The non-US NAB stations are registrations, not data.

## Acceptance

Every line below is met as built; the parenthesis says where.

- A user who picks a station sees a Mold row with the count (or category word, where a station ever publishes one), the genus split when the station reports it, the station name and the reading's date. (`buildAirRows`, `src/routes/index.tsx`)
- A reading older than 3 days, or read off a category word, marks every mold variable that hour `estimated`, and the row's note says so. (`moldWindow`, `src/sources/openMeteo.ts`)
- A page with no parseable date produces no reading: the relay answers 502 and the client answers `null`, which leaves the variable absent rather than zero. (`fetchMold`, `src/sources/mold.ts`)
- The dry-spore proxy is absent out of season and present in season, always labeled an estimate, with or without a station. (`drySporeIndex`, `src/sources/openMeteo.ts`)
- Fixture: rating 3 at `{mold: 15000}` measured, on an otherwise clean day, confirms mold at 15000. The same entry tagged `estimated` caps at suspected-strong and stays there however often it repeats. (`tests/fixtures/trigger-cases.json`)
- Relay: one fetch per station per six hours regardless of user count — four a day against a page that changes once a weekday morning (§5).
- The NAB client is not enabled in production until written consent is on file. `MOLD_NAB_ENABLED` is `"0"` in `worker/wrangler.toml`, and gated rows are absent from the directory rather than listed and refused.
- The station picker is a select in Settings, nearest first with the distance on each row, "none" first and default. (`MoldStationSection`, `src/routes/settings.tsx`)

Changed from the original list: the fixture's count moved from 3,000 to 15,000 — 3,000 spores/m³ is a quiet morning in Houston and below the AAAAI's own Low/Moderate line, so the case now sits inside the band it is meant to exercise. And "with no station the row is absent out of season and shows the proxy in season" became §10's two-row rule: the proxy row shows in season whether or not a station is chosen, because the engine grades the variable either way and every graded number owes the reader a row.

## Non-goals

Indoor mold. Buying a spore trap. Paying AccuWeather or weather.com (a modeled index is a proxy with a price). Headless-browser and PDF scrapers in v1. Genus-level modeling in the proxy.


## Amended 2026-09-14: the carried days draw dotted

Drew: a flat line across the days after a count "feels lame" and claims a
count nobody took. Each hour now says whether its raw mold number is a copy
of an earlier day's count (`Hour.carried`), and the sparkline draws those
hours dotted from the last real point, ending in an open circle rather than a
filled one. Dotted, not dashed, because dashes on the sparkline already mean
the waterline. The number on the row is unchanged; only the drawing admits
which part of it was read and which part was copied. The cone Drew asked
about is deferred until the reading store holds a season of counts to size
it from.
