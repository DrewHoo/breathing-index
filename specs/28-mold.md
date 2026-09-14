# Mold — take any measurement, run the proxy everywhere else

**Status:** proposed; source directory in [`research/mold-sources.md`](../research/mold-sources.md) · **Effort:** L · **Deps:** [23-dew-point-air.md](23-dew-point-air.md) (humidity retired), relay · **Priority:** high. Mold is the best-evidenced acute trigger after airway drying and the worst-served by data. One decision gates the plan (§1).

## Problem

Outdoor mold spores rival or beat pollen in asthma ED studies. Alternaria and near-fatal asthma: OR 190 (O'Hollaren 1991, wide interval, robust direction). Dales 2000/2004: every fungal group larger than any pollen group. Spores are 2–10 µm, small enough to reach the lower airway directly. Lag 0–2 days for Alternaria, 0–3 for Cladosporium.

No consumer API sells a trap-derived mold number. Every pollen API is a model with no mold field (Google, Ambee, Tomorrow.io, Open-Meteo). Ambee's marketing page says "mold spore counts"; its API docs don't. AccuWeather and weather.com sell modeled indexes. The measurements exist at NAB-certified counting stations and a scatter of hospitals, health departments and clinics that post a number on a web page, a PDF or a social feed. The research found about 80 stations worldwide with free, public, current numbers.

The app's current mold proxy, `humidity mean72h`, has the wrong sign for the spores that matter. Alternaria and Cladosporium are dry-weather spores. They peak on warm, dry, windy days in late summer and fall; rain suppresses them and raises basidiospores instead.

## Design

1. **The licensing question comes first.** The AAAAI National Allergy Bureau runs an undocumented public GraphQL endpoint, `POST https://pollen.aaaai.org/graphql/public`, no key, no rate limit observed, introspection on. It returns genus-level spore counts in spores/m³ for every NAB station with history to 1998, and it returns raw counts even for stations whose public page shows only Low/High. 19 US stations are mold-active within 30 days. That is roughly 55–60 % of the world's retrievable public mold in one client.

   The NAB's terms say any use without written consent is prohibited, and the data-release PDF says the AAAAI "chooses not to release data for commercial or for-profit use." The app is free today and has a supporter tier and a Plus tier in the spec queue ([16](16-supporter-tier.md), [13](13-forecast-alerts.md), [15](15-premium-sources.md)). So: write to the NAB Scientific Director before building on it, describing the app as a free personal tool with an optional supporter tier, and ask for a per-app exception. The precedent to cite: The Weather Company sells a licensed relay of this data (`U.S. Pollen Observations 1.0`, measured, "collects data from allergist offices"), so the AAAAI does license it commercially. Build the GraphQL client in parallel; it's small. If the answer is no, the fallback is §2 with about 8 US stations instead of 19, or TWC's relay, which is US-only, weekday-only, a single 0–4 mold index with the raw count dropped.

2. **Ingest anything, by shape rather than by station.** Four scraper shapes cover about 80 % of what exists: (a) the NAB GraphQL client; (b) an OGC WFS/GeoJSON client, which unlocks POLLnet Italy's 58 stations under CC-BY 4.0 and any other GeoServer; (c) a static-HTML extractor with per-site selectors and a date parser, which covers Houston Health Department (20 genera, weekdays, monthly XLSX history), St. Louis County (daily total since 1960, numeric count in an RSS feed), Children's Mercy Kansas City, Canton OH, Oklahoma City, La Crosse, Met Éireann, Kraków; (d) a generic JSON REST client for SAPNET South Africa and keyed vendor APIs. Headless-browser and PDF shapes are phase two. Each shape is one relay module; each station is a config row naming its shape, URL, selectors and units.

3. **Two precision tiers.** About half of what exists is spores/m³ and half is Low/Moderate/High with no published mapping. `mold` carries a `precision: 'count' | 'category'` field. Category readings map to the 0–5 index scale the pollen rows use and are `estimated`; counts are measured. Never fake a number from a category.

4. **Genus where the source has it.** `mold` is the total. `mold_alternaria` and `mold_cladosporium` appear when the station splits them (Houston, Children's Mercy, Canton, Sciensano, every NAB genus station). Same engine semantics as pollen plants under their type row.

5. **Station by distance, not by cell.** Counting stations are 50–100 miles apart. The user picks a station in Settings from the directory, nearest first, the way they pick a saved location. The relay fetches each subscribed station on a cron trigger (once a day covers weekday counts) and caches the parsed reading in KV under the station id, so N users of one station cost one fetch.

6. **The observation date is required.** The scraper stores the date the page states. A page with no date is a failed fetch, not a reading. The Asthma Center Philadelphia renders a live-looking mold category with no date on three pages; Waterbury Hospital has rendered a normal-looking count page for four years past its last reading (2022-08-19). A reading older than 3 days is `estimated` under the [18](18-measured-pollen.md) provenance rule, and the row shows the date.

7. **The proxy, everywhere without a station.** `dry_spore_index`, an `estimated` variable computed from weather the app already fetches: in the local season (northern temperate July–October), temperature above 20 °C, RH below 60 %, some wind, no rain in the last 48 h, and a wet spell in the last 7 days. Each condition is a factor; the product is a 0–5 index. It can suspect and never confirm, like the calendar pollen. Where a station exists it fills gap days.

8. **Test the hypothesis on what's already logged.** `unmodeled-trigger` conflicts are the missing-variable detector. Cluster them by month and by the proxy's conditions. If unexplained bad days pile up on August–October dry spells, that's mold's signature. A script over the exported diary, not a feature.

9. **Windows.** 3-day max for the measured variable (Cladosporium lag 0–3). The proxy is daily.

10. **Row.** "Mold" with the count or category, the genus split when available, the station name and the reading's date. With no station and in season, "Dry-spore conditions · estimate". Out of season, no row.

11. **Hamden.** No live station within reach. Waterbury is dead, and the nearest NAB mold stations are Olean NY and Silver Spring MD. The proxy is what Hamden gets until something changes.

12. **Outside the US and Europe.** One numeric source: Montevideo publishes daily Alternaria and Cladosporium in spores/m³ as open CKAN CSVs (shape d, trivially ingested, one city). South Africa is weekly and ordinal. Canada's real network (Aerobiology Research Laboratories) sells its data. Australia collects Alternaria at Deakin and gives it to the state health department, not the public. Asia publishes nothing. The non-US NAB stations are registrations, not data.

## Acceptance

- A user who picks a station sees a Mold row with the count (or category, labeled), the genus split when the station reports it, the station name and the reading's date.
- A reading older than 3 days, or a category reading, marks the variable `estimated`.
- A page with no parseable date produces no reading and a logged fetch failure.
- With no station the row is absent out of season and shows the proxy in season, labeled as an estimate.
- Fixture: rating 3 at `{mold: 3000}` measured, on an otherwise clean day, confirms mold at 3000. The same entry with `precision: 'category'` or the proxy caps at suspected-strong.
- Relay: one fetch per station per day regardless of user count.
- The NAB client is not enabled in production until written consent is on file.

## Non-goals

Indoor mold. Buying a spore trap. Paying AccuWeather or weather.com (a modeled index is a proxy with a price). Headless-browser and PDF scrapers in v1. Genus-level modeling in the proxy.
