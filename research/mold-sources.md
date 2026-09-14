# Global directory of published outdoor mold / fungal-spore measurement

Survey date: 13–14 September 2026. Agent-written (Claude Opus research sub-agent), relayed with HTML-entity cleanup only. Everything below was loaded live. Where a page could not be loaded (403, TLS, JS-only) it is labeled as such rather than guessed. Feeds [specs/28-mold.md](../specs/28-mold.md).

## The headline

Outdoor mold is measured in far fewer places than pollen, and published in fewer still. The practical universe of free, public, machine-readable, currently-fresh mold numbers is roughly **80 stations worldwide**, and **one API covers the majority of them**.

**The AAAAI National Allergy Bureau runs an unauthenticated, un-rate-limited public GraphQL API** at `https://pollen.aaaai.org/graphql/public` that returns genus-level spore counts for every station, with history back to 1998. It is not documented anywhere. It is also legally encumbered; see the caveat in §2.

---

## 1. Meta-indexes (the lists somebody already maintains)

| Index | What it actually is | Mold flagged? | Access | Verdict |
|---|---|---|---|---|
| **AAAAI NAB** — `pollen.aaaai.org` | 219 station records, 73 on-map, 56 with data in the last 12 months. The hub every US clinic defers to | **Yes** — `AllergenCategory: MOLD`, `AllergenType: SPORE` | Vue SPA; **public GraphQL behind it** | **The real one.** Best meta-index in the world for mold |
| **POLLnet** (ISPRA/SNPA, Italy) | National station index with a working open-data layer | Yes (Alternaria only) | WFS/GeoJSON, CC-BY 4.0 | **Second-best.** Index and data in one place |
| **EUMETNET AutoPollen** — `autopollen.net` + NILU THREDDS | Coordinating programme for automatic pollen and spore monitoring; 31 station files | Yes, BAA500 stations only | `catalog.xml` → OPeNDAP | Small but machine-readable |
| **EBAS-NRT** — `ebas-nrt.nilu.no/api/stations` | Undocumented public GeoJSON, 54 stations | Station discovery only | No auth | Discovery layer, 4-week window |
| **European Aeroallergen Network (EAN)** | 38 countries, 600+ sites (~400 active), up to 226 particle types incl. fungal spores | Yes | **Login-gated Java app, no API**, non-commercial, per-trap requests | Largest inventory, least usable |
| **EAACI TF-40108 Worldwide Pollen Map** (`zaum-online.de`) | Maintained global station map | No per-station spore flag | Cookie-gated embed | Pollen-focused |
| **Buters et al. 2018**, *Clin Transl Allergy* (PMC5883412) | 879 active stations enumerated by continent | "about 50% of those stations that are open also monitor fungal spores" | Open access | The field's own census |
| **"Aerobiology in Africa"** review, *Aerobiologia*, Jul 2026 (PMC13379475) | Names all three continuous African networks | Yes | Open access | Definitive for Africa |
| Aerobiology Research Laboratories station list | 31 named Canadian stations | Yes (counted, not published) | HTML | Index is real; data is sold |
| **NEMSR** (AusPollen register) | — | — | 302s to an unrelated BoM page | **Dead** |

---

## 2. North America — the AAAAI NAB

219 station records exist; 56 reported anything in the last 12 months; **24 reported mold at least once; 19 are mold-active within 30 days.** All values below came from the GraphQL API.

**Units:** spores/m³, 24h integrated (Hirst/Burkard/Rotorod). **Cadence:** weekdays, typically. **History:** 167,869 collection sets back to **1998-06-28**, retrievable in bulk (7,619 sets — one year, all stations — in a single 27 MB request).

| Station | City | ST | Mold taxa | Latest mold reading observed | Own public site |
|---|---|---|---|---|---|
| Medical Sciences Campus, UPR | San Juan | PR | 27 | **2026-09-13** | rcm.upr.edu |
| Theodore J. Chu, MD | San Jose | CA | 26 | **2026-09-13** | chuallergy.com |
| Caguas Station | Caguas | PR | 25 | **2026-09-13** | — |
| STAAMP Research | San Antonio | TX | 1 | **2026-09-13** | staampallergy.com/pollen-count |
| City of Houston | Houston | TX | 19 | 2026-09-11 | houstonhealth.org |
| Saint Louis County Health Dept | St. Louis | MO | 23 | 2026-09-11 | pollenandmold.stlouisco.com |
| Fred H Lewis, MD | Olean | NY | 13 | 2026-09-11 | — |
| Allergy & Asthma Ctr of Georgetown | Austin area | TX | 1 | 2026-09-11 | georgetownallergy.com |
| US Army Centralized Allergen Extract Lab | Silver Spring / DC | MD | 18 | 2026-09-11 | — |
| University of Nevada Las Vegas | Las Vegas | NV | **30** | 2026-09-10 | unlv.edu/publichealth/pollen |
| Oklahoma Allergy & Asthma Clinic | Oklahoma City | OK | 22 | 2026-09-10 | oklahomaallergy.com |
| Allergy, Sinus & Asthma Professionals | Melrose Park (Chicago) | IL | 20 | 2026-09-10 | asapillinois.com |
| Wilford Hall ASC | San Antonio | TX | 14 | 2026-09-10 | — |
| Allergy Clinic of Tulsa | Tulsa | OK | 18 | 2026-09-09 | (site 403s) |
| University of Nebraska Medical Center | Omaha | NE | 1 | 2026-09-08 | — |
| Kagen Allergy Clinic | Appleton | WI | 19 | 2026-09-08 | kagenallergy.com |
| Allergy Partners of Charleston | Charleston | SC | 8 | 2026-09-04 | charlestonallergy.com |
| Allergy & Asthma Care of Waco | Waco | TX | 16 | 2026-09-02 | — |
| Mayo Clinic Arizona | Scottsdale | AZ | 24 | 2026-08-30 | — |
| Allergy & Asthma Specialists PSC | Owensboro | KY | 1 | 2026-08-10 | *(34 d — marginal)* |
| University of South Florida | Tampa | FL | 18 | 2026-07-28 | *(dormant)* |
| Asthma and Allergy of Idaho | Coeur d'Alene | ID | 5 | 2026-05-05 | *(dormant)* |
| University of PR in Mayagüez | Mayagüez | PR | 25 | 2026-04-12 | *(dormant)* |

