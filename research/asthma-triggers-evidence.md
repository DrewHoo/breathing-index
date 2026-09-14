# Non-AQI acute asthma triggers, graded by evidence

Research report, September 2026. Agent-written (Claude Opus research sub-agent), relayed unedited except for HTML-entity cleanup. Scope: ACUTE triggers for people who already have asthma — minutes to a day — not chronic lung damage. Standard AQI pollutants were assessed separately (SO2, O3 Tier A; PM2.5 Tier B; NO2 modest amplifier; PM10 weak; CO no airway mechanism).

Evidence tiers: A = controlled human exposure shows effect; B = consistent epidemiology; C = mechanistic/plausible but thin; D = anecdotal or contradicted.

## Ranked list (evidence × effect size × forecastability)

| # | Factor | Tier | Forecastable | Why it ranks here |
|---|---|---|---|---|
| 1 | Community viral prevalence | B+ | Yes | Largest single driver of exacerbation volume; RV/EV in 82% of pediatric admissions |
| 2 | Airway drying (cold/dry air × exertion) | A | Yes | Controlled-exposure mechanism with a computable threshold |
| 3 | Wildfire smoke | B | Yes | Huge doses, same-day effect, good public feeds |
| 4 | Grass pollen (0–3 d cumulative) | B | Partial | Only pollen taxon with defensible asthma evidence |
| 5 | Outdoor mold spores | B | No (US) | Rivals/beats pollen in ED studies; no timely US feed |
| 6 | Hot humid air | A | Yes | Controlled human exposure; TRPV1/cholinergic reflex |
| 7 | Traffic mixture (TRAP/UFP) | A | Partial | Randomized real-world crossover; UFP unmeasured by regulators |
| 8 | Extreme diurnal temperature range | B | Yes | Threshold-shaped, RR 1.72 |
| 9 | Dust storms | B | Partial | Mass-driven, lag 0–4 d |
| 10 | Thunderstorm asthma | B (event) / C (predictability) | No | Catastrophic tail risk, 80% false-alarm rate |
| 11 | Wind direction (source sector) | B | Yes | Only with a user-supplied point source |
| 12 | Red tide brevetoxin | A– | Yes | Location-specific; 88%-accurate NOAA model |
| 13 | Volcanic vog | B | Partial | Location-specific (Hawaii) |
| 14 | PM2.5 composition / oxidative potential | C | No | No near-real-time speciation |
| 15 | Barometric pressure | C/D | Yes | Inconsistent sign; folk belief inverted |
| 16 | Humidity as its own factor | C | Yes | OR 1.05 — fold into dew point |
| 17 | Wind speed | D | Yes | Usually protective; do not add as harm |
| 18 | Ambient VOCs / smoke gas phase | D | No | Below acute RELs in aged smoke |
| 19 | UV / sunlight (direct) | D | Yes | Cochrane high-quality negative |
| 20 | Ambient NH3 (direct irritation) | D | Partial | ~1,000× below irritation threshold |
| 21 | Lead | D | Yes | No acute airway mechanism |

## Tier A — controlled human exposure

**1. Airway drying — cold AND/OR dry air, gated by ventilation.** The operative variable is water content of inspired air, not temperature. Bronchoconstriction requires inspired air below 10 mg H2O/L, reached when air is ≤23°C and ≤50% RH. By Magnus calculation, 10 g/m³ equals a dew point of 11°C / 52°F — one forecastable number gating the entire mechanism. Response engages only above ~30 L/min ventilation; nasal-only breathing gives "almost complete inhibition." Diagnostic threshold is a 10–15% FEV1 fall. Critically, Evans et al. found cold air adds nothing over dry air alone. Forecastable: yes (NWS dew point + exertion).

**2. Hot humid air.** Hayes et al. 2012: hyperventilating hot humid air caused transient bronchoconstriction in asthmatics but not healthy controls, completely prevented by ipratropium — a cholinergic reflex. Guinea-pig work localizes it to TRPV1 (capsazepine cut response 64%). Forecastable: yes.

**3. Traffic mixture (TRAP).** McCreanor 2007 NEJM randomized crossover, 60 asthmatics, 2 h on Oxford Street vs Hyde Park: EC, NO2, UFP, PM2.5 were 4.8×, 4.0×, 3.4×, 2.0× higher. FEV1 fell 3.0–4.1%, FVC 2.8–3.7% within 5 h, with airway acidification and sputum neutrophilia. Lung-function change tracked UFP and EC — neither of which any regulatory monitor reports. Effects larger in moderate than mild asthma. Forecastable: partial — a static distance-to-road term plus modeled NO2 is a weak proxy for UFP.

**4. Red tide brevetoxin aerosol (location-specific).** Aerosolized brevetoxin from Karenia brevis. Children's ED case-crossover: overall null, but ~50% higher odds of respiratory visits same-day with waterborne and aerosolized exposure. NOAA's respiratory-irritation model (cell counts + wind direction/speed + shoreline orientation) is 88% accurate 2006–2022, though weak in the middle categories. Forecastable: yes, where it applies.

## Tier B — consistent epidemiology

