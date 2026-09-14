# Breathing Quality Index — US Data Source Catalog

Research report, verified 2026-09-13/14. Agent-written (Claude Opus research sub-agent), relayed unedited except HTML-entity cleanup. ✅ = verified with a live HTTP call, not just documentation.

---

## 1. Air quality — per-pollutant, current + forecast

| Source | Free / paid | Auth | Coverage | Spatial | Cadence | Forecast | Concentrations? | Names responsible pollutant? | Rate limits |
|---|---|---|---|---|---|---|---|---|---|
| **EPA ArcGIS AirNow mirror** ✅ | **Free** | **None** | US + embassies | Monitor points | Hourly | No | **Yes** — O3 (ppb), PM2.5, PM10 (µg/m³) + each sub-AQI + combined | Implicit (per-pollutant sub-AQIs) | None published |
| **AirNow API** ✅ | Free | API key (401 without) | US | Reporting area / site | Hourly, obs land :10–:30 | Daily-issued, 1–2 d | Yes (site endpoints) | Yes (`ParameterName` per row) | Per-service, unpublished |
| **Open-Meteo AQ** ✅ | Free, **non-commercial**, CC BY 4.0 | None | Global | CAMS-EU 11 km / global 40 km | Hourly; model 12–24 h | 5 d (7 max), 92 past days | Yes — PM2.5/10, O3, NO2, SO2, CO, dust, NH3 | Via per-pollutant `us_aqi_*` sub-indices | 600/min · 5k/h · 10k/day · 300k/mo |
| **Google Air Quality** | 10,000 free/mo, then **$5.00/1k** (0–100k) → $0.25/1k at 5M+ | API key / OAuth | Global | 500 m | Hourly | 96 h hourly + history | Yes (`extraComputations`) | **Yes — `dominantPollutant`** | Quota-based |
| **OpenAQ v3** ✅ | Free | Key required (**v2 = HTTP 410 Gone**) | Global, US strong | Station points | Varies by provider | No | Yes, raw | No | 60/min · 2,000/h |
| **WAQI / aqicn** ✅ | Free, **non-commercial only** | Free token | Global, 11k+ stations | Station | Hourly | 3–8 d (PM2.5/PM10/O3/UVI) | **No — sub-index (IAQI) values only** | **Yes — `dominentpol`** | 1,000 req/sec |
| **PurpleAir** ✅ | **1M free points at signup**; $10–49 → 100k pts/USD | API key | Global | ~Block-level | 2 min | No | Yes, raw PM (uncorrected) | No | Points budget |
| **OpenWeatherMap Air Pollution** | Free tier eligible; £0.0012/call on One Call 4.0 | Key | Global | Model grid | Hourly | **4 d hourly**; history from 2020-11-27 | Yes — CO, NO, NO2, O3, SO2, PM2.5, PM10, NH3 (µg/m³) | No | Plan-based |
| **IQAir / AirVisual** | Community free: 5/min, 500/day, 10k/mo | Key | Global | City / station | Hourly | Enterprise only | **Community = AQI only**; Startup+ adds concentrations | Yes (main pollutant) | Per tier |
| **EPA AQS** ✅ | Free | Email → key | US | Monitor | Hourly/daily | No | Yes, full criteria set | Yes | 10/min, 5 s pause, 1M rows |
| **Tomorrow.io** | Free 500/day, 25/h, 3/s — **AQ is an Enterprise premium layer** | Key | Global | — | — | — | Yes (paid) | Yes | 25/hour is binding |
| **Ambee** | **No published pricing** — sales-gated | `x-api-key` | Global | 5 km | Hourly | Yes | Yes | Yes | — |
| **BreezoMeter** | **Gone — it is now the Google API** | — | — | — | — | — | — | — | — |

**Gotchas.** AirNow is sparse rurally and forecasts aren't issued everywhere or year-round; docs explicitly say don't loop over ZIPs. Several AirNow lat/lon and ZIP endpoints are **being retired Fall 2026** — use reporting-area/monitoring-site endpoints. EPA AQS has a **6-month-plus ingestion lag** — archive for calibration, not a live source. PurpleAir PM is uncorrected and needs the EPA correction factor. Google Maps Platform terms restrict caching/redisplay. WAQI gives sub-indices, not µg/m³ — don't feed them into an AQI calculator. OWM's `aqi` is a **proprietary 1–5 scale, not US EPA AQI**.

**The find worth acting on:** EPA publishes keyless ArcGIS FeatureServers carrying live AirNow monitor data with spatial envelope queries — 13 monitors returned for an LA bounding box, each with concentration, unit, sub-AQI and combined AQI. No registration at all. Limitation: O3/PM2.5/PM10 only, no NO2/SO2/CO. Base: `services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services`.

---

## 2. Pollen by taxon

