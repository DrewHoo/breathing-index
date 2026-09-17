# Five attack days, and everything that was measurable

Five days on which I had severe asthma attacks, reconstructed against every public
air measurement within reach. Assembled 2026-09-16. Method and caveats in
[`proxy-validation.md`](proxy-validation.md); harness in
[`../scripts/spore_eval.py`](../scripts/spore_eval.py).

The point of the exercise: find out whether these days can be linked to outdoor
conditions at all, or rule that out. The short answer is at the bottom.

Sources: AAAAI National Allergy Bureau (spore and pollen counts), EPA AirNow
historical files (monitor concentrations, AQI), NOAA HMS (satellite smoke polygons),
ERA5 via Open-Meteo (weather), PurpleAir (hyperlocal particles), USDA NASS Quick
Stats (crop progress). AQHI computed with the Health Canada formula from 3-hour
means. `dry_spore_index` computed as the app computes it.

---

## 2019-11-02 · Ann Arbor, MI

**Pollen and mold: nothing counted within 631 miles.** Toledo's 2019 record stops
Oct 9. Nearest station reporting mold that day was Omaha, 635 mi.

| | |
|---|---|
| Ozone 8-hr | **26 ppb** (Ann Arbor) · 22 (Allen Park) — half of every other day here |
| PM2.5 24-hr | 6.5 (Ypsilanti) · 7.2 (Allen Park) · 9.2 (Dearborn); hourly max 12.9 |
| PM10 24-hr | 16 (Dearborn) |
| SO₂ / CO | 0 ppb · 0 ppm |
| US AQI | **33 Good** (Ann Arbor reporting area); site max 28 |
| AQHI | 3, Low (peak 00:00) |
| HMS smoke | none over the point |
| Dew point | **−3.9 to +1.2 °C** → `dry_air` peak **14.9**, past the app's level-3 line |
| Temp / RH / rain | 1.6–7.5 °C · 57–87% · 1.0 mm |
| `dry_spore_index` | 3 of 5 — but November is outside the app's Jul–Oct season gate |
| **PurpleAir, 1.2 mi** | **median 13.8 µg/m³ vs 6.7 for the surrounding week — 2.05×** |
| Michigan harvest | sugarbeets 41→55% (+14, season peak) · silage 86→91% · soybeans 51→57% · grain 21→25% |

Every regulatory index called this day clean. The sensor a mile away recorded a
*median* above the regulatory network's *maximum hourly value* for the whole day,
on a day with the most extreme airway-drying reading of the five.

---

## 2020-08-23 · Ann Arbor, MI

**The only day with a real mold count nearby.** Toledo, OH — 41 miles:

- Mold **776** spores/m³: basidiospores 370, ascospores 284, *Cladosporium* 62,
  **Alternaria 48**, downy mildew 12
- Weeds 20 (ragweed 10, chenopods 6, nettle 4) · grass 4 · trees 0

Context from Toledo's own fortnight: mold ran 424–1,090 and Alternaria 18–96
between Aug 17 and Aug 29. **This day was mid-range for its own week**, and both
figures sit below the app's level-2 bands (`mold` 6,500, `mold_alternaria` 100).

| | |
|---|---|
| Ozone 8-hr | 52 ppb (Ypsilanti) · 56 (Allen Park) · 47 (Ann Arbor); 1-hr peak 60 at 19:00 |
| PM2.5 24-hr | 11.9 (Ypsilanti) · 13.8 (Allen Park) · 13.1 (Dearborn); hourly peak 23.5 at 06:00 |
| PM10 24-hr | 21 (Dearborn) |
| US AQI | **50 Good** (Ann Arbor area); site max 55; Detroit 84 O₃ Moderate |
| AQHI | 4, Moderate (peak 01:00) |
| HMS smoke | none |
| Dew point | 14.2–20.0 °C; temp to 30.8 °C |
| `dry_spore_index` | 4 of 5 |
| **PurpleAir, 1.2 mi** | **median 16.1 vs 10.1 — 1.59×** |
| Michigan harvest | **corn silage 0→9% — the season's first week**; grain and soybeans not started |