**NAB stations that are active but publish POLLEN ONLY** (no mold ingest): Atlanta Allergy (Marietta GA), Waco Station 1, Kean Center (Union NJ), Greenfield WI, Greenville SC, La Crosse WI, Family Allergy (N. Kentucky), Riverton UT, UW Madison, Reno NV, Eugene OR, Dartmouth Hitchcock NH, Rochester NY, Fordham (New York NY), VCU Richmond, Colorado Springs, Armonk NY, Mayo Austin MN, Anchorage ×2, San Jose Station 2, Vanderbilt Nashville, Missoula MT, Birmingham AL, Fairbanks AK, Jacksonville FL, Seattle WA, Portland OR, Bellevue NE, London ON.

### The NAB API, concretely

- Endpoint: `POST https://pollen.aaaai.org/graphql/public`, `Content-Type: application/json`. No key, no cookie, no User-Agent requirement. Five rapid calls all returned 200; no rate limiting observed. Introspection is enabled.
- Queries: `stations(limit:500){...}`, `allergenCollectionSets(limit, order:"date desc", filter:"date>=DateTime(2026,9,1)"){date station{...} allergenCollections{value allergen{name commonName category type}}}`. The `filter` argument is a **dynamic-LINQ string** — `date>=DateTime(2026,9,1)` works; quoted ISO dates break the parser.
- **It returns more than the website shows.** Stations whose `displayType` is `SEVERITY_LEVEL` (the UI renders only Low/High) still return raw genus counts via the API. Verified: Melrose Park IL, 2026-09-10 — Cercospora 297, Drechslera 347, Ganoderma 396, Alternaria 99.
- Data-quality traps: one record dated `0202-11-05`; `website` is a non-null String that errors for 5 stations; London, Ontario is miscoded `country: "US"`; there is a live "Test Station 3 (NEW)" in Milwaukee.

### The legal caveat

The NAB landing page states: *"Any use of this information, in whole or in part without the prior written consent of the American Academy of Allergy, Asthma & Immunology is strictly prohibited."* The NAB Data Release PDF is blunter: **"As a 501(c)(3) organization, the AAAAI chooses not to release data for commercial or for-profit use."** Requests for two or more stations go to the Scientific Director and then the AAAAI Board.

So: the easiest ingest on earth, and explicitly off-limits to a commercial app without a negotiated exception. That is a business conversation, and it should happen before anything gets built on it.

---

## 3. North America — local publishers (independent of, or better than, their NAB entry)

| Institution | City | ST | Mold level | Units | Cadence | Latest observed | Access | Scrape | History |
|---|---|---|---|---|---|---|---|---|---|
| **Houston Health Department** | Houston | TX | **20 named genera + total** | spores/m³ + band | Mon–Fri | **2026-09-11** (total 5,116) | HTML list, one page/day; **monthly .xlsx archives** | **easy** — slugs are inconsistent (`september-112026` vs `september-9-2026`, mixed-case `/Services/`), so crawl links, never construct URLs | **Yes**, monthly Excel |
| **Children's Mercy Hospital** | Kansas City | MO | Named genera + total | per m³, 24 h median | Weekdays | **2026-09-11** (total 12,685) | HTML, one stable URL | **easy** | not verified |
| **Canton City Public Health** | Canton | OH | Cladosporium, Alternaria, Unidentified | spores/m³ (nearest 10) | Mon–Fri, seasonal | **2026-09-11** | HTML (CivicPlus) | **easy** | none |
| **St. Louis County DPH** | St. Louis | MO | **Total only** on the public page | count (units not stated) | Weekdays | **2026-09-11** (mold 54,862) | ASP.NET HTML + **RSS feed carrying the numeric count** + sequential `Pollen_Day.aspx?TargetID=N` | **easy** — IDs walk back: 13664 = 2026-09-11, 13000 = 2024-01-26, 10000 = 2012-03-02 | **Yes — since 1960** |
| Theodore J. Chu MD | San Jose | CA | Total + predominant genus | per m³/24 h | Daily | 2026-09-12 | HTML prose line | fragile — regex a sentence | no |
| Oklahoma Allergy & Asthma | Oklahoma City | OK | Total, **category only** | Absent→Very High | Daily | 2026-09-10 | HTML dated list | easy | yes |
| Allergy Assoc. of La Crosse | Onalaska | WI | Total, category | "High" | Daily Mar–Oct | 2026-09-13 | HTML, `/forecast/MM-DD-YYYY/` permalinks | easy | yes |
| Carolina Asthma & Allergy | Charlotte | NC | Total, category | scale 1–24/25–49/50–74/75+ | Daily Feb 15–Nov 15 | 2026-09-11 | HTML widget | fragile | no |
| Atlanta Allergy & Asthma | Atlanta | GA | **"Mold Activity", category only** (pollen is numeric) | — | Weekdays | 2026-09-11 | HTML + `/index/YYYY/MM` calendars | easy | **yes**, monthly |
| Asthma & Allergy Associates | Colorado Springs | CO | Total, category | — | Seasonal | 2026-09-02 | HTML | easy | no |
| **The Asthma Center** | Philadelphia | PA | Total, category | — | Daily + email | **no date rendered on any of 3 pages** | Icon images; now "machine-learning equipped sensors" | **fragile** — undated, cannot distinguish fresh from stale | no |
| austinpollen.com | Austin | TX | Total, category ("Molds are moderate") | — | Sub-daily | **2026-09-13 20:38** | HTML text; charts are JS | fragile | no |
| PollyMap | 6 partner sites | — | Category, weekly | — | Weekly | Statesville NC 2026-09-11 | HTML | fragile | unclear |