| Source | Modeled or measured | Taxa | Horizon | Spatial | Pricing | Auth |
|---|---|---|---|---|---|---|
| **Google Pollen** | Modeled | 3 types + **15 species**; US = maple, elm, cottonwood, alder, birch, ash, pine, oak, juniper, grasses, ragweed | **5 d max** | 1 km | **5,000 free/mo**, then **$10/1k** → $0.50/1k | Key |
| **Pollen.com / IQVIA** ✅ | Modeled | Top-3 `Triggers` with `Name` + **`Genus`** + `PlantType` | Today + 4 d; 30 d back | ZIP centroid | **Free, undocumented** | None (**`Referer` header mandatory**) |
| **Ambee** | Modeled | tree/grass/weed + `speciesRisk` (ash, birch, cedar, elm, hazel, maple, oak, pine, poplar, ragweed) | 48 h @1 h or 120 h @3 h | 500 m | Not published | `x-api-key` |
| **Tomorrow.io** | Modeled | **Only 5 fields**: tree/grass/weed + `grassGrassIndex`, `weedRagweedIndex` (US-only) | −7 d to +108 h | — | Enterprise layer | Key |
| **AccuWeather** | Modeled | Grass **−11**, Mold **−12**, Ragweed **−13**, Tree **−14**, Asthma **23**, COPD **44** | 1/5/10/15 d | Location key | Trial 500/day for **14 days**; ~$25/mo (unverified — portal 403s automation) | Key |
| **Open-Meteo** ✅ | Modeled (CAMS-EU) | alder, birch, grass, mugwort, olive, ragweed | 4 d | 11 km | Free | None |
| **NAB / AAAAI** | **MEASURED** | Genus-level pollen **+ mold** | Obs only | ~124 US stations, 67 active | Free but **12-week Board approval**, non-commercial, Excel delivery | Membership |
| **Meteomatics** | Modeled | grains/m³ for birch, grass, olive, ragweed | — | — | Trial 500/day | Basic auth |

**The two silent-failure traps.** ✅ Open-Meteo pollen is **still Europe-only in September 2026** — a US request returns HTTP 200, correct `grains/m³` unit metadata, and every hourly value `null`. No error. Confirmed 0-of-24 non-null hours for both NYC and Atlanta against 24-of-24 for Berlin. ✅ Pollen.com's mold endpoint returns **200 with a body of literally `null`** for every ZIP tried. Naive parsing reads both as "zero."

**Practical note:** Pollen.com's `Triggers` array is the best free US species signal — it names the actual genus driving today's number, which Google's collapsed `GRAMINALES` grass code does not. Index scale is **0–12**, not 0–5. Undocumented and unsupported; fine for personal use, don't depend on it. Endpoints: `/api/forecast/{current,extended,historic}/pollen/{ZIP}`.

---

## 3. Mold spore counts

**There is no API for measured US mold counts. This is the hardest gap in the project.**

| Source | Status |
|---|---|
| **Weatherbit** | `mold_level` 1–4 on the **current** AQ endpoint, US+EU. **Not on the forecast endpoint.** Requires the **Business** plan |
| **AccuWeather** | Index **−12**, 1/5/10/15-day horizons. Modeled. 14-day trial then paid |
| **Pollen Sense** | **Measured** by automated optical sensors — but v1 APIs retired March 2026, v2 docs behind login, **pricing not published** |
| **NAB / AAAAI** | Real counts. No API. 12-week approval process |
| **Houston Health Dept** | Lab-measured pollen **and mold**, Mon–Fri, plus monthly `.xlsx` archives at predictable filenames. **Scraping only, one city** |
| Pollen.com ✅, Google, Ambee, Open-Meteo, Tomorrow.io, Meteomatics, Xweather | **Nothing** |

---

## 4. Weather — with the fields an asthma index needs

| Source | Free tier | Auth | Horizon | Dew pt | Pressure | **Tendency** |
|---|---|---|---|---|---|---|
| **NWS api.weather.gov** ✅ | Unlimited-ish, free | **User-Agent only** | ~6.5 d hourly | ✅ | Obs ✅ / **Forecast ✗ (layer empty)** | Only inside `rawMessage` METAR `5appp`, every 3 h |
| **Open-Meteo** ✅ | 600/min · 10k/day · 300k/mo, non-commercial | **None** | **16 d + 92 past days** | ✅ | ✅ `pressure_msl` + `surface_pressure` | Derive — trivially, see below |
| **Apple WeatherKit** | 500k/mo with $99/yr ADP; $49.99 → 1M | JWT ES256 | 10 d hourly | ✅ | ✅ | **✅ `pressureTrend` on every forecast hour — the only forward-looking tendency anywhere** |
| **Visual Crossing** | **1,000 records/day**; $0.0001/rec metered; $35/mo Pro; $150/mo Corporate | Key | 15 d + 50 yr history | ✅ | ✅ | Derive |
| **Pirate Weather** ✅ | **10,000/mo**; $2/mo → 20,000 | Key | 48 h (168 h with `extend=hourly`) | ✅ | ✅ | Derive |
| **OpenWeatherMap** | One Call 4.0: 1,000/day then £0.0012/call | Key | 48 h hourly | ✅ | ✅ | Derive |
| **Tomorrow.io** | 500/day, **25/hour**, 3/s | Key | — | ✅ | ✅ both levels | Derive |
| **Synoptic (Mesonet)** | **.edu addresses only** | Token | Obs only | ✅ | ✅ 3 forms | **✅ native `pressure_tendency`** |
| **NCEI ISD** | Free, keyless | None | Archival | ✅ | ✅ | **✅ `MD1` field = 3-hour tendency** |
| **WeatherAPI.com** | 100k/mo, 3 d | Key | 3–300 d | ✅ | ✅ | Derive — but history is **archived forecasts, not actuals** |
| **Weatherbit** | 50/day, **no hourly on free** | Key | 48–240 h | ✅ | ✅ | Derive |

