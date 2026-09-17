# Validating `dry_spore_index` against measured counts

Run 2026-09-16 with [`scripts/spore_eval.py`](../scripts/spore_eval.py) and
[`scripts/spore_sweep.py`](../scripts/spore_sweep.py). Every number here is
reproducible offline from the cache those scripts write. Backing evidence for
[spec 37](../specs/37-local-models.md).

## Method

National Allergy Bureau genus-level counts joined to ERA5 hourly weather at each
station's own coordinates. `dry_spore_index` computed exactly as
`drySporeIndex()` does it in `src/sources/openMeteo.ts` — per hour, five
conditions counted, daily peak taken — plus eleven other candidate formulations.
July–October only, matching `inDrySporeSeason`. Spearman rank correlation with a
Fisher-z interval, because spore counts are lognormal and one 2,500-spore day
would otherwise drag a Pearson around by itself.

Six stations release values through the public API. Seventeen more within 900
miles list their collection dates and return null for every value.

| station | days | with Alternaria | median Alt | in-season n |
|---|---|---|---|---|
| Toledo, OH | 1,819 | 1,477 | 28 | 725 |
| Olean, NY | 2,581 | 1,963 | 5 | 1,022 |
| London, ON | 5,909 | 1,644 | 18 | — |
| Melrose Park, IL | 3,137 | 2,678 | 124 | — |
| Springfield, NJ | 1,994 | 541 | 0 | — |
| Silver Spring, MD | 5,220 | 5,054 | 4 | — |

Median Alternaria spans 30× across stations, which is counting practice as much
as air. Fixed thresholds do not transfer; the sweep uses each station's own 75th
percentile.

## Result 1 — the shipped index carries almost no signal

In-season Spearman rho vs Alternaria, pooled per station. `*` = 95% CI excludes zero.

| candidate | Toledo | Olean | London | Melrose Pk | Springfield | Silver Spr |
|---|---|---|---|---|---|---|
| **vpd_lag1** | +0.242* | +0.159* | **+0.498*** | +0.273* | +0.248* | +0.139* |
| t_max | +0.162* | +0.106* | +0.394* | +0.089* | +0.310* | +0.139* |
| shipped_lag1 | +0.149* | +0.109* | +0.338* | +0.194* | +0.095 | +0.094* |
| vpd_max | +0.126* | +0.131* | +0.327* | +0.082* | +0.255* | +0.265* |
| rh_min_inv | +0.045 | +0.110* | +0.082 | +0.060* | +0.142* | +0.288* |
| **shipped_v1 (as shipped)** | +0.071 | +0.075* | +0.198* | +0.080* | +0.082 | +0.211* |
| gated_release | +0.071 | +0.102* | +0.147* | −0.007 | +0.022 | +0.026 |
| dry_run | −0.035 | −0.008 | +0.070 | +0.047 | −0.007 | +0.178* |

Yesterday's max vapour pressure deficit beats the shipped index at all six
stations and is significant at all six. At Toledo the shipped index cannot be
distinguished from zero at n = 725.

**The five-condition count is worse than its own simplest input.** `t_max` alone
scores +0.162 at Toledo against the count's +0.071. Two of the five conditions
are nearly free — wind >2 m/s is met 73% of in-season hours and 7-day rain ≥5 mm
is met 81% — so they contribute a constant offset and dilute the two that carry
information.

**`gated_release` was my attempt at a better shape and it is the worst candidate
on the board.** Gating on the wet week destroys signal rather than focusing it.

## Result 2 — the index describes the median in-season day

Ten seasons of hourly weather, 2015–2025, daily peak index:

| index | Ann Arbor | New Haven |
|---|---|---|
| ≥4 (the level-2 line) | **61.7%** | **57.6%** |
| =5 | 18.6% | 15.2% |

The level-2 threshold fires on the majority of in-season days. The diurnal swing
is larger than the weather signal: mean index 2.01 at 6 am and 3.43 at 4 pm in
Ann Arbor, so logging after an afternoon walk roughly 2.5×'s the odds of
recording an elevated hour independent of the weather.

## Result 3 — held out, most models are at chance

Chronological split, exceedance of each station's own p75, cutoff tuned on train
only, Hanley–McNeil intervals. `*` = CI excludes 0.50.

