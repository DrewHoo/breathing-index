# Local models — validate per station, ship only where validated

**Status:** proposed 2026-09-16. Evidence in [`research/proxy-validation.md`](../research/proxy-validation.md), harness in [`scripts/spore_eval.py`](../scripts/spore_eval.py) · **Effort:** L · **Deps:** [28-mold.md](28-mold.md) (the proxy this replaces), [15-premium-sources.md](15-premium-sources.md) (paid data), relay · **Priority:** medium. Two questions gate the plan: licensing (§1) and whether a validated model may travel at all (§5).

## Problem

`dry_spore_index` ships to every location on earth and was validated at zero of them. It counts how many of five weather conditions hold — temp >20 °C, RH <60%, wind >2 m/s, under 0.5 mm rain in 48 h, at least 5 mm in 7 d — and the count is the number the row prints.

It has now been validated against six NAB stations that publish genus-level counts. The results kill it and point at what replaces it.

**It carries almost no signal, and a single variable from the same weather data carries more.** In-season Spearman rho against Alternaria, all years pooled per station, `*` where the 95% CI excludes zero:

| | Toledo OH | Olean NY | London ON | Melrose Pk IL | Springfield NJ | Silver Spring MD |
|---|---|---|---|---|---|---|
| `dry_spore_index` | +0.071 | +0.075* | +0.198* | +0.080* | +0.082 | +0.211* |
| yesterday's max VPD | +0.242* | +0.159* | **+0.498*** | +0.273* | +0.248* | +0.139* |

Yesterday's vapour pressure deficit beats the shipped index at all six. It is significant at all six. The five-vote count was encoding the same idea — how thirsty the air was — and encoding it badly, because two of its five conditions are met 73% and 80% of the time in a Great Lakes autumn and contribute a constant rather than a signal.

**Held out, the shipped index is worse than a coin flip.** Train on early years, test on years the fit never saw, predicting exceedance of each station's own 75th percentile: `dry_spore_index` scores AUC 0.472 at Toledo and 0.419 at Toledo's clinical-threshold variant. Two stations put it below 0.5.

**The best model is not the same model everywhere.** Held-out AUC, the four stations with a test set large enough to read:

| model | Toledo (n=72) | Olean (n=365) | Melrose Pk (n=227) | Silver Spring (n=514) |
|---|---|---|---|---|
| yesterday's VPD | 0.599 | **0.650*** | 0.505 | 0.518 |
| 100 − min RH | 0.282 | 0.575* | 0.546 | **0.654*** |
| shipped, lagged 2 d | 0.519 | 0.574* | **0.640** | 0.497 |

Three stations, three different winners. Nothing is above chance at Toledo at all.

**The literature's best model transfers at chance.** The Catalonia logistic form — nine terms, quadratic temperature, four rain lags, humidity, trained 1995–2011 and tested 2012–2014 in Spain at mean sensitivity 69% and specificity 77% — scores AUC 0.515–0.540 at Toledo with its published coefficients and 0.512 refit on Toledo's own training years. It is not a coefficient problem. The form has nothing to work with there.

So the shape of the current feature is wrong. One global proxy assumes the relationship between weather and spores is the same everywhere, and six stations say it is not. Location should decide which model runs, and a location with no validation behind it should get no model.

## Design

**1. The licensing question comes first, exactly as it did in spec 28.**

The NAB's terms prohibit use without written consent, and the AAAAI "chooses not to release data for commercial or for-profit use" ([NAB Data Release Information](https://allergist.aaaai.org/forms/NABDataReleaseInformation.pdf)). Spec 28 §1 settled this for *displaying* counts. It does not settle using those counts as training labels for a model we then ship, which is a different act and a stronger claim on the data.

A formal request needs a named PI, an institution, a 150-word abstract, board approval and per-station sign-off, and takes up to 12 weeks. That is a real path for a personal research project and a closed door for anything with a supporter tier attached.

Resolve before building. If the answer is no for commercial use, the fork is: keep this personal and unmonetised, or train only on sources whose licence permits it (§2).

**2. Expand the corpus, because six stations is not enough to characterise a continent.**

Of 26 stations within 900 miles of Hamden or Ann Arbor with any record, **nine release values through the public API and seventeen withhold them.** Waterbury lists 2,248 collection dates 18 miles from the house and returns null for every one. Dayton lists 3,696, Mount Laurel 3,045, Philadelphia 2,302. The data exists and is not public.

Three routes to more, in cost order:

