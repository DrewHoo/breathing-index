# Harvest dust and the source-and-wind signal — data + mechanism

First verification pass, 2026-09-16 (main session, not a research sub-agent). ✅ = confirmed against a live doc or service this session; the rest is from official documentation and the repo's own evidence file. Feeds [specs/38-harvest-dust.md](../specs/38-harvest-dust.md).

## Mechanism — is harvest a real trigger?

Yes, on two things a harvest lofts together: coarse organic dust and fungal spores, both asthma-relevant, both carried downwind.

- **Grain and field dust → lung function.** Sigurdarson, O'Shaughnessy, Watt & Kline 2004 exposed eight mild asthmatics to grain dust as a CAFO model, and grain dust produced a significant transient FEV1 decrement (ammonia did not). Already in [asthma-triggers-evidence.md](asthma-triggers-evidence.md). The harvest cloud is diseased-leaf fragments plus grain dust plus spores, coarse and dark.
- **Spore spike at harvest.** "Airborne Alternaria and Cladosporium spores at ground level: influence of land use and harvesting activity" (Environmental Pollution 2026, PubMed 41692267) found agricultural-area maxima of 1,369 spores/m³ Alternaria, 47% over the urban rooftop maximum, and 88,820 spores/m³ Cladosporium, 458% over. These are the two spore genera the mold work already centers on ([28-mold.md](../specs/28-mold.md)).
- **Coarse, not fine.** Grain dust is PM10-heavy. Its fingerprint is the inverse of smoke: PM10 up, PM2.5/PM10 low, where smoke is PM2.5 up and the ratio high. The app already computes the fine fraction for the smoke gate (`ui/smoke.ts`) and carries `pm_coarse` = PM10 − PM2.5 ([24-vector-diet.md](../specs/24-vector-diet.md)), so the inverse gate is cheap.
- **The gap in the current vector.** CAMS dust ([32-dust.md](../specs/32-dust.md)) is mineral desert dust and is blind to a cornfield. The dry-spore proxy ([28-mold.md](../specs/28-mold.md)) counts the weather but not the field. Nothing sees "a field upwind is being cut this week."

## The sibling signal — algae blooms

Harvest and a harmful algal bloom share a shape: a fixed source, a wind-and-distance band, an episodic respiratory hazard invisible to any ambient grid number. Kirkpatrick 2006 (Sarasota ED, 2001 red-tide bloom vs 2002): within 1.6 km of shore, respiratory admissions +54% and asthma +44%, no increase inland — a roughly one-mile band. Already in [asthma-triggers-evidence.md](asthma-triggers-evidence.md). This is the "separate kind of signal" the harvest spec generalizes; a HAB spec is the obvious second instance.

## NASS — the *when* (Crop Progress)

- **Quick Stats API.** ✅ Free, API key required (agree to the ToS at the NASS site). Base `https://quickstats.nass.usda.gov/api/api_GET/`. Params are WHAT (`commodity_desc`, `statisticcat_desc`, `short_desc`), WHERE (`agg_level_desc`, `state_alpha`, district/county fields), WHEN (`year`, `freq_desc`, `reference_period_desc`). JSON/CSV/XML. ✅ `agg_level_desc` includes AGRICULTURAL DISTRICT and COUNTY; `freq_desc` includes WEEKLY.
- **Crop Progress series.** `commodity_desc=CORN` (or SOYBEANS, WHEAT…), `statisticcat_desc=PROGRESS`, `unit_desc=PCT HARVESTED`, `freq_desc=WEEKLY`, published in season by STATE and AGRICULTURAL DISTRICT (ASD). No county-level progress. Exact `short_desc` string to confirm on a live pull.
- **Resolution, honestly.** A weekly district percentage, not a field and not a day. "Corn is 60% harvested in your ASD this week" is the finest truth NASS gives. Rate limits unpublished; one weekly (ASD, week) fetch cached is trivial volume.
- **Live check, 2026-09-16 (keyed API) — the data outlives the bulletin.** ✅ Quick Stats needs a free key (HTTP 401 without). The New England *narrative bulletin* that carried Connecticut was discontinued in 2025 — the "current" PDF/RTF NASS serves is frozen at week ending 2025-05-25, consistent with the 2025-08-28 "NASS discontinues select data collection programs and reports" notice — but the machine-readable survey did not stop. ✅ Quick Stats returns `CORN, SILAGE - PROGRESS, MEASURED IN PCT HARVESTED` for `state_alpha=CT`: **30% for the week ending 2026-09-06, 40% for 2026-09-13**, current and weekly at state level. CT's 2026 corn-progress series is thin — planted, emerged, silage-harvested only, no grain harvest or growth stages — which is what a non-program state gets. New York statewide silage was **6%** on 2026-09-13 (behind CT because NY is dominated by later northern dairy country), so borrowing a neighbor reads worse than reading CT's own row. The lesson for the spec: query Quick Stats per state, not the discontinued narrative bulletins, and fall back to a CDL climatological window only where a state has no harvested row at all.

## NASS — the *where and what* (Cropland Data Layer)

- **CDL.** 30 m annual crop-specific raster over CONUS, from satellite plus ground truth. Annual only: the last published year stands in for this year's field pattern. Individual fields rotate corn and soy, but whether a cell is row-crop at all is stable.
- **CDLService.** ✅ Geoprocessing service at `nassgeodata.gmu.edu:8080/axis2/services/CDLService`, HTTP GET/POST KVP. `GetCDLValue?year=&x=&y=` returns the crop code at one pixel; `GetCDLStat` returns the crop-code histogram over an area; `GetCDLFile`/`GetCDLImage` for rasters. Coordinates are in the CDL's Albers projection (EPSG:5070), so a lat/lon is reprojected first (the doc example x=1551459, y=1909201 are Albers meters).
- **Caveats.** GMU-hosted, non-standard port 8080, historically intermittent — keep it off any live request path. Precompute upwind cropland per cell at build time and refresh when a new annual CDL drops. CroplandCROS is the newer portal over the same data. Google Earth Engine hosts CDL as `USDA_NASS_CDL` if server-side raster ops are ever needed, but its auth and terms rule it out for the relay.

## Wind — the *whether it reaches you*

Already in the feed: Open-Meteo and NWS give hourly wind speed and bearing (`openMeteo.ts`). The signal needs wind from the cropland sector toward the user, above a calm threshold. No new source.

## Sources

[NASS Quick Stats API](https://quickstats.nass.usda.gov/api) · [CDL Web Service docs](https://www.nass.usda.gov/Research_and_Science/Cropland/docs/WebService.html) · [CDLService WSDL](http://nassgeodata.gmu.edu:8080/axis2/services/CDLService?wsdl) · [GEE USDA_NASS_CDL](https://developers.google.com/earth-engine/datasets/catalog/USDA_NASS_CDL) · harvest spores: [PubMed 41692267](https://pubmed.ncbi.nlm.nih.gov/41692267/) · grain dust and red tide: see [asthma-triggers-evidence.md](asthma-triggers-evidence.md)