| model | Toledo (n=72) | Olean (n=365) | Melrose Pk (n=227) | Silver Spr (n=514) |
|---|---|---|---|---|
| vpd_lag1 | 0.599 | **0.650*** | 0.505 | 0.518 |
| rh_min_inv | 0.282 | 0.575* | 0.546 | **0.654*** |
| shipped_lag2 | 0.519 | 0.574* | **0.640** | 0.497 |
| shipped_aft | 0.602 | 0.589* | 0.571 | 0.624* |
| shipped_v1 | 0.472 | 0.590* | 0.575 | 0.583* |

Three stations with a readable test set, three different winners. Nothing clears
chance at Toledo. Every model at every station sits at or below the
majority-class accuracy baseline.

At Toledo's clinical threshold (Alternaria ≥100 /m³, train 2015–2019, test
2020–2023, n = 223) every model's interval includes 0.5, and `shipped_v1` scores
**0.419** — below chance.

## Result 4 — the literature's best model does not transfer

Catalonia logistic form (Vélez-Pereira et al.): nine terms, Tmax and Tmin plus
their squares, rain at lags 0–3, mean RH. Published performance in Spain is mean
sensitivity 69.0% and specificity 77.0% across 188 models, trained 1995–2011 and
tested 2012–2014.

At Toledo, ≥100 /m³, held out on 2020–2023:

| | AUC | 95% CI |
|---|---|---|
| published Spanish coefficients, four bands | 0.515–0.540 | all include 0.5 |
| same form refit on Toledo 2015–2019 | 0.512 | [0.431, 0.594] |

Not a coefficient problem. The form has nothing to work with there.

## Result 5 — day-of-year climatology is also at chance, in season

Leave-one-year-out median count for the same day-of-year: rho = **−0.061**
[−0.133, +0.012] at Toledo. Within July–October the calendar tells you nothing,
so the weak weather correlations above are not seasonal confound.

The baseline is confounded where a station trends: Olean scores −0.338 because
its Alternaria levels rose sharply across the record (train block 10.7%
positive, test block 29.6%). Detrend before using it elsewhere.

This matters for reading the literature. Ščevková's lasso models rank
`month_sin` and `month_cos` first and second at every site with coefficients of
1.0–5.8 against temperature's 0.02–0.20, and perform identically at 1-day and
7-day horizons. That is a seasonal climatology with a weather correction bolted
on, and it works because they model the full year.

## Result 6 — PM coarse fraction is zero

Alternaria vs EPA daily PM within 50 miles of the Toledo trap, n = 564:

| | rho | 95% CI |
|---|---|---|
| PM10 | −0.038 | [−0.120, +0.045] |
| PM2.5 | +0.044 | [−0.039, +0.126] |
| coarse (PM10 − PM2.5) | −0.074 | [−0.156, +0.008] |

Below the published Bratislava figure of 0.156. Widening to 80 miles gives
coarse = −0.089, marginally significant and negative, on monitors in the Detroit
industrial corridor — that is industrial dust, not biology.

**Within 25 miles of the trap there are two PM10 monitors, both ~24 miles out,
both sampling 1-in-6 days**, giving 47 paired in-season days over six years. PM10
is a 1-in-6 parameter at most US sites, so this proxy is not merely weak near NAB
stations, it is largely untestable there.

## Data access

Nine of 26 stations within 900 miles of Hamden or Ann Arbor release values.
Seventeen list dates and withhold them, including **Waterbury CT (2,248 days, 18
miles from home)**, Dayton OH (3,696), Mount Laurel NJ (3,045), Philadelphia PA
(2,302), Albany NY (1,969), Erie PA (1,910).

`station(id:){allergenCollectionSets{date}}` returns their dates.
`allergenCollectionSet(id:)` returns null for every one, and every root-level
filter misses them. A per-station release setting, not a query bug.

Three API behaviours worth remembering, all handled in the harness: offset
pagination returns overlapping pages and silently drops about half a record, so
paginate by date range and assert against the station's own date list; the server
rate-limits into a null field with a `WIN32` error that clears after ~15 s; and
some non-null-declared fields are null in the data, so partial responses are
normal.

## The ceiling nothing here can clear