**Claims mold, renders none (needs a headless browser):** Loyola/Gottlieb Melrose Park (count goes to X/Threads @LoyolaAllergy); STAAMP San Antonio (JS dashboard); UNLV (daily goes to NAB; annual PDFs 2015–2026 on-site); UK HealthCare Lexington (raw page has an expired TLS cert); Tulsa Air Quality (JS stub); Central Coast Allergy (Salinas); Asthma & Allergy Center (Bellevue NE).

**Named targets, resolved:** San Antonio's `sanantonio.gov` pollen URL 301s to a generic Metro Health page with no counts; the real station is STAAMP. **No City of Dallas, Tarrant County, or DFW mold count exists** that could be found. **No NYC-area mold publisher**: Armonk/Brooklyn/Albany return no NAB data, and NYC allergist pages relay the Google Pollen API.

---

## 4. Europe

**Mold-publishing, verified:**

| Institution | Region | Country | Mold taxa | Units | Cadence | Latest observed | Access | Scrape | History |
|---|---|---|---|---|---|---|---|---|---|
| **POLLnet / ISPRA** | ~58 stations national | IT | **Alternaria only** (+ generic `Spore` parent). Cladosporium absent | particles/m³ daily mean | Daily, ~8-day lag | **2026-09-05**, 58 stations; Macerata 424, Treviso 576, Piacenza 2,442 | **WFS GeoJSON/CSV/XLSX**, CC-BY 4.0 | **easy** | Yes, CQL date-filtered |
| **Sciensano AirAllergy** | Brussels, Baudour, Genk, De Haan, Marche | BE | **Cladosporium + Basidiospores** separately | spores/m³ | Daily | 2026-09-10 | HTML + JS chart payloads | **fragile** — values live in chart JSON | 2016–2025 means plotted |
| **Red PALINOCAM** | 4 Madrid stations | ES | **Alternaria** | spores/m³, daily | Weekly (Tuesdays) | Week 36/2026 | PDF, text layer | fragile — URL carries a rotating `VersionId` | Annual PDFs 2020–25 |
| **SEAIC** | **70 stations** national | ES | `Alternaria (hongo)`, 1 of 22 taxa; no Cladosporium | Numeric (charted) | Daily | couldn't read — never enters HTML | **Meteor DDP websocket** | **hard** — needs a DDP client or headless browser | Yes |
| ARPAT Toscana | Arezzo, Firenze, Grosseto, Siena | IT | Alternaria | not stated | Weekly | 31 Aug–6 Sep 2026 | Spore-bulletin PDF | fragile | 150+ bulletins |
| Astma-Allergi Danmark | Copenhagen, Viborg | DK | **Alternaria + Cladosporium** separately | Category; weekly PDFs carry døgntal | Daily + weekly | 2026 weeks 2–36 | JS page (renders empty) + weekly PDF | hard / fragile | Yes |
| Univ. of Worcester (NPARU) | UK regions | UK | Alternaria, Cladosporium, Epicoccum, Aspergillus | Category | Weekly, seasonal | mid-Sep 2026 | HTML narrative | fragile | no |
| Met Éireann | 4 provinces | IE | Alternaria + Cladosporium, grouped | Category L/M/H/VH | Daily, 3-day | **2026-09-15** | Clean HTML table | **easy** | no |
| Jagiellonian Univ. (Toksy-Alergo) | Kraków | PL | Alternaria + Cladosporium | Category | Daily | 2026-09-09 | 3-column HTML table | **easy** | not observed |
| polleninformation.at | AT + multi-country | AT | "Pilzsporen (Alternaria)", `poll_id` 23 | **Index 0–4 only** | Daily, 4-day | live 2026-09-14 | **JSON API** | easy — **API key + non-commercial only** | no |
| PIA / UAB | 9 Catalan + Inca | ES | "pollen and spores" | Weekly levels | Weekly | current week | **XML API**, CC BY-NC-SA | easy | not documented |
| PID (Pollenstiftung) | ~45 German stations | DE | Alternaria, Cladosporium, Epicoccum | **Prose, no numbers** | Weekly | 2026-09-10 | HTML narrative | **hard** | archive exists |
| Pylová informační služba | 11–12 stations | CZ | "spory plísní", unnamed, no numbers | Prose | Weekly | 7–13 Sep 2026 | HTML narrative | hard | archive |
| NNK | 21 stations | HU | Alternaria (1 of 26) | not confirmed | Daily | not observed | HTML | fragile | unknown |

**Confirmed pollen-only:** MeteoSwiss/SwissPollen (7 pollen taxa; fungal spores "being developed"), DWD, ePIN Bayern public site, Met Office (states Worcester "remains the only source for fungal spore forecasts in the country"), NAAF Norway, Pollenrapporten Sweden, LUMC/Elkerliek NL, Štampar HR, SPAIC PT, Google Pollen API, CAMS/Copernicus (Alternaria "currently being implemented").

**France.** RNSA is liquidated; `pollens.fr` 301s to Atmo France. A 2 March 2026 order moved pollen and moisissures surveillance to the regional AASQA associations, but the Atmo Data API spec contains zero occurrences of moisissure/alternaria/cladosporium/spore and its WFS exposes 4 pollen-index layers only. `data.gouv.fr?q=moisissures` returns exactly one dataset: the **historical RNSA archive, 1987–2024, published 2025-07-17, not updated**. Backfill only.

---

## 5. Rest of world