**Pressure tendency — the answer.** ✅ One Open-Meteo call with `past_days=2&forecast_days=16` returns a **contiguous 432-hour `pressure_msl` series** spanning two days behind through sixteen ahead. Δ3h falls out of a single array by differencing — backward tendency for "what just hit me" and forward tendency for "a front arrives Thursday" — with no persistence layer at all. Nothing else does this free.

**NWS gotchas, all verified.** ✅ The gridpoint `pressure` layer exists as a key with an **empty `values` array at every WFO checked** — NWS cannot give you forecast pressure. ✅ The 5-minute observations are mostly null; only the `:54` hourly METAR carries dewpoint, RH and sea-level pressure, so filter on `dewpoint is not null` or you build on 1-in-12 real rows. ✅ `precipitationLastHour` is absent from live payloads — only `precipitationLast3Hours`. `/forecast/hourly` is lossy (no pressure, wind as strings like `"10 mph"` and `"E"`) — use raw `/gridpoints/{wfo}/{x},{y}` instead, which gives degrees and mm. Gridpoint layers have ragged `PT1H`/`PT3H`/`PT6H` intervals and different value counts per layer; expand before joining.

**Underrated free NWS fields** ✅ — the raw gridpoint endpoint carries `mixingHeight` and `transportWindSpeed` (populated at every office sampled; their product is the ventilation rate that governs pollutant accumulation), `probabilityOfThunder`, and `atmosphericDispersionIndex`. Caveat: `probabilityOfThunder` validTime intervals vary wildly by office (`PT2H` at Flagstaff, `P7DT10H` at Los Angeles — near-useless there), and `lightningActivityLevel`, `stability` and `hainesIndex` were empty everywhere.

---

## 5. Wildfire smoke and fire detection

| Source | Cost / auth | Coverage | Spatial | Cadence | Horizon | Key fields |
|---|---|---|---|---|---|---|
| **HRRR-Smoke** (AWS / NOMADS) ✅ | **Free, no key** | CONUS + AK | **3 km** | Hourly runs | **f18 hourly; f48 at 00/06/12/18z** | `MASSDEN` @8 m, `COLMD`, `AOTK`, `HPBL`, `VIS` |
| **AirFire S3 GeoJSON** | Free, no auth, undocumented | US | Plume polygons | **Hourly** | Nowcast | `hms/v1/geojson/latest_smoke.geojson` — `Satellite`, `Start`, `End`, `Density` |
| **NOAA HMS** ✅ | Free, static files | US | Polygons | Daily, 2 analyst passes, **same-day file overwritten** | Nowcast | KML + Shapefile at `.../Smoke_Polygons/{KML,Shapefile}/YYYY/MM/hms_smokeYYYYMMDD.*` |
| **NASA FIRMS** | Free, MAP_KEY | Global | VIIRS 375 m / MODIS 1 km | URT <1 min, RT ~30 min, NRT ~3 h | Detection only | `latitude`, `longitude`, `frp`, `confidence`, `acq_date/time`, `daynight` |
| **NIFC WFIGS ArcGIS** | Free, no auth | US | Points + perimeters | ~5 min | — | `IncidentName`, `IncidentSize`, `PercentContained`, `POOState` |

**Gotchas.** MASSDEN is **kg m⁻³, not µg/m³** — multiply by 1e9. It sits at "8 m above ground," not "surface." ✅ Byte-range extraction of one field is ~1.6 MB against a ~135 MB full file; a NOMADS bounding-box subset is ~2.6 KB and is the right call for a point lookup. The AirFire GeoJSON still emits **legacy numeric Density codes** (5 = Light, 16 = Medium, 21 = Heavy) while NOAA's own files use strings. FIRMS `confidence` is 0–100 integer for MODIS but `l`/`n`/`h` strings for VIIRS — same column, two types. RRFS does **not** replace HRRR (slipped to 2026-10-06); build against HRRR. Every commercial "smoke API" (Ambee, Tomorrow.io) resells HMS or HRRR — don't pay for it.

---

## 6. Lightning / thunderstorm