Airborne Alt a 1 allergen vs Alternaria conidia, daily, Barcelona: rho = 0.548
(n=153) and 0.631 (n=160). The count explains 30–40% of the variance in the
allergen actually in the air, and 31.3% of Alt a 1 rides on PM2.5–10 fragments
below intact-spore size. For Aspergillus the allergen and the count are
decoupled entirely.

Every model above is fitted against counts and inherits that ceiling. A model at
AUC 0.65 against counts is at some lower and unmeasured number against the thing
that triggers asthma.

## Hyperlocal PM: the regulatory network missed three of four days

Separate question, same five days. PurpleAir sensors near both locations, 10-minute
averages, compared against the surrounding ±4 days at the same sensor.

| date | sensor | dist | PM2.5 median | ±4d window | ratio | regulatory daily mean |
|---|---|---|---|---|---|---|
| 2019-11-02 | Burns Park | 1.2 mi | **13.8** | 6.7 | **2.05×** | 6.5–9.2 (hourly max 12.9) |
| 2020-08-23 | Burns Park | 1.2 mi | **16.1** | 10.1 | **1.59×** | 11.9–13.8 |
| 2023-09-30 | Burns Park | 1.2 mi | **22.4** | 13.2 | **1.70×** | 13.0–15.4 |
| 2024-09-15 | Hyperion | 0.3 mi | 16.6 | 16.4 | 1.02× | 8.0 |
| 2025-10-04 | Whitneyville | 3.5 mi | 3.5 | 2.9 | 1.19× | 9.6 |

On 2019-11-02 the local sensor's median exceeded the regulatory network's maximum hourly
value for the entire day. Every official index called that day Good.

**Not the humidity artifact.** PurpleAir `_atm` inflates with humidity, so the check that
matters is whether the day's RH exceeded its own baseline. Sensor-internal RH on each Ann
Arbor day sits within 2 points of its window (60/60, 50/49, 100/100, 45/47), so the same
bias applies to both halves of every ratio. Absolute values still run high against FEM and
need the EPA/Barkjohn correction, which is defined on `pm2.5_cf_1` rather than `_atm`.

Two useful controls. 2024-09-15 shows no elevation and used the *closest* sensor at 0.3 mi,
so this is not a Burns Park artifact. Hamden on 2025-10-04 read 3.5 µg/m³, below its
regulatory monitor's 9.6 — the discrepancy runs both directions.

Caveats: one sensor per date, ±4-day window, n=4. The 2023-09-30 RH channel is pinned at
100 on both day and window, so that humidity check is weaker than the others.

## Harvest timing, and what it does not explain

USDA NASS Quick Stats, Michigan statewide weekly progress. Corn **silage** runs four to six
weeks ahead of grain, and separating the two by `util_practice_desc` matters — a combined
series reads as impossible negative rates.

| date | corn silage | weekly rate | grain |
|---|---|---|---|
| 2019-11-02 | 86 → 91% | +5 | 21 → 25% |
| 2020-08-23 | **0 → 9%** | +9 (season's first week) | not started |
| 2023-09-30 | **46 → 67%** | **+21** (season peak) | 1 → 7% |
| 2024-09-15 | **39 → 59%** | **+20** (season peak) | 2 → 3% |

Three of four dates sit at silage onset or the season's peak rate, including the August date
that grain harvest does not cover at all.

The mechanism does not survive testing. Ohio silage harvest rate vs Toledo counts, daily
rate interpolated from weekly cumulative percentages, 2015–2023:

| | rho | 95% CI | n |
|---|---|---|---|
| silage rate vs Alternaria | −0.041 | [−0.151, +0.071] | 313 |
| silage rate vs Cladosporium | +0.113 | [+0.002, +0.222] | 312 |
| grain rate vs Alternaria | −0.014 | [−0.141, +0.113] | 240 |

Silage activity does not predict Alternaria. If silage matters it would be as dust rather
than spores, and the coarse-fraction data near Ann Arbor is too sparse to test that —
which is precisely the gap the PurpleAir result above fills.

## Reproduce

```bash
scripts/spore_eval.py pull "Toledo, OH"
scripts/spore_eval.py eval --station "Toledo, OH" --target alternaria
scripts/spore_eval.py classify --station "Toledo, OH" --threshold 100 --train-through 2019
scripts/spore_sweep.py
```

The cache is gitignored. NAB terms prohibit redistribution and commercial use, so
do not commit it and do not ship anything trained on it without settling spec 37
§1 first.