| Institution | Region | Country | Mold? | Units | Cadence | Latest observed | Access | Scrape | History |
|---|---|---|---|---|---|---|---|---|---|
| **SAPNET / The Real Pollen Count** | 9 SA cities | ZA | **Yes**, single "Moulds" category | Bands (Low 0–900, Mod 900–2500, High 2500–25000 per m³) — **published as words** | **Weekly** | **2026-09-11** | **Undocumented working WP REST API**: `pollencount.co.za/wp-json/wp/v2/report` | **easy** — but "Moulds were low", never a number | ~25 pages back to ~2021 |
| **Aerobiology Research Laboratories** | 31 Canadian stations | CA | **Yes, counted** — Ascomycetes, Basidiomycetes, Deuteromycetes; "Routine count – Spores only $29" | particles/m³ | Daily | **none published on the web** | Data **sold**; free tier in their mobile app only | **impossible** | 10–21 yrs/station, commercial licence |
| The Weather Network (licensed ARL) | Toronto, Montréal | CA | **No** — mold stripped | categorical | Daily | 2026-09-13 | HTML | fragile | 3-day |
| **Deakin AIRwatch** | Melbourne, Geelong | AU | **Collected, not published** | grass pollen only publicly | 1 Oct–31 Dec | "CURRENTLY NOT AVAILABLE" | F5/Shape bot defence | hard | no |
| REMA / UNAM | 12 Mexican stations | MX | **Not on the homepage** | — | Daily | **2026-09-06** | HTML + per-station "Semáforo" | fragile | — |
| Melbourne Pollen, Canberra, Sydney, Perth, AusPollen Brisbane | AU | AU | **No.** | category | Daily seasonal | 2026-09-14 | HTML | fragile | no |
| Tokyo Metropolitan Govt | Tokyo | JP | **No** — 6 pollen taxa | 個/cm² | Weekly | 2026-09-06 | Server-rendered table | easy, but pollen | yes |
| KMA health weather index | KR | KR | **No**, modelled | 4-level index | 2×/day | 2026-05-03 | JS-filled | fragile | via open data |
| Beijing Municipal Met. Service | Beijing | CN | **No** | 粒/m³ | Daily Mar–Oct | 2026-05-10 via Sina relay | **WeChat mini-program only** | **impossible** | — |
| İzmir / Ankara (Ege, Ankara Univ. + MGM) | TR | TR | **No** | colour bands | Daily / seasonal | 2026-09-14 | Colour image cards | fragile | no |
| SAFAR / IITM; PGIMER CHAMP | IN | IN | **No** | — | — | — | HTML | — | papers only |
| Taiwan MoE air network | TW | TW | **No** bio-aerosols | µg/m³ | Hourly | — | ASPX | easy, irrelevant | yes |

**New Zealand is unverified.** Argentina, Brazil, Chile, Colombia were not reached beyond the NAB's dormant Argentine stations. Israel 403s. These are gaps, not negative findings.

---

## 6. Automated sensor networks

**One** automated network publishes retrievable spore numbers: the EUMETNET AutoPollen NRT archive on NILU's THREDDS server, and only its Helmut Hund BAA500 stations carry spore variables (`spores_fungi_amean`, `spores_fungi_alternaria_amean`, units `1/m3`, 3-hourly). 31 dataset files, no auth.

| Station | Location | Country | Latest data | Since |
|---|---|---|---|---|
| DE0054R | Zugspitze-Schneefernerhaus | DE | 2026-07-15 | 2024-03-05 |
| FI0096G | Pallas | FI | 2026-07-10 | 2024-09-19 |
| DE0212U | Berlin Tempelhof | DE | 2026-03-11 | 2024-07-11 |
| ES0047R | Córdoba | ES | 2026-02-18 | 2024-03-05 |
| DE0203U | München Biedersteiner | DE | 2025-11-18 | 2023-10-28 |

Gotcha: filenames embed a revision timestamp and change on every update; parse `catalog.xml` each run.

**Everything else automated is unusable for ingestion.** Swisens Poleno files (15 Swiss + FI, BE, SE, FR, ES stations) update daily and contain zero spore classes. Plair Rapid-E (Serbia, Lithuania): 22 pollen taxa, no spores. Bavaria's ePIN portal hides the spore data its BAA500s publish to EBAS. Yamatronics KH-3000 is sized for Cryptomeria pollen. DMT WIBS gives generic fluorescence classes.

**Pollen Sense (US)** is the one commercial exception: genus-level automated mold including Alternaria, hourly, with an API and CSV feeds, powering KXAN Austin and FOX4 Kansas City and a Washington State DOH deployment. `sensors.pollensense.com/api/sites` returns `401 {"Title":"Missing API Key"}`. Real mold data, entirely gated.

**Research repositories:** the Global Spore Sampling Project (47 sites, Zenodo + ENA, CC-BY) is fungal DNA/ITS2 relative abundance, not spores/m³. NILU's full EBAS archive has no API and is non-commercial scientific use only.

---

## 7. Consumer aggregators — is any of the "mold" real?

| Vendor | Mold field | Trap-based? | Evidence |
|---|---|---|---|
| **Pollen.com / IQVIA** | **None** | — | No mold anywhere on a loaded forecast page |
| **WeatherBug** | **None** | — | Pollen index 0–12+, no mold |
| **Google Pollen API** | **None** | — | Grass, Weed, Tree only |
| **Open-Meteo** | **None** | — | Pollen only, Europe only |
| **Xweather / Aeris** | **None** | — | — |
| **Tomorrow.io** | **No separable field** | Modelled | Mold appears only inside `treeIndex` descriptions |
| **Ambee** | Marketing headline only | — | Product list is AQ, Pollen, Weather, Wildfire, NDVI, ILI. No mold API |
| **Weather.com** | Markets a mold count | **Modelled** | JS shells; number unverifiable |
| **AccuWeather** | Mold Allergen Forecast pages | **Modelled** (meteorologist forecast, no trap) | Page and dev docs 403 |
| **AllerVie Health** | Yes, per clinic | **Relay** of the NAB | Loaded |

**No consumer aggregator sells a trap-derived mold number.** Every "mold" off the shelf is either a weather model or a relay of the NAB.

---

## 8. Ranked list — what to build against