**5. Community viral prevalence — the single strongest non-AQI predictor.** RV/EV detected in 82.1% of children hospitalized for asthma exacerbation vs 28.5% of non-asthma respiratory controls; a pathogen was found in 75.3% of admissions, rhinovirus dominant. The natural experiment settles causal weight: in September 2020, with schools closed, pediatric asthma ED visits rose only 6% month-over-month, versus +89% to +193% in 2017–19 and 2021–22. The September epidemic roughly doubles to triples pediatric asthma ED volume and is virus/school-driven, not pollen-driven. GINA 2025 lists viral URTI first among exacerbation triggers.
Forecastable: yes — and better than expected. CDC NREVSS explicitly tracks Rhinovirus/enterovirus (RV/EV) alongside RSV, HMPV, PIV, adenovirus, HCoV — verified against the live dashboard. This corrects the common assumption that only flu/RSV/COVID are surveilled. Caveat: NREVSS is laboratory-based with a reporting lag of roughly a week and variable regional granularity.

**6. Grass pollen.** Erbas 2018 meta-analysis: +1.88% (0.94–2.82) asthma ED per 10 grains/m³. Effect is threshold-shaped, not linear — Melbourne found the rise above a 3-day mean of ~70 grains/m³, plateauing above 100. London: very-high vs low IRR 1.46 (1.20–1.78) at 3-day lag. Use a 0–3 day cumulative term; a same-day-only term systematically under-weights risk. Pollen count under-represents allergen: grass releases 2.3 pg Phl p 5/grain with a <1–9 pg range, and basophil release correlates better with allergen/m³ (r²=0.80) than grains/m³ (r²=0.61) — an irreducible ~10× misclassification. Forecastable: partial.

**7. Outdoor mold spores.** Spores are 2–10 µm — small enough to reach lower airways directly, unlike intact pollen. Alternaria and near-fatal asthma: O'Hollaren NEJM 1991, OR 189.5 (95% CI 6.5–5535.8) — direction robust, precision terrible. Dales: combined fungal groups +8.8% in children's ED, each fungal group larger than any pollen group. Lag 0–2 d (Alternaria), 0–3 d (Cladosporium) — shorter than grass. The classic Alternaria >100/m³, Cladosporium >3000/m³ thresholds trace to a 1979 convention; the best modern study (Denmark, 26 y) deliberately uses quartiles instead and finds effects well below "high" days. Forecastable: effectively no in the US — NAB only, manual microscopy, 1–2 day lag, no open API.

**8. Wildfire smoke.** Consistent acute effect, lag 0–2 days, strongest same day. NY June 2023: asthma ED visits +81.9% statewide in one day at PM2.5 122 µg/m³. Effects persist: post-fire cohort showed persistent asthma attacks RR 1.28 (1.03–1.59) per SD exposure months later. Forecastable: yes — HRRR-Smoke (3 km hourly) + AirNow Fire and Smoke Map. Limit: no public feed separates smoke-attributed from total PM2.5 at a point.

**9. Extreme diurnal temperature range.** Extreme DTR (P95/P99) RR 1.72 (1.10–2.71); linear DTR per 1°C is not significant (1.06, 0.99–1.15). Day-to-day change +4.2% per 1°C at lags 1–5 d. Genuinely threshold-shaped — model the tail, not the slope.

**10. Dust storms.** Toyama pediatric asthma admission on heavy-dust day OR 1.88 (1.04–3.41); Nagasaki significant only at lags 3–4. Dust-borne endotoxin is real (Puerto Rico: 168 vs 116 EU/mg on dust vs non-dust days). Forecastable: partial — CAMS/VIIRS AOD is column-integrated, not surface, so it over-predicts when dust stays aloft; haboobs have no useful lead time.

**11. Thunderstorm asthma.** Grass pollen ruptures into ~0.5–2.5 µm allergen-bearing granules delivered by the gust front. Melbourne 2016: gust front, −10°C temperature drop, grass pollen >100 grains/m³, 10 deaths — and only 28% of presenters had current diagnosed asthma. Ragweed/grass/olive/pellitory sub-pollen particles retain allergen; birch and cypress do not. Forecastable: no. Victoria's system — the only one on Earth — ran a false-alarm ratio of 80%, and ~69% of events occurred without the textbook conditions. Treat as an advisory, not a scored component.

**12. Wind direction.** Useful only as source-sector encoding. Near an Israeli refinery, a wind-weighted downwind metric gave inhaler use OR 1.22 (1.06–1.40) — while distance alone predicted nothing.

**13. Volcanic vog** (Hawaii-specific): SO2 and sulfate aerosol; acute airway irritation and bronchoconstriction well documented for SO2.

## Tier C — mechanistic or thin

**14. PM2.5 composition / oxidative potential.** Nickel, vanadium, sulfate, nitrate, bromine and ammonium carried most weight in a US mixture analysis (+10.6% pediatric asthma hospitalizations per decile of mixture) — but that study is annual exposure, not acute. Forecastable: no — CSN/IMPROVE speciation runs months behind.

**15. Wildfire PM2.5 per-µg penalty.** Contested. Wang 2025 (largest, cleanest): smoke PM2.5 OR 1.016 per 1 µg/m³ vs nonsmoke 1.002 (~8×). But the widely-quoted "10×" from Aguilera is the top of her range over the bottom of her comparator — her four methods spanned 0.72–10.0%, she modeled no lags, and asthma was not reported separately. Thurston's NYC analysis found only ~3% per 10 µg/m³, in line with ordinary urban PM2.5 — and a high-pollen day (302 visits) nearly matched the smoke peak (335). Use 2–3×, not 10×.

**16. Barometric pressure.** Inconsistent in sign. Shenyang found high pressure carried the largest cumulative effect — the opposite of the folk "falling barometer" story. A proxy for air-mass type, not a mechanism.