| Source | Cost / auth | Coverage | Latency | Notes |
|---|---|---|---|---|
| **NWS Alerts API** ✅ | **Free, User-Agent only** | US | Seconds | 111 event types; `parameters.eventMotionDescription` gives **storm bearing, speed, centroid**, `maxWindGust` gives the gust front |
| **GOES GLM** (AWS) | **Free, no account** | Americas to ~52°N | **~20 s** | 8 km nadir; one netCDF **every 20 s**; total lightning day and night |
| **Xweather** | 15,000 free accesses/mo; $0.0006/access, **lightning 10× → 1,500 free lightning calls/mo** | CONUS (NLDN 84 m) + global | Seconds | `lightning/threats` ships pre-built threat polygons |
| **Blitzortung** | Station operators only | Global | — | Terms **explicitly prohibit "storm warning systems"** — skip |
| **Earth Networks / AEM** | Enterprise, contact-only | Global | — | Lightning isn't even in the three published tiers |

✅ NWS alert event types relevant here: **Air Quality Alert, Air Stagnation Advisory, Dense Smoke Advisory, Blowing Dust Advisory/Warning, Dust Storm Warning, Severe Thunderstorm Warning/Watch, Red Flag Warning, Heat Advisory, Wind Advisory.** Free, keyless, point-filterable. The most underrated input in the whole catalog.

**Thunderstorm asthma.** Grass pollen is lofted into the updraft and ruptures into 0.6–2.5 µm sub-pollen particles; the cold outflow dumps them at ground level *ahead of the rain*. Melbourne 2016 signature: rising PM10, high RH, sharp temperature drop, low ozone, ruptured-grain counts up 250%. Caveat: 2021 modelling found humidity-driven rupture happens on ordinary days too and would produce constant false alarms — **lightning was the only mechanism producing an SPP pattern that followed the storm track**. Tune for specificity. Trigger on outflow arrival time derived from `eventMotionDescription`, not on warning issue time.

---

## 7. Community viral respiratory illness

| Source | Dataset ID | Auth | Granularity | Lag ✅ | Key fields |
|---|---|---|---|---|---|
| **CDC wastewater, SARS-CoV-2** | `j9g8-acpt` | None (Socrata) | County | **4 days** | `pcr_target_flowpop_lin`, `pcr_target_detect`, `county_fips`, `counties_served`, `population_served` |
| **CDC wastewater, Influenza A** | `ymmh-divb` | None | County | **4 days** | same shape |
| **CDC wastewater, RSV** | `45cq-cw4i` | None | County | **4 days** | same shape |
| **ARI Activity Level by State** | `f3zz-zga5` | None | **State** | 8 days | `geography`, `week_end`, `label` (Minimal→Very High) |
| **Weekly Hospital Respiratory Admissions** | `vdzy-6i9v` | None | State | ~1 wk | COVID/flu/RSV admissions + per-100k + categorical level |
| **RESP-NET** | `kvib-3txy` | None | Site/region | ~1–2 wk | Hospitalization rates |
| **Delphi Epidata ILINet** ✅ | `/epidata/fluview` | **None** | National + HHS region | **~2 wk** | `wili`, `ili`, `num_providers` |

**Two important gotchas.** ✅ The widely-cited legacy NWSS dataset `2ew6-ywp6` has metadata showing "updated 2026-09-10" but `max(date_end)` is **2025-09-07** — a year stale. Every tutorial points at it. Use the per-pathogen datasets above. ✅ Delphi's `fluview` works keyless at national and HHS-region level but returns `result: -2, no results` for state codes — state ILI is not available through those region codes.

**Rhinovirus specifically:** CDC NREVSS publishes RV/EV for the nation and 10 HHS regions only. State-level rows exist solely for RSV and SARS-CoV-2. No wastewater program tracks rhinovirus (respiratory-shed, not fecally shed). Some states publish their own (Wisconsin DHS, weekly). CDC NSSP state-level ARI percent-of-ED-visits at 6-day lag is a decent syndromic proxy in late summer/fall.

**The best signal for a "today" index is the county-level wastewater flu/RSV/COVID trio** — 4-day lag, keyless, moves before clinical data. Everything else is 1–2 weeks behind. No uniform national state-level API. Google Trends has no official API; `pytrends` is heavily rate-limited and blocked in 2025–26.

---

## 8. Consumer sensors and personal devices

| Source | Cost / auth | US density ✅ | Fields |
|---|---|---|---|
| **AirGradient public** ✅ | **Free, no key at all** | **1,056 online CONUS sensors** | PM1/2.5/10, `pm003Count`, CO2, TVOC, NOx, temp, RH, lat/lon |
| **PurpleAir** ✅ | 1M free points at signup; own sensor free; $10 ≈ 1M points | Densest US network | Raw + corrected PM, temp, RH, pressure |
| **Netatmo** ✅ | Free, OAuth2 | Good urban | Temp, RH, **pressure**, CO2, noise; `getpublicdata` for nearby stations |
| **Ambient Weather** ✅ | Free, API + app key | Very good | Full PWS set incl. pressure |
| **Awair** ✅ | Cloud API live (401 = up); docs JS-gated, tiers unverified | Own devices | Score, temp, RH, CO2, VOC, PM2.5; local API exists |
| **IQAir AirVisual Pro** | Community tier free (AQI only) | Own device | PM2.5, CO2, temp, RH |
| **Sensor.Community** ✅ | Free, no key | **4 sensors within 50 km of LA — effectively unusable in the US** | PM2.5, PM10 |

