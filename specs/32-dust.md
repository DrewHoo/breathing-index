# Dust — the second attributed slice of particulate

**Status:** proposed · **Effort:** S · **Deps:** [25-smoke-variable.md](25-smoke-variable.md) (the pattern), [29-sulfur-dioxide.md](29-sulfur-dioxide.md) (the floor argument and the absent line) · **Priority:** medium in Connecticut, high in the Southwest and Southeast

## Problem

Dust storms raise asthma visits: RR 1.06 (1.01–1.11) at lag 0–2 in the Southwest (asthma the strongest respiratory association in that study), +5 % at lag 3, OR 1.88 for a heavy-dust day in Japan. Per microgram, mineral dust is equal to or weaker than combustion particulate; it matters because the mass is enormous. Saharan dust reaches the Southeast every summer; haboobs cross Arizona and Texas; East Asian dust is a season.

Spec 20 planned a `dust` variable for Asia only. Open-Meteo already serves the column everywhere (`dust`, CAMS, "close to surface level, 10 m above ground", µg/m³; Hamden reads 0–2), and the engine already has the right shape for it: smoke showed that an attributed slice of particulate is worth its own variable, because the engine can then learn that dust PM and combustion PM hit differently.

## Advantages

- One column already in the air fetch. No relay work, no key, global coverage, five-day forecast.
- The same pattern as smoke, already built: a source-attributed slice alongside PM2.5, ambiguous until a clean day separates them, then learnable on its own.
- A high floor makes it free where it never happens. Connecticut's 0–2 µg/m³ is far under any floor; the variable exists and never speaks.
- Surface, not column: the Open-Meteo product is near-ground, which sidesteps the research's warning that column dust (AOD) over-predicts when the plume stays aloft.

## Challenges

- **A model, and only a model.** No US network measures dust as such. CAMS dust is a 45 km model of desert-source mineral dust; it does not see a construction site, a gravel road, or a plowed field, which are the dust most people actually breathe.
- **Double-counting with the PM columns.** Dust is inside PM10 and partly inside PM2.5. A dust day raises PM2.5 too, so the candidate set is `{pm25, dust}` until a dusty-but-clean-combustion day or a smoky-but-dust-free day separates them. That is the smoke tradeoff exactly and it is the point, but it costs attribution speed.
- **The lag is 2–3 days.** The strongest associations are at lag 2–3, later than same-day PM2.5. A 24-hour mean at log time may miss the day that mattered; a 72-hour max catches it and blurs which day.
- **Sources on a station series.** Dust comes from CAMS whether the series is model or monitor. On an airnow series that is a model number beside measured ones. Smoke has the same shape (a satellite product) and is not source-scoped; dust follows it, and the tension is documented rather than resolved.
- **Endotoxin and composition** ride on dust and are not in the number. Ignore for now.

## Design

1. **`dust`** = 24-hour mean of the Open-Meteo `dust` column, µg/m³, same window as PM2.5. Forecast hours from the same column.
2. **Floor 15 µg/m³**; priors, ceiling only, heuristic: `{2: 35, 3: 100, 4: 250}` (a Saharan event in Florida is 20–60; a haboob is hundreds).
3. **Not source-scoped**, like smoke. Comment the tension.
4. **A row only above the floor**: `Dust · 24-h · model`, sparkline from `raw.dust`.
5. **Absent line**: below the floor, `dust 1 µg/m³` joins "Also checked, too low to matter" only when the location is inside a dust-prone box (Southwest, Gulf and Southeast coasts); elsewhere it appears on neither line, or every Connecticut screen reads "dust 1" forever. The box is a comment-documented rectangle list like `inAirNowCoverage`.
6. **Spec 20's Asia plan** collapses into this: the same variable, no region gate.
7. **Glossary entry.**

## Acceptance

- A synthetic series with `dust` at 60 µg/m³ for a day grades `dust: 60`, draws the row, and a bad day at `{pm25: 30, dust: 60}` yields candidates `{pm25, dust}`.
- Hamden today grades `dust ≈ 1`, draws no row, and prints nothing on the absent lines; a Phoenix location at the same value prints `dust 1 µg/m³` on the "too low" line.
- Fixture: rating 3 at `{dust: 120, pm25: 4}` confirms `dust`.

## Non-goals

Local road or construction dust. NWS dust-storm warnings (spec 33 carries those as a banner). Column AOD.