**17. Humidity as an independent factor.** Pooled OR 1.049 (1.006–1.094) across 21 studies / ~1.05M participants; precipitation essentially null-to-protective (OR 0.9991). Fold into dew point. Exception: heavy rain >50 mm (>30 mm in spring) raises ED visits via pollen rupture and spore release.

## Tier D — weak or contradicted

**18. Wind speed.** Sign flips by setting: Malaysia −12.0% per 1→2 m/s, Singapore r = −0.049, but Korea positive. Usually protective via dispersion. Do not code "high wind = worse."

**19. Ambient VOCs / smoke gas phase.** Acrolein, formaldehyde and benzene exceed acute reference values in fresh smoke, but HAP-to-PM risk falls up to 72% from fresh to aged smoke, and aged smoke clears the thresholds — including OEHHA's very low 2.5 µg/m³ acute acrolein REL. Nearly every asthmatic receives aged smoke. Not actionable downwind. Levoglucosan is a tracer, not a toxicant.

**20. UV / sunlight (direct).** 2023 Cochrane: vitamin D did not reduce exacerbations requiring steroids — OR 1.04 (0.81–1.34), HIGH-quality evidence. Plausible direction is mildly protective (UVB → α-MSH → ILC2 suppression). As an ozone proxy it is redundant and actively misleading: aerosols suppress photolysis, so UV and O3 decouple on smoke days. Exclude.

**21. Ambient ammonia (direct irritation).** NIOSH REL TWA 25 ppm, STEL 35 ppm, IDLH 300 ppm (verified). Ambient NH3 runs ~1–20 ppb — roughly 1,000–25,000× below the irritation threshold. Direct acute irritation at ambient levels is not plausible. NH3's real relevance is as a precursor of ammonium nitrate/sulfate PM2.5 in winter agricultural valleys, where it is a leading indicator for PM2.5 that the PM2.5 forecast already captures. CAFO-proximity respiratory effects are more plausibly endotoxin/organic dust/H2S than NH3.

**22. Lead.** No acute airway mechanism. NHANES found blood lead inversely associated with allergic rhinitis (aOR 0.467, Q4 vs Q1), though positively with total IgE. The asthma signal that exists is prenatal/developmental (maternal blood lead → wheeze trajectories), not acute. Exclude.

## Popular beliefs contradicted

1. "Cold air triggers asthma." Half wrong. Dryness, not temperature, is operative — cold adds nothing over dry air. Ambient cold predicts admissions only at lag 14–30 days, the signature of viral season, not bronchoconstriction. Asthmatics report cold damp as worse than cold dry.
2. "Tree pollen is the big asthma driver." Not supported. Tree models were inconclusive in London; Cupressaceae was associated with 1% fewer ED visits in Atlanta. Tree pollen is mostly a rhinitis story.
3. "Ragweed drives the fall asthma spike." It's the school-return rhinovirus wave; September 2020 proves it.
4. "Rain means high mold." Rain suppresses Alternaria/Cladosporium (dry-air spores) and raises basidiospores/ascospores.
5. "Falling barometric pressure triggers attacks." Larger studies implicate high pressure; sign is inconsistent.
6. "Windy days are bad." Usually protective.
7. "Wildfire smoke is 10× worse per µg." An artifact of range-to-range division; 2–3× is defensible.
8. "Mineral dust is especially toxic." Per µg it is equal or weaker than combustion PM — respiratory mortality on dust days was null. Dust matters because the mass is enormous.
9. "Only asthmatics get thunderstorm asthma." 72% of Melbourne presenters had no current asthma diagnosis.
10. "Consumer pollen apps are fine." One head-to-head test found 7% concordance for grass, and no significant association with measured counts.
11. "CDC doesn't track rhinovirus." It does — NREVSS reports RV/EV.

## Coverage caveats

The PM-composition/VOC/marine sweep did not return before assembly, so items 14 and 18–19 rest on direct verification plus the wildfire sweep's chemistry work, and are thinner than the rest. Explicitly unverified: the Gravesen 1979 primary source for the 100/3000 spores/m³ thresholds, and single-number ragweed/birch pollen thresholds — both are circulating convention rather than validated clinical cutoffs.

## Sources

