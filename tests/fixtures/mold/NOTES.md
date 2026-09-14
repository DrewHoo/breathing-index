# Mold source shapes, verified live 2026-09-14 ~01:30 ET

Captures in this directory: stl.rss, houston.html (index), houston-day.html (one daily page), kc.html, canton.html, nab-station-ids.json.

The four HTML captures were trimmed in place on 2026-09-14 to the fragments the parsers read — each keeps the traps the tests exercise (Houston's older-format slug and its pollen lists, Children's Mercy's SkyCast date three days later, Canton's four species columns) and drops the chrome. Each is now under 16 KB; the RSS feed is untouched. The shapes below are as verified live.

## Shape: RSS — St. Louis County DPH
- URL: https://pollenandmold.stlouisco.com/Feed/RSS.aspx (HTTP 200, ~1.1 KB, one <item>)
- <title>: `Mold Count: 54862 (Very High)`  <pubDate>: `Fri, 11 Sep 2026 08:38:09`  <description>: `Air Quality for 9/11/2026: Green`
- Total only, spores/m³-ish count (units not stated), weekdays. History: sequential Pollen_Day.aspx?TargetID=N (13664 = 2026-09-11).

## Shape: static HTML — Houston Health Department
- Index: https://www.houstonhealth.org/services/pollen-mold — links like `/services/pollen-mold/houston-pollen-mold-count-friday-september-112026` (slug format inconsistent: `september-112026` vs `september-9-2026`, mixed-case `/Services/`). Crawl the index for the newest link; never construct the URL.
- Daily page text (after tag strip): `MOLD SPORES`, `LOW`, `5,116`, ... `Major mold spores counted`, `Algae: 0`, `Alternaria: 4`, `Ascospores: 3547`, `Basidiospores: 469`, `Cercospora: 56`, ... (20 genera). Numbers use thousands commas and `&nbsp;`.
- Date is in the slug/title. Weekdays.

## Shape: static HTML — Children's Mercy Kansas City
- URL: https://pollen.childrensmercy.org/ (one stable URL)
- Text: `Mold per m³ of air` … `KC Metro` … `59 (Moderate)` [pollen] … `12685 (Moderate)` [mold]; plus a `Top 5 Molds` table (`Mold | Count per m³ of air | Percent`).
- Weekdays. Date on page (verify selector).

## Shape: static HTML — Canton City Public Health (CivicPlus)
- URL: https://www.cantonohio.gov/2295/Daily-Spore-and-Pollen-Counts
- Text: `Species Present:` … `Cladosporium (4310)`, `Alternaria (360)`, `Unidentified Molds (4400)`, `Category: None Observed` (the category word is for pollen). spores/m³ rounded to 10. Mon–Fri, seasonal.

## Shape: GraphQL — AAAAI NAB (licensing-gated; build behind a flag, OFF in production)
- POST https://pollen.aaaai.org/graphql/public, content-type application/json, no auth.
- Stations: `{ stations(limit: 300) { id name city state country latitude longitude isOnMap } }` — note bogus coords exist (Alto Valle AR at 35.2,-91.8); London ON coded country US.
- Collection sets for one station (verified): 
  `{ allergenCollectionSets(limit: 2, order: "date desc", filter: "stationId == Guid(\"9eec5ce0-6c54-4f8e-bd16-2c9e85ae9820\") && date >= DateTime(2026,9,1)") { date station { name } allergenCollections { value allergen { name commonName category type } } } }`
  → date "2026-09-11", rows like {value: 591, allergen: {name: "Cladosporium", category: "MOLD", type: "SPORE"}}, {value: 210, name: "Penicillium / Aspergillus"}, pollen rows interleaved (category != MOLD).
- The `filter` string is dynamic-LINQ; quoted ISO dates break it.
- Station ids: City of Houston 9eec5ce0-6c54-4f8e-bd16-2c9e85ae9820; others in nab-station-ids.json.
- Terms: no use without written AAAAI consent; not for commercial use. Ship the client behind `MOLD_NAB_ENABLED` (worker env var / secret) defaulting off.

## Precision tiers
- count (spores/m³): St. Louis (total), Houston (total + 20 genera), KC (total + top 5), Canton (Cladosporium, Alternaria, Unidentified), NAB (genus).
- category only: many others (not in v1).

## Staleness rule
Store the observation date from the page/feed. No parseable date → failed fetch, not a reading. Waterbury Hospital renders a normal-looking page frozen at 2022-08-19.