1. **AAAAI NAB GraphQL** — 19 fresh mold stations, genus-level, spores/m³, history to 1998, one endpoint, no auth, no rate limit. **Blocked on licensing, not engineering.**
2. **POLLnet Italy WFS** — 58 stations, spores/m³, CC-BY 4.0, GeoJSON/CSV, CQL-filterable. The only production-grade open mold feed in Europe. Alternaria only; ~8-day lag.
3. **Houston Health Department** — 20 genera + total, weekdays, monthly XLSX history. Best single-city source in the world and unambiguously public.
4. **St. Louis County** — daily total since 1960, numeric mold count in an RSS feed, sequential-integer archive for backfill. Total-only.
5. **Children's Mercy Kansas City** and **Canton City Public Health** — clean static HTML, genus-level, one stable URL each.
6. **EUMETNET AutoPollen THREDDS** — 5 spore stations, two months stale, but 3-hourly, standards-based, and the only automated source that publishes.
7. **Sciensano Belgium** — best Cladosporium source in Europe, daily, numeric. Needs chart-payload extraction.
8. **Pollen Sense (commercial)** — the one vendor with genus-level automated mold and a real API.
9. **Madrid PALINOCAM** + **ARPAT Toscana** — numeric Alternaria, weekly, PDF.
10. **SAPNET South Africa** — free REST API, weekly, ordinal-only.
11. **Aerobiology Research Labs (Canada)** — not scrapeable; the only real Canadian network. A purchase order.

---

## 9. The "ingest anything" strategy

**Four scraper shapes cover ~80% of the retrievable mold on Earth.**

| # | Shape | What it unlocks | Share of live public mold |
|---|---|---|---|
| **1** | **GraphQL client** (one endpoint, dynamic-LINQ date filter, paginated) | AAAAI NAB: 19 fresh stations, 24 mold-capable, full US/PR coverage, 28 years of history | **~55–60%** |
| **2** | **OGC WFS / GeoJSON client** (CQL filter, `outputFormat=json`) | POLLnet Italy (58 stations); reusable against any GeoServer | **~20%** |
| **3** | **Static-HTML table/list extractor** with per-site selectors + a date parser | Houston, Canton, Children's Mercy, St. Louis, Oklahoma City, La Crosse, Atlanta, Carolina, Met Éireann, Kraków, Colorado Springs | **~12%** |
| **4** | **Generic JSON REST client** (WP REST + keyed vendor APIs) | SAPNET, polleninformation.at, PIA Catalonia, Pollen Sense if licensed | **~5%** |

The remaining 20% needs two expensive shapes:

- **5. Headless browser** — STAAMP, SEAIC (Meteor DDP websocket), Sciensano chart payloads, Loyola (X/Threads), Tulsa, Deakin (F5/Shape), weather.com, Leicester (Cloudflare).
- **6. File parser (PDF + XLSX + NetCDF)** — Houston's monthly Excel, Madrid, ARPAT, Denmark weekly, the French 1987–2024 archive, AutoPollen NetCDF.

**The architectural implication:** if you build shape #1 and license the NAB, you have most of the world's public mold in a week. If the AAAAI says no, you are building shapes #2–#6 to reassemble a worse version of what shape #1 gave you, and US coverage drops from 19 stations to about 8. **The licensing answer should gate the engineering plan.**

Two cross-cutting rules:

- **Store the observation date from the page, and treat "no date rendered" as a failure.** The Asthma Center Philadelphia renders a live-looking mold category with no date on three pages. Waterbury Hospital has rendered an apparently normal mold count page for four years past its last reading. A scraper that doesn't parse a date will serve 2022 data to an asthmatic in 2026.
- **Normalize to two tiers, not one.** Roughly half of what exists is spores/m³ and half is Low/Moderate/High with no published mapping. Carry a `precision` field and let the UI degrade.

---

## 10. Dead or dormant — don't waste time

| Source | Status | Last reading |
|---|---|---|
| **Waterbury Hospital, CT** | **CONFIRMED DEAD** — page online and looks normal | **2022-08-19** (mold 46,596) |
| **RNSA / pollens.fr (France)** | **Organization liquidated**; domain 301s to Atmo France; AASQAs publish no mold | archive ends **2024** |
| Allergy Clinic of Tulsa (public web) | Website 403s; last dated mold count was a Facebook post | **2014-08-15** |
| Japan MoE "Hanako-san" (120 sites) | **Terminated 2021-12-24** | **2021-05-31** |
| **NEMSR** (AusPollen register) | Redirects to an unrelated BoM page | — |
| `realpollencount.org`, `pollensa.co.za` | **DNS dead** — consolidated onto pollencount.co.za | — |
| WIOŚ Kraków bulletin | Dormant; use the Jagiellonian page | **2023-08-31** |
| Allergy, Asthma & Sinus Center, Greenfield WI | Mold discontinued | pollen current |
| Academy of Medicine of Cleveland | Phone line only | — |
| CHU de Batna, Algeria | Bulletin is pollen-only PNG | **2026-06-08** |
| Univ. of South Florida (Tampa) | NAB dormant | 2026-07-28 |
| Asthma & Allergy of Idaho | NAB dormant | 2026-05-05 |
| Univ. of PR Mayagüez | NAB dormant | 2026-04-12 |
| Puerto de Bahía Blanca, Argentina | NAB's last active South American station | **2025-11-13** |
| Lima, Perú (NAB) | Dormant | 2025-09-10 |
| **150 of 219 NAB station records** | **No data ever returned** — includes Brooklyn, Albany, Bedford/Westchester, Toronto, Chatham ON, Durham NC, Charlotte NC, Denver National Jewish, Miami, Erie PA, Salinas CA, Sioux Falls, 4× San Diego | never |
| NAB dormant-with-history (13 more) | Springfield-Greene County MO (2025-05-13), Toledo OH (2025-05-16), Eastern Shore VA (2025-05-27), Elmendorf AK (2025-06-26), Univ. of Tulsa (2025-01-03), STARx NJ (2024-12-11), Twin Falls ID (2024-05-01), Pleasanton CA (2024-04-10), Findlay OH (2024-02-06), Midland TX (2023-09-25), Salt Lake City (2023-04-16) | 2023–2025 |

**Seasonally dark, not dead:** Kagen Appleton (March 2027), AusPollen Brisbane (2 Nov 2026), Sydney Pollen (26 Sep 2026), Deakin AIRwatch (1 Oct), tenki.jp (Jan 2027), Northwest Asthma Seattle (2027).

**Blocked, not dead** — worth one retry with a real browser session: `pollenforecast.com.au` (CloudFront 403), University of Leicester `le.ac.uk/cehs/hpru` (Cloudflare), UK HealthCare Lexington (expired TLS), ARPA Sicilia (TLS chain), Zenodo API (403), `hub.eaaci.org` (403).

