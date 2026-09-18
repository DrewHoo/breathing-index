# Air quality indices around the world — comparison tables

Agent-compiled (Claude, September 2026). Pulled from the drewhoover.com "Breathing Index" post draft and stowed here. Sources: each authority's published methodology; see `asthma-triggers-evidence.md` and `data-sources-catalog.md` in this directory for the underlying research.

## How each index is built

| Index | Scale | How pollutants combine | Anchored to |
|---|---|---|---|
| US EPA AQI | 0–500, 6 categories | Max of sub-indices | NAAQS (legal limits) |
| EU EAQI | 6 bands, no number | Max | WHO 2021 guidelines |
| Netherlands LKI | 1–11, 5 categories | Max | Health effects |
| UK DAQI | 1–10, 4 bands | Max | COMEAP thresholds |
| China AQI | 0–500, 6 categories | Max | Chinese standards |
| India NAQI | 0–500, 6 categories | Max | Indian standards |
| Canada AQHI | 1–10+, 5 bands | Additive | Mortality regression |
| Hong Kong AQHI | 1–10+, 5 bands | Additive | Hospital admissions |
| South Korea CAI | 0–500, 4 categories | Max, +50 if two pollutants are bad, +75 if three | Korean standards |

Notes: The EU index classifies concentrations directly into bands with no interpolation. Canada's AQHI is `(10/10.4) × 100 × Σ(e^(bᵢ·cᵢ) − 1)` over NO2 (b=0.000871/ppb), O3 (0.000537/ppb), PM2.5 (0.000487 per µg/m³), 3-hour averages, rounded to an integer, capped at "10+". South Korea adds 50 to the responsible pollutant's value when two pollutants are in Unhealthy or worse, 75 when three.

## Which pollutants each index scores

| Index | PM2.5 | PM10 | O3 | NO2 | SO2 | CO | NH3 | Pb |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| US AQI | ● | ● | ● | ● | ● | ● | | |
| EU EAQI | ● | ● | ● | ● | ● | | | |
| UK DAQI | ● | ● | ● | ● | ● | | | |
| Netherlands LKI | ● | ● | ● | ● | | | | |
| China AQI | ● | ● | ● | ● | ● | ● | | |
| South Korea CAI | ● | ● | ● | ● | ● | ● | | |
| India NAQI | ● | ● | ● | ● | ● | ● | ● | ● |
| Hong Kong AQHI | ● | ● | ● | ● | ● | | | |
| Canada AQHI | ● | | ● | ● | | | | |

PM2.5, O3, and NO2 are the universal core. India is the only major index that scores ammonia and lead. Canada scores only three.