Cold/dry, heat, humidity, DTR, pressure: [PMC10657894](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10657894/) · [PMC6031196](https://pmc.ncbi.nlm.nih.gov/articles/PMC6031196/) · [PMC2692769](https://pmc.ncbi.nlm.nih.gov/articles/PMC2692769/) · [Hayes 2012 AJRCCM](https://www.atsjournals.org/doi/full/10.1164/rccm.201201-0088OC) · [PMC4097056](https://pmc.ncbi.nlm.nih.gov/articles/PMC4097056/) · [PMC3489538](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3489538/) · [PMC13518597](https://pmc.ncbi.nlm.nih.gov/articles/PMC13518597/) · [PMC11659254](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11659254/) · [PMC10245140](https://pmc.ncbi.nlm.nih.gov/articles/PMC10245140/) · [PMC6031646](https://pmc.ncbi.nlm.nih.gov/articles/PMC6031646/) · [PMC10499370](https://pmc.ncbi.nlm.nih.gov/articles/PMC10499370/) · [PMC12716579](https://pmc.ncbi.nlm.nih.gov/articles/PMC12716579/) · [PLOS ONE Shenyang](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0102475)

Viral: [PMC13406579](https://pmc.ncbi.nlm.nih.gov/articles/PMC13406579/) · [PMC13548439](https://pmc.ncbi.nlm.nih.gov/articles/PMC13548439/) · [PMC10965818](https://pmc.ncbi.nlm.nih.gov/articles/PMC10965818/) · [PMC13296122](https://pmc.ncbi.nlm.nih.gov/articles/PMC13296122/) · [CDC NREVSS](https://www.cdc.gov/nrevss/php/dashboard/index.html) · [GINA 2025](https://ginasthma.org/wp-content/uploads/2025/11/GINA-2025-Update-25_11_08-WMS.pdf)

Thunderstorm/pollen/mold: [Thien 2018](https://pubmed.ncbi.nlm.nih.gov/29880157/) · [Silver 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5896915/) · [Emmerson 2021](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0249488) · [Hew 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7540598/) · [Cecchi 2021](https://pubmed.ncbi.nlm.nih.gov/33070421/) · [Bannister 2021 BAMS](https://journals.ametsoc.org/view/journals/bams/102/2/BAMS-D-19-0140.1.xml) · [Erbas 2018](https://pubmed.ncbi.nlm.nih.gov/29331087/) · [Osborne 2017](https://pubmed.ncbi.nlm.nih.gov/28500390/) · [Darrow 2012](https://pubmed.ncbi.nlm.nih.gov/22840851/) · [Guilbert 2018](https://pubmed.ncbi.nlm.nih.gov/29642904/) · [Buters 2015](https://pubmed.ncbi.nlm.nih.gov/25956508/) · [Gonzalez 2026](https://pubmed.ncbi.nlm.nih.gov/41607493/) · [O'Hollaren 1991](https://pubmed.ncbi.nlm.nih.gov/1987459/) · [Olsen 2023](https://pubmed.ncbi.nlm.nih.gov/37748858/) · [Atkinson 2006](https://pubmed.ncbi.nlm.nih.gov/16551756/) · [Dales 2000](https://pubmed.ncbi.nlm.nih.gov/11112119/) · [Dales 2004](https://pubmed.ncbi.nlm.nih.gov/14767446/) · [Hughes 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9025873/) · [PMC13370029](https://pmc.ncbi.nlm.nih.gov/articles/PMC13370029/) · [PMC12007050](https://pmc.ncbi.nlm.nih.gov/articles/PMC12007050/) · [PMC12993027](https://pmc.ncbi.nlm.nih.gov/articles/PMC12993027/) · [PMC12929838](https://pmc.ncbi.nlm.nih.gov/articles/PMC12929838/)

Wildfire/dust/wind/UV: [Aguilera 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC7935892/) · [Kiser 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7453527/) · [Wang 2025](https://pubmed.ncbi.nlm.nih.gov/40929521/) · [Heft-Neal editorial](https://pmc.ncbi.nlm.nih.gov/articles/PMC12618976/) · [2025 critical review](https://pmc.ncbi.nlm.nih.gov/articles/PMC13319993/) · [MMWR NY 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10468223/) · [WHAT-Now-CA](https://pmc.ncbi.nlm.nih.gov/articles/PMC13340363/) · [O'Dell 2020](https://pubs.acs.org/doi/10.1021/acs.est.0c04497) · [OEHHA RELs](https://oehha.ca.gov/air/allrels.html) · [MED-PARTICLES](https://pmc.ncbi.nlm.nih.gov/articles/PMC4829979/) · [Kanatani 2010](https://pmc.ncbi.nlm.nih.gov/articles/PMC3159090/) · [Nagasaki 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC5083323/) · [Puerto Rico endotoxin](https://pmc.ncbi.nlm.nih.gov/articles/PMC4670654/) · [Refinery wind metric](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2764638/) · [Cochrane vitamin D](https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.CD011511.pub3/full) · [HRRR-Smoke](https://rapidrefresh.noaa.gov/hrrr/HRRRsmoke/) · [AirNow FASM](https://fire.airnow.gov/)

Traffic, marine, NH3, Pb, composition: [McCreanor 2007 NEJM](https://pubmed.ncbi.nlm.nih.gov/18057337/) · [HEI 2009](https://pubmed.ncbi.nlm.nih.gov/19449765/) · [NOAA red tide RI model](https://pmc.ncbi.nlm.nih.gov/articles/PMC13062942/) · [Brevetoxin ED case-crossover](https://pmc.ncbi.nlm.nih.gov/articles/PMC13189565/) · [NIOSH ammonia](https://www.cdc.gov/niosh/npg/npgd0028.html) · [CAFO systematic review](https://pmc.ncbi.nlm.nih.gov/articles/PMC11365793/) · [NHANES lead/AR](https://pmc.ncbi.nlm.nih.gov/articles/PMC13456717/) · [JECS maternal lead](https://pubmed.ncbi.nlm.nih.gov/41921399/) · [AJRCCM pollutant mixture](https://pmc.ncbi.nlm.nih.gov/articles/PMC12432432/)

---
---

# CORRECTIONS — supersede the entries above

A late sub-sweep returned after the main report was assembled and materially corrects three entries.

## 1. Community viral prevalence — over-ranked. Reframe as seasonal term + interaction multiplier.

The #1 ranking rested on prevalence figures. The study that actually tests what the index needs cuts against it.

**Satia et al., PLOS One 2020 — Ontario, 649,666 asthma ED visits**, regressing visits on daily community multiplex-PCR positivity: viruses explained **1.5%** of asthma ED visits in the 5-virus era and **13.3%** once rhinovirus/hMPV/coronavirus were added. Compare 57–67% for RTIs and 41–53% for COPD in the same dataset. Rhinovirus was the only virus with any asthma signal, at r = 0.21. Conclusion: community viral epidemics are "only a modest contributor to asthma."

**The "80% of exacerbations are viral" figure is a prevalence statistic, not an attributable fraction.** One third of *stable* asthmatics carry a detectable virus at any moment (33.9% children, 23.0% adults, vs 58.8%/49.9% during exacerbation). Backing out the excess gives a **population attributable fraction of roughly 32%, not 80%**.

**What survives — the most useful design finding in the whole report:** viral status is a **multiplier on an allergen-sensitized, allergen-exposed person**, not an independent additive term. Murray 2005 (children): virus alone and sensitization+exposure alone were each non-significant in multivariate analysis, but all three together gave **OR 19.4 (3.7–101.5)**. Green 2002 (adults): virus alone OR 1.67 (0.69–4.07, null); all three **OR 8.4 (2.1–32.8)**. Build this as an interaction, not a sum.

**September epidemic, precisely:** peak at **17.7 days after Labor Day (95% CI 16.8–18.5)** in school-age children, adults 6.3 days later, magnitude 2.2× background, and 20–25% of all annual pediatric asthma hospitalizations fall in September. For 2026 (Labor Day Sept 7) the pediatric peak is around Sept 24–25.

**Correction to the NREVSS claim.** CDC does track rhinovirus, but verified by direct API query: **RV/EV is published for the nation and 10 HHS regions only. State-level rows exist solely for RSV and SARS-CoV-2.** Every wastewater program skips rhinovirus entirely (respiratory-shed, not fecally shed). So the virus that matters most for asthma has the worst spatial resolution. Workarounds: some states publish their own RV/EV (Wisconsin DHS, weekly, back to 2019); **CDC NSSP state-level ARI percent-of-ED-visits at 6-day lag** is a decent syndromic proxy in late summer/fall.

**Revised placement:** top-3, but as a seasonal calendar term plus an interaction multiplier, not a strong daily regressor.

## 2. Ammonia — argument was right, the evidence is better than stated

**Sigurdarson, O'Shaughnessy, Watt & Kline 2004** exposed eight mild asthmatics to **16–25 ppm ammonia** and/or grain dust as a CAFO model — grain dust produced a significant transient FEV1 decrement, **ammonia did not alter it**. That is ~50× the highest US community concentration ever recorded. Sundblad 2004 (5 and 25 ppm, 3 h, with exercise): subjective irritation only — no change in lung function, nasal lavage, exhaled NO, or methacholine responsiveness.

**New contradiction:** ambient NH3 fails as a PM2.5 leading indicator precisely where that story is told. In the Utah Winter Fine Particulate Study ammonium nitrate was 74±5% of aerosol mass, but **nitric acid is limiting and gas-phase NH3 stays in excess irrespective of particle mass** — same for San Joaquin. NH3 correlates with winter PM2.5 as a stagnation tracer under the same inversion, not as a precursor signal.

**Feed verdict:** AMoN uses 2-week integrated passive samplers — it can never support a daily index. The one defensible use is an AFO-plume proximity flag from public permit records plus forecast wind (r=0.62 vs measured NH3). Label it plume proximity, not an ammonia reading.

## 3. Lead — stronger exclusion

**EPA downgraded the determination in January 2024 and most secondary sources still quote the 2013 language.** The 2024 Pb ISA rates *Sensitization and Allergic Responses* as "Suggestive of, but not sufficient to infer, a causal relationship" (down from "likely to be causal"), *Autoimmunity* Inadequate, *Respiratory effects* Inadequate. Cornwell 2020 (NHANES, n=14,751, CDC authors): no asthma association (aPR 1.09, 0.76–1.59). Kinetics rule it out independently: blood-lead half-life is 20–30 days. **Exclude — not a close call.**

## 4. Traffic — two refinements

The **NEJM** figures are FEV1 up to 6.1% and FVC up to 5.4%; the 3.0–4.1% quoted above is the HEI reanalysis. The decrements are asymptomatic and below the 12% reversibility threshold — a physiologic signal, not an exacerbation.

**Karner 2010 (41 studies, 700+ measurements):** near-road decay sorts into three classes, and **PM2.5 mass shows no trend with distance at all**, while CO, UFP and NO2 do. A road-proximity feature is therefore close to orthogonal to the PM2.5 field AirNow reports — the argument for including it, even though the agent it proxies (UFP) is unmeasured by any regulatory network.

**Flag:** the HEI TRAP systematic review (Special Report 23) is about asthma *onset over years*, not exacerbation. Do not cite it for an acute index.

**Net effect on the ranking:** viral prevalence moves from "strongest single driver" to "strongest seasonal driver and a large interaction multiplier, but a weak daily regressor." Airway drying and wildfire smoke become the most defensible day-to-day terms. Lead and ambient ammonia are firmly excluded.

Correction sources: [Satia 2020](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0228544) · [Murray 2005](https://pubmed.ncbi.nlm.nih.gov/16227331/) · [Green 2002](https://pubmed.ncbi.nlm.nih.gov/11909786/) · [Sigurdarson 2004](https://pubmed.ncbi.nlm.nih.gov/15274960/) · [Sundblad 2004](https://pubmed.ncbi.nlm.nih.gov/15497768/) · [EPA 2024 Pb ISA](https://www.epa.gov/isa/integrated-science-assessment-isa-lead) · [Cornwell 2020](https://pubmed.ncbi.nlm.nih.gov/32068211/) · [Karner 2010](https://pubs.acs.org/doi/10.1021/es100008x)

---
---

# SWEEP 4 — PM2.5 composition, oxidative potential, VOCs, marine aerosol, and location-specific hazards

Verification note from the sub-agent: WebSearch budget ran out partway through; later work used the Europe PMC REST API and direct fetches. Items not verified are labeled [UNVERIFIED].

## 1. PM2.5 chemical composition and oxidative potential

### 1a. Composition as a weighting factor on mass — verdict: do not weight

**EPA's own ISA says no component beats mass.** The 2019 PM ISA (reaffirmed 2022) concludes "the evidence does not indicate that any one source or component is consistently more strongly related with health effects than PM2.5 mass." Short-term PM2.5 → respiratory effects is rated "likely to be causal."

- Tier B for "components differ somewhat"; Tier D for "we know enough to weight a mass number."
- Mechanism: transition metals (Fe, Cu, V, Ni) and quinones catalyze redox cycling; EC/BC acts as carrier. Sulfate/nitrate/ammonium largely redox-inert.
- **Peng 2009 (EHP, 119 counties, 12M Medicare):** in multipollutant models only EC → cardiovascular +0.80% and **OCM → respiratory +1.01% (0.04–1.98%)** per IQR survived. Sulfate, nitrate, silicon, sodium, ammonium: all null.
- **Bell 2009 (AJRCCM, 106 counties):** EC/Ni/V modified cardiovascular risk, but respiratory estimates lost significance when Queens or New York County were dropped — the Ni/V signal is substantially a single-city residual-oil artifact.
- **Krall 2017 (EHP, source-apportioned, 4 cities):** only **biomass burning** showed a consistent respiratory ED direction (Atlanta RR 1.006 per IQR at lag 2). Diesel and gasoline inconsistent. Dust: nothing.
- **Uppala 2025 (Thailand):** per 1 µg/m³ BC at lag 0, pediatric asthma hospitalization IRR 1.14–1.35 by age band. Largest per-unit acute BC estimate verified.

**Public feed: NO for measurement, PARTIAL for modeled.** CSN and IMPROVE are filter-based and badly lagged — **March 2026 CSN data were imported 9 Sept 2026, a 6-month lag.** The only real-time option is **Copernicus CAMS** global forecasts: 5-day speciated aerosol twice daily (dust, sea salt, OM, BC, sulfate, nitrate, ammonium), free via ADS API.

### 1b. Oxidative potential — promising, not deployable

- **Abrams 2017 (Atlanta, 196 days):** asthma ED, OP_DTT lag 0–2 RR 1.12 (1.03–1.22) per IQR vs PM2.5 mass RR 1.10 (1.04–1.17). In the bipollutant model both attenuated — **OP did not meaningfully outperform mass** (r = 0.55).
- **Weichenthal 2016 (Ontario, 127,836 cases):** glutathione-OP modified the PM2.5 effect only below 10 µg/m³; ascorbate-OP did not modify it at all. Two assays disagreed in the same study.
- Assay reliability contested: DTT artifacts from metal × phosphate buffer (PMID 37245366), protocol-dependent variability (PMID 39997928).
- **Public feed: NO.** Research instrument only.

### 1c. Acid aerosol — historically important, largely a dead end

Tier A at high concentrations; Tier D at modern ambient. Koenig (Seattle) found effects at 35–176 µg/m³ H2SO4; Linn/Avol (Rancho Los Amigos) found nothing at the same doses across four studies. Reliable effects only at 1,000–2,000 µg/m³. Cal EPA acute REL for sulfuric acid/sulfates is 120 µg/m³; modern US ambient sulfate is ~two orders of magnitude below. **Exception: volcanic acid plumes (§4d).**

## 2. Ambient outdoor VOCs — verdict: exclude

### Formaldehyde
Tier B for indoor → asthma *diagnosis*; Tier D for outdoor → acute *exacerbation*. McGwin 2010, Yu 2020, Lam 2021 meta-analyses are all indoor. **Lam 2021: childhood asthma exacerbation OR 1.08 (0.92–1.28) — null**, even at indoor concentrations. Outdoor is lower still.

### Acute RELs vs ambient (OEHHA, verified)

| Compound | Acute 1-h REL | 8-h REL | Endpoint |
|---|---|---|---|
| Formaldehyde | 55 µg/m³ | 9 µg/m³ | eye/respiratory irritation |
| Acrolein | 2.5 µg/m³ | 0.7 µg/m³ | eye + respiratory irritation |
| Benzene | 27 µg/m³ | 3 µg/m³ | developmental/hematologic (not respiratory) |
| Toluene | 5,000 µg/m³ | 830 µg/m³ | respiratory, nervous, eyes |
| Xylenes | 22,000 µg/m³ | 700 µg/m³ | nervous/respiratory/eyes |
| Sulfuric acid & sulfates | 120 µg/m³ | — | respiratory |

Acrolein is the only ambient VOC whose acute REL urban air plausibly approaches; [UNVERIFIED] measured ambient acrolein. Benzene's acute REL is not a respiratory endpoint.

**Public feed: effectively NO.** PAMS collects hourly speciated VOCs at sites in CBSAs ≥1M but with no real-time public publication. AirNow carries no VOCs.

## 3. Sea spray, marine aerosol, algal toxin aerosol

### 3a. Sea spray / coastal air — no evidence either way
Tier D. Europe PMC sweep returned essentially nothing. "Sea air is good for asthma" has no supporting base; neither does the converse.

### 3b. Florida red tide (*Karenia brevis*) brevetoxin — the strongest non-AQI factor in this sweep
Tier A (panel beach-exposure with measured aerosol toxin) plus Tier B (ED time-series).
- **Fleming 2009 (87 asthmatics, 1 h at beach):** at aerosol brevetoxin >57 ng/m³, significant symptom increases — **but no change in pulmonary function at 1 h.** Larger in unmedicated and inland-dwelling subjects.
- **Fleming 2011 (5-day follow-up):** after a single 1-hour exposure, symptoms elevated for at least 4 days; peak flow fell, fell *further* at 24 h, **still suppressed at 5 days.** Lag structure is days, not hours.
- **Kirkpatrick 2006 (Sarasota ED, 2001 bloom vs 2002):** no significant increase overall, but for residents within **1.6 km of shore**: respiratory admissions **+54%**, **asthma +44%**. No increase inland. ~One-mile band.
- **Rizzo 2026 (pediatric case-crossover, SW Florida):** same-day waterborne + aerosolized exposure → ~50% higher odds of respiratory ED visits.
- **Contradicted belief:** red tide does not produce same-hour spirometric drops; it produces symptoms at 1 h and lung-function decline at 24 h persisting for days. Needs a multi-day decay and a distance-to-shore term.
- **Public feed: PARTIAL** [UNVERIFIED] — NOAA HAB-OFS, FWC red tide status, Mote Beach Conditions Reporting System all exist.

### 3c. Sargassum decomposition (H2S + NH3)
Tier B/C. **Banydeen 2026 (Martinique, 335 patients):** ambient H2S and NH3 from decomposing sargassum were independent predictors of airflow obstruction; **asthmatics showed twofold FeNO elevation.** Caribbean, Mexican, West African coasts.

## 4. Everything else that survived scrutiny

### 4a. Thunderstorm asthma — Tier B
- **Price 2023:** Melbourne 2016, ruptured grass pollen rose 250% during outflow; elevated ozone 6 h prior as possible precursor.
- **Hughes 2022:** GP encounters +605%, est. 8,940–13,689 extra encounters.
- **Hughes 2026 (Melbourne 2017–2022):** high grass pollen + fungal spores **interacting with rainfall** — at ~45 mm with elevated allergen, ~fourfold increase predicted; on low-rainfall days allergen alone had minimal impact. **The interaction term is the factor, not either input.**
- **Diver 2025 (Leicester, June 2023):** *Cladosporium* spores central to UK events. China events involve mugwort.
- **Public feed: PARTIAL.** Fungal spore counts are the missing input.

### 4b. Dust storms — Tier B, clean and forecastable
- **Zheng 2025 (JAMA Netw Open, AZ/CA/UT, NWS storm reports):** asthma RR 1.06 (1.01–1.11) at lag 0–2, strongest respiratory association.
- **Rowan 2024:** respiratory ED +3.7% at lags 1–2, +5.0% at lag 3.
- **Lag 0–3 days, often strongest at lag 2–3** — later than same-day PM2.5.
- **Public feed: YES.** NWS storm reports, CAMS dust forecasts (2×/day, 5-day, free).

### 4c. Agricultural and sugarcane burning — Tier B, location-specific
- **Mnatzaganian 2015 (Maui sugarcane):** highest quartile acreage burned → OR 2.4 (1.2–4.8) for acute respiratory distress; controlled for vog.
- **Kamai 2023 (Imperial Valley):** per additional burn day in prior year, +1.1 pp wheeze; among asthmatic children +14% (imprecise). 12-month window — sub-acute.
- **Public feed: PARTIAL** [UNVERIFIED] — NASA FIRMS, NOAA HMS, state burn permits.

### 4d. Volcanic vog — Tier B, a genuine AQI blind spot
- **Tam 2016 (Hawai'i, four exposure zones):**

  | Zone | SO2 (ppb) | PM2.5 (µg/m³) | Acid (nmol H+/m³) |
  |---|---|---|---|
  | Low | 0.3 | 2.5 | 0.6 |
  | Frequent | 10.1 | 4.8 | 4.3 |
  | **Acid** | **1.2** | **7.2** | **25.3** |

  The acid zone has low SO2 and modest PM2.5 but **~40× the acidity.** Neither AQI channel resolves it.
- **Carlsen 2021 (Nat Commun, Reykjavík at 250 km from Holuhraun):** exposure to the **mature** plume (converted to sulfate) → +23% respiratory healthcare utilization, **+19.3% asthma medication dispensing.** The immature SO2-rich plume was the lesser hazard.
- **Contradicted belief:** monitoring SO2 is not monitoring vog.
- Hawai'i, Iceland, Italy, Indonesia, Japan, Vanuatu.

### 4e. Fireworks — Tier B for exposure; a real AQI *averaging* failure
- **Masri 2023 (Santa Ana CA):** July 4 PM2.5 three-to-five times baseline, **hourly >160 µg/m³**; peaks over twice as high in lower-SES, higher-asthma communities.
- **Mousavi 2021 (751 PurpleAir sensors, CA):** 67–81% of counties showed immediate July 4 impact.
- **The averaging problem:** a 3–6 h spike at >160 µg/m³ averages into a 24-h value of 30–45 µg/m³ — "Moderate"/"USG" — while the actual inhaled hourly dose is several times an "Unhealthy" threshold. **An hourly-resolution index materially outperforms the regulatory AQI here.**
- [UNVERIFIED] fireworks → asthma-ED time-series.
- Date-driven, trivially forecastable. **Public feed: YES** — PurpleAir hourly.

### 4f. Barcelona soybean dust — proof-of-concept for point-source allergens
**Antó/Sunyer 1999 (Thorax):** repeated asthma outbreaks 1981–1987 traced to harbour soybean unloading. Installing bag filters on the silo → complete disappearance. Post-intervention allergen 31–269 U/m³ vs ≥1,500 U/m³ on every epidemic day. A generic AQI would have shown nothing. Point-source; no feed.

### 4g. Temperature inversions / stagnation — Tier C/D, not worth it
No evidence that inversion or boundary-layer height adds predictive value beyond measured concentrations. Yang 2025 (random forest, Tianjin) ranked BLH "of lesser importance." Could earn a place as a *forecast* input, not a same-day term.

### 4h. Not verified — do not include without further work

| Candidate | Status |
|---|---|
| Ambient endotoxin (LPS) | Only indoor/occupational/animal work found. |
| Ambient H2S / geothermal (Rotorua, Iceland) | No studies found — suspicious null. |
| Construction / road dust vs coarse PM | Nothing separating it from general PM10. |
| Ultrafine particle number vs PM2.5 mass | No public UFP network confirmed. |
| O3/NO2-nitrated pollen allergens | No population-level interaction estimate beyond Melbourne rainfall. |
| *Alternaria* / *Cladosporium* spore-count threshold | No isolated spores/m³ threshold with effect size obtainable. |
| Prescribed burns vs wildfire | Not verified separately. |
| Ostreopsis, cyanobacteria aerosol, domoic acid | Not reached. |

## Sweep 4 — what to put in the index

Ranked by evidence × feed availability × population reached:
1. **Hourly rather than 24-hour PM2.5** — biggest single win, no new science, captures fireworks, near-field smoke, rush-hour peaks. PurpleAir API.
2. **Dust storm flag, lag 0–3 days** — RR 1.06, clean feed (CAMS / NWS).
3. **Thunderstorm-asthma interaction term** (pollen load × storm outflow), seasonal.
4. **Red tide, where applicable** — largest per-event effect (+44% asthma admissions within 1.6 km), multi-day decay + distance-to-shore term.
5. **Vog acidity, where applicable** — SO2 channel reads near-background where the sulfate hazard is worst.
6. **Biomass-burning fraction of PM2.5** — the only source-apportionment signal that replicated across four US cities; CAMS OM/BC forecasts.

**Explicitly not:** PM2.5 species weighting (EPA says no; feed 6 months late), oxidative potential (no feed, contested assays, didn't beat mass), acid aerosol at North American ambient levels, ambient outdoor VOCs (acute exacerbation null even indoors, no feed), sea spray (no evidence either direction).

## Sweep 4 sources

**PM composition / OP:** [EPA PM ISA](https://www.ncbi.nlm.nih.gov/books/NBK588510/) · [Peng 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2702413/) · [Bell 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2695497/) · [Krall 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5226704/) · [Abrams 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5933307/) · [Weichenthal 2016](https://pubmed.ncbi.nlm.nih.gov/26963193/) · [Bates 2019](https://pubs.acs.org/doi/abs/10.1021/acs.est.8b03430) · [DTT artifacts](https://pubmed.ncbi.nlm.nih.gov/37245366/) · [DTT variability](https://pubmed.ncbi.nlm.nih.gov/39997928/) · [Acid aerosol review](https://pmc.ncbi.nlm.nih.gov/articles/PMC1405148) · [2025 constituents meta-analysis (abstract only)](https://pubmed.ncbi.nlm.nih.gov/40478447/)

**Feeds:** [EPA CSN](https://epa.gov/amtic/chemical-speciation-network-csn) · [CIRA/FED update log](https://views.cira.colostate.edu/fed/Pub/Updates.aspx) · [EPA PAMS](https://www.epa.gov/amtic/photochemical-assessment-monitoring-stations-pams) · [CAMS global forecast docs](https://confluence.ecmwf.int/spaces/CKB/pages/212454117/CAMS+Global+atmospheric+composition+forecast+data+documentation)

**VOCs:** [OEHHA REL table](https://oehha.ca.gov/air/general-info/oehha-acute-8-hour-and-chronic-reference-exposure-level-rel-summary) · [McGwin 2010](https://pmc.ncbi.nlm.nih.gov/articles/PMC2854756/) · [Lam 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8011796/)

**Marine / HAB:** [Fleming 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2717136/) · [Fleming 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3076944/) · [Kirkpatrick 2006](https://pmc.ncbi.nlm.nih.gov/articles/PMC2847280/) · [Rizzo 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC13189565/) · [Dahlin 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11572989/) · [Banydeen 2026](https://pubmed.ncbi.nlm.nih.gov/42036223/)

**Everything else:** [Price 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10469229/) · [Hughes 2022](https://pubmed.ncbi.nlm.nih.gov/35224587/) · [Hughes 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC13370029/) · [Diver 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12007050/) · [Zheng 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC11822549/) · [Rowan 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11247357/) · [Sadeghimoghaddam 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8249988/) · [Mnatzaganian 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4596502/) · [Kamai 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10592232/) · [Slater 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC12824637/) · [Tam 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4905765/) · [Carlsen 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8042009/) · [Masri 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC11392046/) · [Mousavi 2021](https://pmc.ncbi.nlm.nih.gov/articles/PMC8198140/) · [Antó 1999](https://pmc.ncbi.nlm.nih.gov/articles/PMC1745541/) · [Uppala 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12376452/) · [Yang 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC11868287/)