---

## Survey caveats

The session's WebSearch budget ran out near the end, so the final sweeps — New Zealand, Argentina/Brazil/Chile/Colombia, the Rust Belt and DC/Baltimore metros, Sensirion — did not run. Those are gaps, not negative findings. Several targets are blocked rather than absent (Leicester, `pollenforecast.com.au`, AccuWeather docs, Zenodo, Israel).

## Sources — every URL loaded

**AAAAI NAB:** pollen.aaaai.org/ · pollen.aaaai.org/nab/collectors/ · pollen.aaaai.org/js/{app.8523d580,script1.37a5fad7,script2.ea1cc5ee}.js · pollen.aaaai.org/graphql/public (introspection + stations + one-year collection-set pull + 163 per-station probes) · pollen.aaaai.org/nab/index.cfm?p=allergenreport&stationid=192,227 · allergist.aaaai.org/forms/NABDataReleaseInformation.pdf · aaaai.org/global/nab-pollen-counts · /counting-stations · /pollen-and-mold-links

**US locals:** pollenandmold.stlouisco.com/ · /Pollen_Day.aspx?TargetID={13664,13663,13000,10000} · /Summary.aspx?Item=Mold&Period=12 · /Feed/RSS.aspx · houstontx.gov/health/Pollen-Mold/index.html · houstonhealth.org/services/pollen-mold · /houston-pollen-mold-count-friday-september-112026 · sanantonio.gov/health/news/allergy (301) · sa.gov/Directory/Departments/SAMHD/News-Events · staampallergy.com/pollen-count · oklahomaallergy.com/pollen-count/ · asthmacenter.com/ · /allergy-pollen-counts.html · austinpollen.com/ · /moldtrends.html · atlantaallergy.com/pollen_counts · aerobiology.ca/ · cantonohio.gov/2295/Daily-Spore-and-Pollen-Counts · pollen.childrensmercy.org/ · kcallergy.com/pollen-count/ · waterburyhospital.org/pollen-record/ · kagenallergy.com/daily-pollen-and-mold · wbay.com/page/allergy-tracker/ · lacrosseallergy.com/resources/pollen-count/ · loyolamedicine.org/services/allergy-count · myaasc.com/pollen · tulsaairquality.com/health-resources/allergy-report/ · asthmaandallergycenter.com/pollen-counts/ · amcno.org/pollen-count · familyallergy.com/pollen-counts/ · nationaljewish.org/NJH/media/html/html-pollen-graph.html · ukhealthcare.uky.edu/services/asthma-allergy-sinus-clinic · nwasthma.com/pollen-count/ · chuallergy.com/pollen-count/pollen-count/ · oregonallergyassociates.com/pollen-counts/ · centralcoastallergy.com/pollen-counts/ · carolinaasthma.com/pollen-mold-counts/ · asthmanc.com/learn/pollen-count · rvaallergy.com/pollen-count · uptownallergyasthma.com/pollen-count-new-orleans-la/ · nashville.gov/.../daily-aqi-and-pollen-count · unlv.edu/publichealth/pollen · aacos.com/pollen-count/ · carefreeallergy.com/pollen-report/ · nyallergy.com/nyc-pollen-count/ · pollymap.com/ · pollencount.app/ · allervie.com/pollen-count/ · allergyweb.com/education/allergy/pollen-counts/ · pollen.com/forecast/current/pollen/73344 · weatherbug.com/life/pollen/dallas-tx-75219 · weather.com/us/florida/city/tampa/allergy

**APIs verified:** sdi.isprambiente.it/geoserver/om/ows (WFS GetFeature, Alternaria, 348 records) · thredds.nilu.no/thredds/catalog/auto-pollen_nrt/catalog.xml · pollencount.co.za/wp-json/wp/v2/report

**Europe:** polleninformation.at/en/ · /en/data-interface · polleninformation.eu/ · ean.polleninfo.eu/info/en · airallergy.sciensano.be/ · pollens.fr (301) · atmo-france.org/article/surveillance-des-pollens-et-moisissures · data.gouv.fr/api/1/datasets/?q={pollen,moisissures,aerobiologie} · /datasets/donnees-historiques-de-surveillance-des-pollens-et-des-moisissures/ · admindata.atmo-france.org/api/doc/v2 · data.atmo-france.org/geoserver/ind_pol/ows · airparif.fr/node/150 · opendatadocs.meteoswiss.ch/a-data-groundbased/a7-pollen-stations · pollenstiftung.de/pollenvorhersage/wochenprognose.html · aerobiologia.cat/pia/en/api · pollnet.isprambiente.it/opendata/ · arpat.toscana.it/datiemappe/bollettini/bollettino-settimanale-delle-spore-fungine · arpa.fvg.it/temi/temi/pollini/ · worc.ac.uk/pollen · weather.metoffice.gov.uk/warnings-and-advice/seasonal-advice/pollen-forecast · met.ie/forecasts/pollen · nnk.gov.hu/.../daily-pollen-forecast · astma-allergi.dk/pollenservices/{dagens-pollental,ugens-dogntal}/ · naaf.no/pollenvarsel · nrm.se/natur--och-miljoovervakning/pollenovervakning · norkko.fi/en/ · elkerliek.nl/hooikoorts/pollentellingen · hooikoortsradar.nl/ · comunidad.madrid/servicios/salud/esporas-hongos · polenes.com/ · rpaerobiologia.com/boletim-polinico · pylovasluzba.cz/pylovy-zpravodaj · krakow.wios.gov.pl/stan-srodowiska/komunikat-pylkowy/ · toksy-alergo.cm-uj.krakow.pl/pl/komunikat-pylkowy-dla-alergikow-malopolska/ · stampar.hr/hr/peludna-prognoza · allergotop.com/ · epin.lgl.bayern.de/ · dati.retecivica.bz.it/services/POLLNET_PARTICLES · le.ac.uk/cehs/hpru/pollen-and-spore-counts (403) · arpa.sicilia.it (TLS)