| source | what it is | cost | licence |
|---|---|---|---|
| AAAAI data request | the withheld stations, including Waterbury | free, ≤12 weeks | research only, no commercial use |
| [Aerobiology Research Laboratories](https://aerobiology.ca/historical-data/) | 30+ Canadian cities, 10–21 years, pollen **and** fungal spores | **$21–36 per sample** | commercial terms on request |
| station operators directly | Randolph (Waterbury), Safadi (Toledo), Anderson (London) | free, unpredictable | per-operator |

Aerobiology is the one that is simply purchasable. Windsor, Ontario is 36 miles from Ann Arbor and in the same airshed, and Windsor counts spores. Twenty station-seasons at ~90 in-season days each is roughly $38k at list, which is not the shape of this purchase — but a targeted buy of two or three stations' fall seasons to test a specific hypothesis is a few hundred dollars and is worth budgeting for.

Dayton is a regional air pollution agency (RAPCA), so its 3,696 days may be FOIA-able at zero cost. Worth one letter before paying anyone.

**3. The harness is the unit of work, and it moves into the repo.**

`spore_eval.py` already does the pull, the join, the candidate registry, the rank-correlation leaderboard, the held-out exceedance classifier with IRLS logistic fitting, and the cross-station sweep. It caches everything to disk, so a rerun is offline and byte-identical. Move it to `scripts/`, keep the cache out of git, and treat adding a candidate as a one-line change to `CANDIDATES`.

Three things it learned about the NAB API that belong in the code and not in anyone's head: the root collection genuinely does not expose some stations' sets under any filter, offset pagination returns overlapping pages and silently drops about half a record, and the server rate-limits into a null field with a WIN32 error that clears after roughly fifteen seconds. All three are handled and commented. The date-range pagination asserts recovered dates against the station's own list before returning, which is how the withheld-value stations were found at all.

**4. Fit per station, and do not let the selection itself overfit.**

Twelve candidates scored on one station's held-out set is twelve chances to clear 0.5 by luck. At n=365 the 95% CI on an AUC of 0.65 is roughly ±0.06, so a naive best-of-twelve is picking a winner from inside the noise.

Protocol per station:

- Three-way chronological split, no shuffling: fit on the earliest years, select the candidate on a middle validation block, report on a final test block the selection never saw. Ščevková's design (train ≤2018, tune 2019–21, test 2022–24) is the reference, and it is stronger than Grinn-Gofroń's unspecified repeated k-fold, which almost certainly leaks across adjacent days.
- Exclude the two weeks either side of a split boundary, because the antecedent-rain windows reach back 7 to 14 days and would otherwise cross it.
- A station qualifies only if its test block holds at least 150 in-season days with both classes present. London and Springfield NJ currently fail this and are excluded rather than quietly reported.
- Report AUC with a Hanley–McNeil interval, and the majority-class accuracy alongside, because every model in this exercise so far sits at or below it.

**5. A validated model travels a bounded distance, and the bound is a judgement call.**

The evidence on how far a station's air describes a person's air:

- Two rotoslide samplers **one metre apart** differ by 18% (Raynor 1975).
- Three Burkard traps within 30 km of each other in Sydney logged spring totals of 14,382, 11,584 and 9,269 grains/m³, a 1.55× spread, with 8–17% disagreement on day classification (Katelaris 2004). Their own conclusion: one trap is a reasonable estimate across a 30 km region for informing the public, and clinical work needs local data.
- Two Hirst traps **50 km apart** in Qatar correlate at r = 0.420 for total pollen, not significant for six individual taxa.
- Physician-visit risk decays at **RR 0.992 per additional 10 miles** from the pollen site (Smith 2025). At 43 miles that is ~3–4% attenuation, real but survivable.

So 30 km is where the literature stops claiming homogeneity, and the health signal degrades gently well past it. Armonk is 43 miles from Hamden, outside the first bound and inside the second.

The proposal: **a model covers a location within 100 km of its station when the two share a Köppen climate class, and within 50 km otherwise.** Both numbers are arguable and neither is derivable from anything we have. The alternative — cover nothing beyond 30 km — leaves the app with no mold model anywhere in Connecticut, which is the status quo it is trying to fix.

*Open question: is 100 km too generous? A cheaper and more defensible rule is to require the model to validate at two stations before it covers anything, and then cover the convex region between them. That trades coverage for confidence and I do not know which you want.*

**6. The registry is a static artifact, not a service.**

A JSON file in the bundle: station id, coordinates, climate class, the winning candidate's name, its fitted coefficients, the test-block AUC and its interval, the test n, the years, and the date the validation ran. The client picks the nearest covering entry and runs a pure function over weather it already fetches. No new network call, no relay change, no runtime fitting.

Regenerating it is a script run, reviewed as a diff. A model whose coefficients move is a visible change in a pull request rather than a silent drift.

**7. The row says which station validated it, the way the mold row already names its station.**

Spec 28 §10 established that a number with no station and no date is the kind of number this app exists not to print. The same rule applies harder here, because a model is a claim about a relationship rather than a reading.

Covered: `Dry-spore conditions · model validated at Olean, NY (289 mi) · estimate`. Uncovered: no row. Not a zero, not a global fallback — absent, for the reason spec 28 already gives, that a February vector carrying `dry_spore_index: 0` reads to every tolerance bound as a day this person handled fine.

The `estimated` flag stays on regardless. A validated model is still a weather pattern standing in for a microscope, and the provenance rule is the only thing keeping it from confirming a bound no microscope ever stood behind.

**8. Changing the model retires the bounds learned against the old one.**

Bounds are source-scoped, and a model swap is a source change. Someone who has logged against `dry_spore_index` for a season and then moves into coverage of an Olean-validated VPD model starts a fresh bound set. That is correct behaviour and it is a real cost, paid knowingly: a user loses accumulated evidence on one variable to gain a variable that means something.

Two mitigations, neither free. Ship the swap once rather than tuning the registry continuously, so nobody pays this twice in a season. And keep the old variable's history readable in the diary and the evidence panel, the way the retired weather features are kept, so the entries do not lose their words.

**9. Stations die, and a validated model outlives its validation.**

Waterbury stopped in 2022. Toledo's public record ends 2025-05-16 and its in-season day count fell from 115 in 2015 to 21 in 2023. Olean and Silver Spring are still counting. A registry entry whose station has gone dark is a model nobody can re-validate and nobody can falsify.

Carry the station's last-count date in the entry, and print it. Past some staleness the entry should expire rather than quietly keep serving — 3 years is a guess and the right number depends on how fast a local relationship actually drifts, which nothing in the literature measures.

**10. The reference variable is itself lossy, and the copy should not pretend otherwise.**

Airborne Alt a 1 allergen correlates with Alternaria conidia counts at rho = 0.548 (n=153) and 0.631 (n=160) on daily data. So the count explains 30–40% of the variance in the allergen actually in the air, and 31.3% of Alt a 1 rides on PM2.5–10 fragments below intact-spore size that no count can see. For Aspergillus the allergen and the count are decoupled entirely.

Every model in this spec is fitted against counts, so every model inherits that ceiling. A model at AUC 0.65 against counts is at some unknown and probably lower number against the thing that triggers asthma. That belongs in the glossary entry, not buried here.

## Acceptance

- The harness reproduces the current numbers from cache with no network: `dry_spore_index` vs Alternaria at Toledo is rho = 0.071, CI [−0.002, +0.143], n = 725.
- A station whose values the API withholds fails with the reason rather than returning a partial record. Fixture: Waterbury reports 2,248 listed dates and zero released values.
- The registry contains only entries whose test block held ≥150 in-season days with both classes present, and every entry carries its AUC, interval, n, years and last-count date.
- A location inside coverage renders the dry-spore row with its validating station and distance; a location outside coverage renders no dry-spore row and the vector carries no `dry_spore_index` key.
- Selection is made on a validation block and reported on a test block that selection never saw, and the report prints the majority-class accuracy beside every AUC.
- Fixture: Hamden resolves to its nearest covering entry, or to none, and the choice is visible in the exposure series' `siteNames`.

## Non-goals

Runtime fitting on device. Per-user model selection — the diary already learns per-user bounds and that is the personalisation layer. Predicting concentration rather than exceedance; the field abandoned that and our own leaderboard shows why. Buying a real-time commercial feed (that is spec 15's question, not this one). Any model whose inputs include yesterday's measured spore count, because the whole point is places with no counting station.

## Open questions

1. **Commercial use.** Does the app ever monetise? If yes, NAB-trained models are out and the corpus has to be Aerobiology or operator-licensed data. This decides the budget before it decides anything else.
2. **Coverage radius.** 100 km with a climate match, 50 km without, or the stricter two-station rule in §5? The strict rule leaves Connecticut uncovered.
3. **Uncovered behaviour.** No row at all, or a global model clearly labelled as unvalidated? Spec 28's own reasoning argues for no row, and no row means most users see the feature disappear.
4. **Staleness expiry.** How many years after a station goes dark does its model stop shipping?
5. **Is the honest answer to ship none of this?** The best held-out AUC across six stations is 0.654, at one station, for a model that is not the winner at any other. A feature that is right 65% of the time about a variable the user cannot check may be worse than no feature. I lean toward shipping the VPD swap (§ Problem) on its own, which is a strict improvement at all six stations and needs none of this machinery, and treating per-locale models as the research track that earns its way in later.