✅ PurpleAir math: PM2.5 from one sensor every 10 minutes costs **432 points/day**. The 1M free signup grant covers that for roughly six years. Effectively free for a single-location hobby project.

---

# RECOMMENDED STACK

## (a) All-free — no API keys where possible

| Variable | Source | Key? |
|---|---|---|
| Per-pollutant AQ, observed | **EPA ArcGIS AirNow FeatureServer** (O3/PM2.5/PM10 + sub-AQIs, envelope query) | **No** |
| Per-pollutant AQ, forecast | **Open-Meteo Air Quality** (`us_aqi` + per-pollutant sub-AQIs, 5 d) | **No** |
| Hyperlocal PM backfill | **AirGradient public world endpoint**; PurpleAir if a sensor is closer | AirGradient: **no** |
| Weather, observed | **NWS** `/stations/{id}/observations`, filtered to non-null dewpoint | **No** (User-Agent) |
| Weather + **pressure tendency** | **Open-Meteo** one call, `past_days=2&forecast_days=16` → 432-h `pressure_msl`, difference it | **No** |
| Ventilation / stagnation | **NWS gridpoint** `mixingHeight` × `transportWindSpeed` | **No** |
| Pollen by taxon | **Pollen.com** undocumented endpoints (0–12 index + genus-level `Triggers`, 5-day, 30-day history) | **No** (Referer) |
| Smoke, forecast | **HRRR MASSDEN** via NOMADS bounding-box subset (×1e9 → µg/m³) | **No** |
| Smoke, nowcast | **AirFire** `hms/v1/geojson/latest_smoke.geojson`, hourly | **No** |
| Fire detections | NASA FIRMS | Free key |
| Thunderstorm + air-quality alerts | **NWS** `/alerts/active?point=` | **No** |
| Lightning | **GOES GLM** on AWS | **No** |
| Viral activity | **CDC Socrata** `ymmh-divb` / `45cq-cw4i` / `j9g8-acpt` (county, 4-day lag) + `f3zz-zga5` (state) | **No** |
| Mold | **Nothing** | — |

**Cost: $0. Exactly one key (FIRMS), and you can drop that.** Covers 7 of 8 classes. Open-Meteo's free tier is non-commercial with CC BY 4.0 attribution — one line of footer text.

## (b) Best-quality, paying is acceptable

| Variable | Source | Monthly at personal volume |
|---|---|---|
| AQ current + 96 h forecast, 500 m, `dominantPollutant`, health recs | **Google Air Quality** | **$0** — hourly polling for one location ≈ 720 calls, inside the 10,000 free |
| Pollen, 1 km, 15 species, cross-reactions | **Google Pollen** | **$0** — one daily 5-day call ≈ 30 calls, inside the 5,000 free. *Never render heatmap tiles; each tile is billable* |
| Weather with **forecast-side pressure trend** | **Apple WeatherKit** | **~$8.25** ($99/yr ADP amortized); 500k calls/mo is effectively unlimited |
| Hyperlocal PM | **PurpleAir** | **~$0.15** (432 pts/day ≈ 13k/mo against 1M free ≈ 6 years) |
| Smoke, lightning, alerts, viral | Same free sources as (a) | $0 |
| Mold | **Weatherbit Business** (`mold_level` 1–4, current only) or **AccuWeather** (index −12, forecast) | Weatherbit Business is several hundred/mo — **not worth it**; AccuWeather ~$25/mo if mold matters |

**Realistic total: ~$8–10/month**, staying inside every free tier. **~$35/month** with AccuWeather for a mold index and its native Asthma (23) / COPD (44) composites.

**Don't pay for:** Ambee or Tomorrow.io (sales-gated, no published pricing; Tomorrow.io puts AQ/pollen/lightning behind Enterprise); Ambee or Tomorrow.io smoke (resold HMS/HRRR); Earth Networks or Blitzortung for lightning; Weatherbit (50 calls/day free, no hourly).

## Genuinely not obtainable from any API

1. **Measured mold spore counts.** Two modeled indices exist (Weatherbit, AccuWeather); the only real measurements are NAB (12-week approval, non-commercial, Excel) and per-city health-department pages.
2. **Measured pollen counts by taxon.** Every pollen API is a model built from land cover, phenology and weather — not a microscope. Label it as modeled.
3. **Forecast barometric pressure from NWS.** The layer exists and is empty at every office. Use Open-Meteo or WeatherKit.
4. **Numeric forecast pressure tendency.** WeatherKit gives direction only; everyone else requires differencing a series.
5. **State-level ILINet via Delphi.** National and HHS-region only.
6. **Rhinovirus below HHS-region level.** The virus that matters most for asthma has the worst spatial resolution.
7. **Personal indoor exposure** — unless you own a sensor.