**Automated / repositories:** autopollen.net/ · thredds.nilu.no/thredds/ncml/auto-pollen_nrt/{DE0054R,DE0203U,DE0212U,ES0047R,FI0096G,CH0022R,RS0002U,FI0038U} · ebas-nrt.nilu.no/api/stations · ebas-data.nilu.no/ · pollensense.com/ · docs.pollensense.com/reference/{sensor-api,grid-data-api} · sensors.pollensense.com/api/sites (401) · plair.ch/Rapid-E+.html · dropletmeasurement.com/product/wideband-integrated-bioaerosol-sensor/ · zaum-online.de/pollen/pollen-monitoring-map-of-the-world.html · pmc.ncbi.nlm.nih.gov/articles/{PMC5883412,PMC11139991,PMC12176942,PMC13379475,PMC13083431,PMC12051558}

**Rest of world:** aerobiology.ca/{historical-data,toronto-ontario-pollen-and-spores,aerobiology-monitoring,pollen-forecast-app}/ · theweathernetwork.com/en/city/ca/{ontario/toronto,quebec/montreal}/pollen · airwatch.deakin.edu.au/ · melbournepollen.com.au/ · canberrapollen.com.au/ · sydneypollen.com.au/ · perthpollen.com.au/ · auspollen.edu.au/ · airrater.org/what-does-it-monitor/ · pollencount.co.za/ · /report/11-september-2026/ · /sapnet/ · polenalerji.ege.edu.tr/ · polenalerji.ankara.edu.tr/ · mgm.gov.tr/genel/saglik.aspx?s=121 · batna-pollen.com/3-bulletin-allergo-pollinique · rema.atmosfera.unam.mx/rema/ · iaaerobiology.org/links/ · eaaci.org/patients-resources/worldwide-pollen-map/ · env.go.jp/press/110339.html · tenki.jp/pollen/ · weathernews.jp/pollen/ · hokeniryo1.metro.tokyo.lg.jp/allergy/pollen/data/herbaceous.html · weather.go.kr/w/forecast/life/life-weather-index.do?tabIndex=4 · huafen.org/ · sina.cn/news/detail/5297346086700968.html · airtw.moenv.gov.tw/ · safar.tropmet.res.in/ · care4cleanair.com/champ · developers.google.com/maps/documentation/pollen/overview · docs.tomorrow.io/reference/data-layers-pollen · open-meteo.com/en/docs/air-quality-api · getambee.com/pollen-count · xweather.com/docs/weather-api/endpoints/airquality

---
---

# ADDENDUM — rest of world, second sweep

A separate sweep covered Canada, Australia/NZ, Latin America, Africa/Middle East, Asia, and the global aggregator APIs. It adds one numeric source, one licensed relay, and closes the non-US NAB question.

## Tier 1 outside the US and Europe

| Institution | City/Region | Country | Mold | Units | Cadence | Latest observed | Access | Scrape | History |
|---|---|---|---|---|---|---|---|---|---|
| **Intendencia de Montevideo + Lab. de Palinología, UdelaR** | Montevideo | Uruguay | **Genus**: Cladosporium, Alternaria, other fungal spores | esporas/m³ + sampling minutes + level | Daily (some multi-day composites) | **2026-09-02** (dataset touched 2026-09-13) | **CSV + CKAN JSON API** (`package_show`) at catalogodatos.gub.uy/dataset/monitoreo-de-polen-y-esporas-fungicas-en-el-aire-de-montevideo | **easy** — flat rows with lat/lon/date/taxon; annual CSVs 2023–2026 | Yes |
| **SAPNET / The Real Pollen Count** | 9 SA cities | South Africa | One aggregate "Moulds" bucket | Bands, published as words | Weekly | 2026-09-11 | WP REST `/wp-json/wp/v2/report` | easy, ordinal only | ~2021 |
| **AAAAI NAB — Lima station** | Lima | Peru | Numeric, family-level (Pleosporaceae etc.); no genus name on the API | spores/m³ | 20 sets in 4 years | **2025-09-10** — dormant | GraphQL | licensing | 2021 |
| **Aerobiology Research Laboratories** | 31 stations | Canada | Counted; Ascomycetes/Basidiomycetes/Deuteromycetes | particles/m³ | Daily | Not published | Sold, or mobile app only | hard | 10–21 yrs, commercial |

## The non-US NAB network is a registry, not a stream

219 stations, 19 outside the US. Only Lima has ever reported mold (13 sets). Bahía Blanca last reported 2025-11-13 (pollen only). Asunción, Bariloche, Córdoba, Trelew, Santa Rosa, Wuhan, Buenos Aires, Mar del Plata, Alto Valle, Niagara Falls, Hamilton: dead 2007–2022. Cleveland Clinic Abu Dhabi, Catamarca, Toronto Sunnybrook, LHSC Chatham, Ponce: registered, never reported. The "Argentina / China / UAE" tabs on the NAB home page are station registrations.

## Australia collects Alternaria and publishes none of it

Deakin AIRwatch runs Burkard pollen-and-spore traps at Burwood and Waurn Ponds and states the spore data goes to the Victorian Department of Health and the Bureau of Meteorology. Public output is grass pollen only. Melbourne Pollen, Canberra, Sydney, Perth, AusPollen Brisbane: zero mould/spore matches. The AusPollen interim standard is titled "Pollen and Spore Monitoring"; no site publishes spores.

## New Zealand

MetService "Airborne Allergens" (Auckland) is an undocumented JSON with qualitative pollen bands and fungal spores in prose only; the payload carries `"_usage": "This data is restricted… explicit permission from MetService NZ"`. No ongoing NZ aerobiology; the last nationwide spore survey was 1988–89 (PMC11486117).

## Latin America beyond Montevideo

REMA Mexico (13 stations): pollen semáforo only. Pólenes Chile: pollen only, weekly, easy HTML. AAAeIC Argentina: login-walled. Estación Aerobiológica de Lima (droscarcalderon.com): claims Alternaria/Cladosporium/Nigrospora, login-walled; the same station's data reaches the NAB. Univ. de Caxias do Sul: measures, publishes prose only. Brazil, Costa Rica: no active public network found.