The date that grain harvest does not cover, and the date where the one available
spore count came back unremarkable. Silage chopping covers it; the PurpleAir
elevation covers it; nothing else does.

---

## 2023-09-30 · Ann Arbor, MI

**Nothing counted.** Toledo's fall-2023 record ends Sept 22. That reading, eight
days early and 41 miles away, is the nearest in space: mold 459 (basidiospores 253,
*Alternaria* 84, *Cladosporium* 54, rusts 31, ascospores 20, *Epicoccum* 17),
ragweed 1, grass 0.

| | |
|---|---|
| Ozone 8-hr | 53 ppb (Ypsilanti) · 47 (Ann Arbor, Allen Park); 1-hr peak 64 at 16:00 |
| PM2.5 24-hr | 13.0 (Ypsilanti) · 15.4 (Allen Park) · 15.3 (Dearborn); hourly peak 23.8 at 01:00 |
| PM10 24-hr | 24 (Allen Park) · 27 (Dearborn) |
| US AQI | **49 Good** (Ann Arbor area); site max 58 Moderate |
| AQHI | 4, Moderate (peak 15:00) |
| HMS smoke | **Light**, two passes (0900–1600Z, 1930Z) |
| Dew point | 14.2 °C mean (11.9–16.5) |
| Temp / RH / rain | 12–23 °C · 57–100% · none |
| `dry_spore_index` | 3 of 5 (warm, dry air, wet week — 28.9 mm prior 7 d) |
| **PurpleAir, 1.2 mi** | **median 22.4 vs 13.2 — 1.70×**, peaking 32–34 midnight to 6 am |
| Michigan harvest | **corn silage 46→67% (+21, the season's peak rate)** · grain 1→7% · soybeans 2→5% |

---

## 2024-09-15 · Ann Arbor, MI

**Nearest count is London, Ontario — 136 miles**, across Lake Erie and the Detroit
corridor: weeds 36 (ragweed 27, sage/wormwood 8, chenopods 1), grass 11, trees 0,
mold not reported. Direction only.

| | |
|---|---|
| Ozone 8-hr | 54 ppb (Ypsilanti) · 56 (Allen Park) · 49 (Ann Arbor); 1-hr peak 60 at 13:00 |
| PM2.5 24-hr | 8.0 (Ypsilanti) · 7.2 (Allen Park) · 8.8 (Dearborn) |
| PM10 24-hr | 13 (Allen Park) · 17 (Dearborn) |
| US AQI | **47 Good** (Ann Arbor area); site max 54 |
| AQHI | 4, Moderate (peak 18:00) |
| HMS smoke | **Light**, two passes (1100–1450Z, 2000–0030Z) |
| Dew point | 15.0 °C mean (13.2–16.4) |
| Temp / RH / rain | 16–28 °C · 46–91% · none |
| `dry_spore_index` | 4 of 5 (missed only the wet week — 0.0 mm in 7 days) |
| **PurpleAir, 0.3 mi** | median 16.6 vs 16.4 — **1.02×, no elevation** |
| Michigan harvest | **corn silage 39→59% (+20, season peak)** · soybeans 2→9% · grain 2→3% |

The closest sensor of any date, and the only Michigan day it saw nothing unusual.

---

## 2025-10-04 · New Haven / Hamden, CT

**Pollen counted, and it was almost nothing.** Armonk, NY — 43 miles, the nearest
live station: trees 2 (birch), grass 2, weeds 2 (sage/wormwood) = **6 grains/m³
total**, every category Low. Fordham in Manhattan, 66 miles: weeds 2, nothing else.
Armonk's whole Sept 26 – Oct 12 window is single digits, so this is the real season,
not a short count. **No mold station within 270 miles.**

All values below from the New Haven monitor, AQS 090090027 — the one the app itself
reads:

| | |
|---|---|
| Ozone 8-hr | 47 ppb (≈92 µg/m³); 1-hr peak 60 at 16:00 |
| PM2.5 24-hr | 9.6; hourly spike to 16.0 at 06:00 against a ~6 baseline |
| PM10 24-hr | 21 → coarse fraction 11.4 |
| NO₂ | mean 20.2 ppb, peaks 34.1 (01:00) and 34.0 (15:00) |
| SO₂ / CO | 0.3 ppb · 0.5 ppm |
| US AQI | **38 Good** (New Haven area); site max 52 Moderate |
| AQHI | **5, Moderate** — the highest of the five, on the day US AQI said Good |
| HMS smoke | **Light**, two passes (1230–1500Z, 2000–2330Z) |
| Dew point | 12.1 °C mean (8.6–15.0) → `dry_air` peak 2.4 |
| Temp / RH / rain | 11.6–24.7 °C · 47–84% · none |
| `dry_spore_index` | 4 of 5 |
| **PurpleAir, 3.5 mi** | median 3.5 vs 2.9 — 1.19×, and *below* the regulatory 9.6 |

This is the day the additive index and the max-based index disagree most: 38 Good
versus AQHI 5, because 46 ppb ozone and 25 ppb NO₂ at 3 pm each contributed about
half the risk and a max-of-subindices throws that away.

---

## What holds across all five

| | 2019-11-02 | 2020-08-23 | 2023-09-30 | 2024-09-15 | 2025-10-04 |
|---|---|---|---|---|---|
| O₃ 8-hr (ppb) | 26 | 52 | 53 | 54 | 47 |
| PM2.5 24-hr | 6.5 | 11.9 | 13.0 | 8.0 | 9.6 |
| US AQI | 33 | 50 | 49 | 47 | 38 |
| AQHI | 3 | 4 | 4 | 4 | **5** |
| smoke | none | none | Light | Light | Light |
| `dry_spore_index` | 3 | 4 | 3 | 4 | 4 |
| PurpleAir vs its week | **2.05×** | **1.59×** | **1.70×** | 1.02× | 1.19× |
| pollen | none counted | w=20 @41mi | none | w=36 @136mi | **6 gr/m³ @43mi** |
| mold | none | **776, Alt 48** | none | none | none |

**Nothing in the regulatory vector is present on all five.** Official AQI never
exceeded 58 at any local monitor; four of five days were "Good." Ozone was 47–54 ppb
on four and 26 on the fifth. Smoke on three, absent on two. `dry_spore_index` sits
at 3 or 4, which is the median in-season day — 62% of July–October days in Ann Arbor
reach 4 or higher, so that variable is describing the base rate, not these days.

**What survives:**

1. **Hyperlocal particles.** Three of four Ann Arbor days ran 1.6–2.1× their own
   surrounding week a mile away, invisible to the regulatory network. The only
   measurement that separates these days from their neighbours.
2. **Seasonal clustering.** Four of five fall between Aug 23 and Oct 4 — ragweed and
   *Alternaria* season. Nov 2 2019 is the outlier and looks like a different
   mechanism: cold, very dry air (`dry_air` 14.9, past level 3) with clean gases.
3. **Corn silage.** At onset or peak weekly rate on three of four Michigan dates,
   including the August one nothing else covers. But silage rate does not predict
   spores at Toledo (rho −0.04, n=313), so if it matters it is as dust, and the
   coarse-fraction data near Ann Arbor is too sparse to test.

**What is ruled out or heavily weakened:** pollen for 2025-10-04 (6 grains/m³);
mold for 2020-08-23 (mid-range for its week, below the app's level-2 bands); any
recurring calendar-locked particulate event at either city (six years of daily peak
PM shows none — Sept 28 to Oct 10 is New Haven's annual *trough*); and the official
composite indices, which saw nothing on any of the five.

The honest reading is that either the trigger is not in the regulatory vector, or it
is local enough that no instrument more than a mile away would catch it, or these
five days do not share one cause. All three point the same direction: measure closer.