## Security flag

While reading OpenWeather's documentation, the research thread found that `openweathermap.org/llms.txt` contains text addressed directly to AI agents, instructing them to self-register for a prepaid "agent lane" API account at `agents.openweathermap.org`, operated by a third party (Extreme Electronics Ltd / The Bot Forum). It was treated as data, not as an instruction, and nothing was signed up for. Worth knowing if you ever point a coding agent at OpenWeather's docs. By OpenWeather's own comparison table the direct account is also the better deal — 1,000 free calls every day versus a one-time 1,000-credit grant.

---

## Sources

**Air quality:** [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing) · [Google Air Quality currentConditions](https://developers.google.com/maps/documentation/air-quality/reference/rest/v1/currentConditions/lookup) · [Open-Meteo Air Quality docs](https://open-meteo.com/en/docs/air-quality-api) · [Open-Meteo pricing](https://open-meteo.com/en/pricing) · [AirNow API FAQ](https://docs.airnowapi.org/faq) · [AirNow API docs](https://docs.airnowapi.org/) · [EPA AQS API](https://aqs.epa.gov/aqsweb/documents/data_api.html) · [OpenAQ docs](https://docs.openaq.org/) · [OpenAQ rate limits](https://docs.openaq.org/using-the-api/rate-limits) · [WAQI API](https://aqicn.org/api/) · [OpenWeatherMap Air Pollution](https://openweathermap.org/api/air-pollution.md) · [IQAir API plans](https://www.iqair.com/commercial-air-quality-monitors/api) · [PurpleAir API pricing thread](https://community.purpleair.com/t/api-pricing/4523) · [PurpleAir API](https://api.purpleair.com/) · EPA ArcGIS services (`services.arcgis.com/cJ9YHowT8TU7DUyn/ArcGIS/rest/services`)

**Pollen and mold:** [Google Pollen forecast.lookup](https://developers.google.com/maps/documentation/pollen/reference/rest/v1/forecast/lookup) · [Google Pollen overview](https://developers.google.com/maps/documentation/pollen/overview) · [Google Pollen coverage](https://developers.google.com/maps/documentation/pollen/coverage) · [Google Pollen heatmap tiles](https://developers.google.com/maps/documentation/pollen/heatmap-tiles) · [Ambee pollen docs](https://docs.ambeedata.com/apis/pollen) · [Ambee pricing](https://www.getambee.com/pricing) · [Tomorrow.io pollen layers](https://docs.tomorrow.io/reference/data-layers-pollen) · [AAAAI NAB](https://www.aaaai.org/global/nab-pollen-counts) · [NAB data release terms (PDF)](https://allergist.aaaai.org/forms/NABDataReleaseInformation.pdf) · [AccuWeather indices](https://developer.accuweather.com/documentation/indices) · [Weatherbit air quality](https://www.weatherbit.io/api/airquality-current) · [Meteomatics health parameters](https://www.meteomatics.com/en/api/available-parameters/health/) · [Houston Health pollen & mold](https://www.houstonhealth.org/services/pollen-mold)

**Weather:** [NWS API documentation](https://www.weather.gov/documentation/services-web-api) · [NWS OpenAPI spec](https://api.weather.gov/openapi.json) · [Open-Meteo docs](https://open-meteo.com/en/docs) · [Open-Meteo historical](https://open-meteo.com/en/docs/historical-weather-api) · [Visual Crossing editions](https://www.visualcrossing.com/weather-data-editions/) · [Visual Crossing pricing](https://www.visualcrossing.com/weather-data-pricing/) · [Pirate Weather docs](https://docs.pirateweather.net/en/latest/) · [Apple WeatherKit](https://developer.apple.com/weatherkit/) · [WeatherKit REST API](https://developer.apple.com/documentation/weatherkitrestapi/) · [OpenWeatherMap full pricing](https://openweathermap.org/full-price) · [One Call API 4.0](https://openweathermap.org/api/one-call-4) · [Tomorrow.io rate limiting](https://docs.tomorrow.io/reference/rate-limiting) · [Synoptic variables](https://docs.synopticdata.com/services/variables) · [NCEI Access Data Service](https://www.ncei.noaa.gov/support/access-data-service-api-user-documentation) · [WeatherAPI.com pricing](https://www.weatherapi.com/pricing.aspx) · [Weatherbit pricing](https://www.weatherbit.io/pricing)

**Smoke and fire:** [NOAA HRRR product page](https://www.nco.ncep.noaa.gov/pmb/products/hrrr/) · [HRRR on AWS](https://registry.opendata.aws/noaa-hrrr-pds/) · [NOMADS](https://nomads.ncep.noaa.gov/) · [NOAA HMS](https://www.ospo.noaa.gov/products/land/hms.html) · [NASA FIRMS API](https://firms.modaps.eosdis.nasa.gov/api/) · [FIRMS Area API](https://firms.modaps.eosdis.nasa.gov/api/area/) · [AirNow Fire & Smoke Map info](https://www.airnow.gov/fasm-info/) · [AirFire portal](https://portal.airfire.org/) · AirFire S3 (`airfire-data-exports.s3.us-west-2.amazonaws.com`) · NOAA HMS file tree (`satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/`) · WFIGS ArcGIS (`services3.arcgis.com/T4QMspbfLg3qTGWY`) · [RRFS/REFS implementation notice (PDF)](https://www.weather.gov/media/notification/pdf_2026/scn26-48_RRFS_and_REFS_Implementation.pdf)

**Lightning:** [GOES on AWS](https://registry.opendata.aws/noaa-goes/) · [GOES GLM instrument](https://www.goes-r.gov/spacesegment/glm.html) · [Xweather lightning](https://www.xweather.com/products/weather-api/lightning) · [Xweather pay-as-you-go](https://www.xweather.com/pricing/weather-api-pay-as-you-go) · [Blitzortung coverage/terms](https://www.blitzortung.org/en/cover_your_area.php) · [Earth Networks pricing](https://developer.earthnetworks.com/pricing/)

**Illness:** CDC Socrata datasets `j9g8-acpt`, `ymmh-divb`, `45cq-cw4i`, `2ew6-ywp6`, `f3zz-zga5`, `vdzy-6i9v`, `kvib-3txy` at `data.cdc.gov/resource/{id}.json` · Delphi Epidata (`api.delphi.cmu.edu/epidata/fluview`) · [CDC NREVSS](https://www.cdc.gov/nrevss/php/dashboard/index.html)

**Sensors:** [AirGradient API](https://api.airgradient.com/public/docs/api/v1/) · AirGradient public world endpoint (`/public/api/v1/world/locations/measures/current`) · Sensor.Community (`data.sensor.community/airrohr/v1/filter/`) · [PurpleAir license](https://www.purpleair.com/license)

---
---

# ADDENDUM — corrections and additions (supersede above where they conflict)

## ⚠️ Two deadlines inside the next three weeks

**AirNow retires its zip-code and lat/lon forecast + observation endpoints on 2026-09-30.** Survivors: the combined "By Zip Code or Lat/Long" *reporting-area* service, the reporting-area services, and the bounding-box "Observations by Monitoring Site" services. Build against those from the start.

**Azure Maps Gen1 retires 2026-09-15.** S0 accounts auto-migrate to Gen2 and weather transactions go $0.50/1K → $4.50/1K, a 9× increase. (Not in the recommended stack; noted for completeness.)

## Corrections

| Above says | Correct |
|---|---|
| Open-Meteo AQ is hourly, 11 km | **Over the US you're on the 0.4° (~45 km) global CAMS grid at 3-hourly steps, rerun twice daily.** The 11 km hourly figure is the European domain. A 12-hour-stale 3-hourly value is not a "current" reading, and local plumes are smoothed away. Treat as a backdrop, not a now-reading. |
| Delphi ILINet lags ~2 weeks | **Lag 0.** Verified: epiweek 202635 published 2026-09-11 with `lag: 0`. ILINet is out ~6 days after week end. |
| AirNow rate limits unpublished | **500 requests/hour, per key, per web service.** Cannot be raised. |
| AirNow gives per-pollutant concentrations | **Reporting-area endpoints are AQI-only.** Concentrations require the bounding-box site service with `datatype=B&includerawconcentrations=1`. |
| — | AirNow's real-time value is a **NowCast**, not a raw hourly reading. It will never match a co-located sensor, by design. |
| CDC `2ew6-ywp6` looks stale | **Formally archived 2025-09-12.** Confirmed. |

## Additions that change the recommendation

**`atcp-73re` supersedes the three raw wastewater tables.** "CDC Wastewater Viral Activity Level for SARS-CoV-2, Influenza A and RSV" — all three pathogens, one table, pre-computed `site_wval` + `site_wval_category` (Very Low / Low / Moderate / High / Very High), with `counties_served` and `population_served`. Verified coverage for week ending 2026-09-05: **870 sites, 51 states/territories, 114 million people served** — about a third of the US, so check your county has a site. Also republishes **WastewaterSCAN** data via the `source` field.

**`rgnm-fkqb` (NREVSS percent positivity) is the input everyone forgets — and the right one for asthma.** Carries adenovirus, HCoV, HMPV, influenza, parainfluenza, **rhinovirus/enterovirus**, RSV and SARS-CoV-2 with `percent_pos` and 3-week moving averages. Rhinovirus is the dominant viral asthma trigger and no other source exposes it. Granularity caveat: national + 10 HHS regions for RV/EV (state rows only for RSV and SARS-CoV-2).

**`rdmq-nq56` gives county and HSA resolution nationally** — `percent_visits_{covid,influenza,rsv}` plus `ed_trends_*` (Increasing / Decreasing / No Change / Limited Data / Sparse). Beats per-state APIs; skip those.

**NASA TEMPO** — free with Earthdata Login, **North America only, 2 km × 4.5 km, hourly, daylight.** Satellite NO2/O3/HCHO. Nothing else gets close to that resolution for free.

**Friday is the golden hour.** ARI activity, wastewater WVAL, NHSN admissions and Delphi ILINet all publish the same day. One weekly job Friday evening picks up four independent signals.

## Traps worth encoding before writing code

**EPA revised PM2.5 AQI breakpoints on 2024-05-06.** "Good" now tops out at **9.0 µg/m³** (was 12.0); Moderate is 9.1–35.4. If you compute AQI yourself from Open-Meteo or PurpleAir concentrations, the old table is wrong.

**Google's caching limit is one hour, not 30 days.** The 30-day figure is the Address Validation rule. Air Quality current and forecast values must be deleted after an hour — you cannot store a daily snapshot. §2.1 permitted-use list is "air quality based routing solutions" and "environmental risk indices and correlational research"; an asthma breathing index reads as an environmental risk index, which is the strongest reading in your favor, but read it before you build.

**PurpleAir's license is the obstacle, not the price.** No distribution of data or derivatives to third parties, end users must be "internal, non-commercial, non-public," and a **"No Open Source Materials" clause forbids combination with GPL/MIT code or data.** If this goes on GitHub, PurpleAir is out.

**PurpleAir's calibration trap:** three PM2.5 fields, and bare `pm2.5` is a **context-dependent alias** resolving to `cf_1` for indoor-registered sensors and `atm` for outdoor. Use `pm2.5_cf_1` explicitly, filter `location_type=0`, and apply Barkjohn: `corrected = PA_cf_1 × 0.52 − RH × 0.085 + 5.71`. The sensor's own humidity is measured inside the housing, so that RH term is already slightly wrong.

**WAQI's license forbids redistribution as cached or archived data** — which is what a breathing index is. Disqualifying regardless of the free tier.

**OpenWeatherMap's `main.aqi` collapses the entire EPA 150–500 range into one bucket.** Cannot distinguish Unhealthy from Hazardous.

**IQAir Community gives an index and a pollutant name, no numbers.** Concentrations are the paywall.

**Netatmo Weather Station has no PM2.5** — only the Healthy Home Coach measures air quality. **Airthings Wave syncs every ~2.5 hours** unless you buy a Hub. **Awair's local endpoint** (`http://<device-ip>/air-data/latest`) is free, unlimited, and survives any cloud shutdown — enable it in the app.

**Dead ends, confirmed:** pytrends (archived read-only 2025-04-17), Delphi `google-symptoms` (inactive), Kinsa Health Weather (domain redirects elsewhere), Biobot public data (404s, GitHub repo gone — history survives only inside CDC as `source=CDC_Biobot`), old FluView Interactive scraping route (removed), `cdcfluview` (unmaintained since 2023).

## Revised free stack

Three swaps: **`atcp-73re`** instead of the three raw wastewater tables; **add `rgnm-fkqb`** for rhinovirus; **treat Open-Meteo's US air quality as a 45 km, twice-daily backdrop** rather than a current reading, with the keyless EPA ArcGIS AirNow mirror carrying the "now." Everything else stands, still $0, still essentially keyless.

**Additional sources:** [Google AQ overview](https://developers.google.com/maps/documentation/air-quality/overview) · [Google Maps Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms) · [AirNow web services](https://docs.airnowapi.org/webservices) · [AirNow Data Use Guidelines (PDF)](https://document.airnow.gov/airnow-data-use-guidelines.pdf) · [EPA AQI Technical Assistance Document (PDF)](https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf) · [Barkjohn PurpleAir correction, AMT 16:1311](https://amt.copernicus.org/articles/16/1311/2023/) · [OpenAQ AWS archive](https://docs.openaq.org/aws/about) · [Azure Maps pricing tiers](https://learn.microsoft.com/en-us/azure/azure-maps/how-to-manage-pricing-tier) · [NASA TEMPO data access](https://earthdata.nasa.gov/data/instruments/tempo/data-access-tools) · [Delphi API keys / rate limits](https://cmu-delphi.github.io/delphi-epidata/api/api_keys.html) · [Delphi fluview](https://cmu-delphi.github.io/delphi-epidata/api/fluview.html) · CDC Socrata `atcp-73re`, `rgnm-fkqb`, `rdmq-nq56`, `vjzj-u7u8`, `vdzy-6i9v`, `f3zz-zga5` · [Netatmo weather API](https://dev.netatmo.com/apidocumentation/weather) · [Airthings consumer API](https://consumer-api-doc.airthings.com/docs/api/getting-started) · [Ecowitt API](https://api.ecowitt.net/api/v3/device/real_time)