## Aggregator APIs — measured vs modelled

| Vendor | Mold field | Level | Measured or modelled | Coverage |
|---|---|---|---|---|
| **The Weather Company / IBM** `U.S. Pollen Observations 1.0` | **Yes** | single "Mold" bucket, index 0–4; `pollen_cnt` "typically returns null" for mold | **Measured** — "collects data from allergist offices" (the NAB) | **United States only.** Weekdays. Historical API excludes mold. developer.weather.com/docs/openapi/u-s-pollen-observations-1-0 |
| AccuWeather Indices | Yes — "Mold pollen", index ID −12, Low 0–6,499 … Extreme 65,000–1,000,000 | single | Not stated; forecast product, assume modelled | Not stated; docs 403 |
| Weatherbit | Yes — `mold_level` 1–4 | single | Not stated | "USA and EU only"; absent from forecast |
| Tomorrow.io | **No** — "tree pollen or mold spores" is boilerplate copied into every index description | — | modelled | — |
| Google Pollen | No | — | modelled | 65+ countries |
| Ambee | No endpoint; marketing headline only | — | — | `www.ambeedata.com` DNS dead, docs subdomain up |
| Xweather, Open-Meteo, meteoblue, Foreca, Visual Crossing | No | — | — | — |

**No aggregator anywhere exposes Alternaria or Cladosporium.** Every mold field is one undifferentiated bucket.

**The Weather Company entry matters for licensing.** TWC sells a commercially licensed relay of NAB-sourced mold observations. It is US-only, weekday-only, single-bucket, index 0–4, and it drops the raw count. It is not the data the NAB GraphQL returns. But it demonstrates that the AAAAI licenses this data commercially to at least one vendor, which is the precedent to cite when asking.

## Dead / dormant / blocked (additions)

Dead domains: realpollencount.org, pollensa.co.za, aerobiologia.com.ar, allergyclinic.co.nz (parked), breezometer.com (→ Google), www.ambeedata.com. Dead programmes: Japan MoE Hanako-san (2021), NEMSR, 14 of 19 non-US NAB stations, NZ national aerobiology (1989). Dormant: NAB Lima 2025-09-10, Bahía Blanca 2025-11-13, Batna 2026-06-08, polenyesporas.fcien.edu.uy (expired TLS; data fine via CKAN). Blocked: pollenforecast.com.au (CloudFront 403), airwatch.deakin.edu.au (F5), AccuWeather reference (403), gov.il (403), TAU (JS wall), droscarcalderon.com (login), AAAeIC (login).

## Sources loaded in this sweep (in addition to §Sources above)

aerobiology.ca/{historical-data,toronto-ontario-pollen-and-spores,aerobiology-monitoring,pollen-forecast-app,what-we-do}/ · theweathernetwork.com/en/city/ca/{ontario/toronto,quebec/montreal}/pollen · weather.com/en-CA/ca/saskatchewan/city/saskatoon/allergy · airwatch.deakin.edu.au/ · melbournepollen.com.au/ + /faqs/pollen-count-definitions/ · canberrapollen.com.au/ · sydneypollen.com.au/ · perthpollen.com.au/ · auspollen.edu.au/ + /brisbane/ · airrater.org/what-does-it-monitor/ · airhealthlab.com/ · pollencount.app/saskatoon · iaaerobiology.org/links/ · eaaci.org/patients-resources/worldwide-pollen-map/ · zaum-online.de/pollen/pollen-monitoring-map-of-the-world/index.html · rema.atmosfera.unam.mx/rema/ + /REMA_SEMAFORO.aspx · redlatamaerobiologia.com/ + /miembros/* · iais.com.ar/prestaciones/polen-en-argentina · polenes.cl/ · cmica.com.mx/ · rmcab.ambientebogota.gov.co/ · aire.cdmx.gob.mx/ · ucs.br/…/calendario-polinico-e-fungico/ · droscarcalderon.com/ · catalogodatos.gub.uy/dataset/monitoreo-de-polen-y-esporas-fungicas-en-el-aire-de-montevideo + /api/3/action/package_show · ckan-data.montevideo.gub.uy/…/medidas_de_monitoreo_2026.csv · alergia.org.ar/ · pollencount.co.za/ + /report/ + /wp-json/wp/v2/report · lunginstitute.co.za/aiu/ · pmc.ncbi.nlm.nih.gov/articles/{PMC13083431,PMC13379475,PMC11486117,PMC5883412,PMC12051558} · polenalerji.ege.edu.tr/ · polenalerji.ankara.edu.tr/ · mgm.gov.tr/genel/saglik.aspx?s=121 · batna-pollen.com/ · env.go.jp/press/110339.html · tenki.jp/pollen/ · weathernews.jp/pollen/ · hokeniryo1.metro.tokyo.lg.jp/allergy/pollen/data/herbaceous.html · weather.go.kr/w/forecast/life/life-weather-index.do?tabIndex=4 · data.kma.go.kr/data/lwi/hwiRltmList.do · huafen.org/ · airtw.moenv.gov.tw/ · safar.tropmet.res.in/ · care4cleanair.com/champ · developers.google.com/maps/documentation/pollen/{overview,coverage,pollen-index} · docs.ambeedata.com/apis/pollen · open-meteo.com/en/docs/air-quality-api · developer.accuweather.com/documentation/{indices,index-categories} · docs.tomorrow.io/reference/data-layers-pollen · xweather.com/docs/weather-api/endpoints/airquality · weatherbit.io/api/{airquality-current,airquality-forecast} · visualcrossing.com/resources/documentation/weather-api/timeline-weather-api/ · docs.meteoblue.com/en/meteo/variables/weather-variables · developer.weather.com/docs/openapi/{u-s-pollen-observations-1-0,pollen-historical-3-0} · business.foreca.com/newsroom/pollen-data-available-via-foreca-weather-api · silam.fmi.fi/ · metservice.com/publicData/webdata/towns-cities/regions/auckland/locations/auckland/airborne-allergens · pollen.aaaai.org/graphql/public (219 stations, 19 non-US, per-station histories)
