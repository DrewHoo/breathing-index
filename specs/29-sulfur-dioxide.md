# Sulfur dioxide — admit the best-proven acute trigger, gated by its floor

**Status:** proposed · **Effort:** S · **Deps:** [21-airnow-migration.md](21-airnow-migration.md) (AirNow as a source), [24-vector-diet.md](24-vector-diet.md) (which this partly reverses) · **Priority:** medium. Rarely elevated in Connecticut; decisive where it is.

## Problem

SO₂ is the most dramatic acute asthma trigger in the controlled-exposure literature. Exercising asthmatics bronchoconstrict within 2–10 minutes at 0.5 ppm (airway resistance roughly doubles), measurably at 0.25 ppm, and some work reports response below 0.1 ppm; healthy people barely respond at ten times that. The 1-hour NAAQS (75 ppb) exists in that form because of it.

The app fetches SO₂ from CAMS, keeps it in `raw`, and never lets it into the vector. Spec 24 §4 kept it out of the US vector on two grounds: ambient SO₂ collapsed after scrubber mandates and low-sulfur fuel, and every variable costs identifiability. The first is true here (Hamden's CAMS SO₂ ran 0.2–2.7 µg/m³ over the past eight days, against a WHO 24-h guideline of 40). The second is not, because of how the engine works: a variable below its floor never joins a candidate set and never earns a tolerance bound. Admitting SO₂ with a high floor costs nothing on the 99 % of days it sits at background and pays on the day a refinery, a port, or a volcanic plume puts it in the air.

## Design

1. **`so2` enters the vector everywhere.** Feature: the hour's own value (the mechanism is minutes; the EPA standard is 1-hour). No window.

2. **Floor 20 µg/m³** (half the WHO 24-h AQG), up from 5. Below it the variable is absent from candidate sets by construction. Priors stay as derived: `{2: 40, 3: 125, 4: 350}` (WHO 24-h AQG; WHO 2005 IT-1; EU 1-h limit).

3. **Measured where a monitor reports it.** Add `SO2` to the AirNow `aq/data/` parameters. The New Haven monitor reports it hourly. The airnow-series rule (pm25 and o3 present) is unchanged; SO₂ rides along when the nearest monitor has it, absent otherwise. CAMS fills the model series. Units: AirNow reports SO₂ in PPB; convert at 2.62 µg/m³ per ppb (EPA reference conditions) next to the ozone constant.

4. **A row only when present.** Like smoke: the SO₂ row appears when `exposure.so2` is above the floor, sub-label `SO₂ · 1-h · New Haven monitor` / `· model`. Below the floor there is no row; a "0 µg/m³" row on every screen would teach people to ignore the one that matters.

5. **CO stays out.** No airway mechanism; it is a cardiovascular variable. Spec 20 admits it by region for cookstove settings, unchanged.

6. **Source scoping.** `so2` is already in `SOURCE_SCOPED_VARIABLES`. Nothing to do.

7. **Absent rows are named.** A variable in the vector with no row has to say so, or the day its row appears looks like a bug. One quiet line under the air table lists everything the app checked this hour that has no row, in two kinds:

   > Also checked, too low to matter: SO₂ 1 µg/m³ · smoke none
   > Not measured here: SO₂

   "Too low to matter" is the floor: the variable was read and sits below the level at which it could be a suspect. The number is shown because it was measured. "Not measured here" is the other absence — a station series whose nearest monitor does not report the variable, where the model is deliberately not consulted for it. The two never share a line. Smoke reads "none" when the satellite answered and saw no plume, and is absent from both lines when it did not answer. NO₂ is gone from the vector entirely and appears on neither. [30-glossary.md](30-glossary.md) puts a `?` on each name in these lines.

8. **Glossary entry** ([30-glossary.md](30-glossary.md)) says what SO₂ is and why the row is usually absent.

## Acceptance

- A CAMS series at Hamden carries `exposure.so2` (≈1 µg/m³) and no SO₂ row; a synthetic hour at 60 µg/m³ draws the row and joins a bad day's candidate set.
- On an airnow series with the New Haven monitor reporting SO₂, `exposure.so2` is the monitor's hourly reading in µg/m³ and the row names the site.
- Fixture: rating 3 at `{so2: 150, pm25: 4, o3: 10}` confirms `so2` at 3 on one clean day.
- The floor and the prior are documented in `config.ts` with the controlled-exposure numbers above.
- At Hamden on the model, the line under the table reads `Also checked, too low to matter: SO₂ 1 µg/m³ · smoke none`; on a station series whose monitor lacks SO₂ it reads `Not measured here: SO₂`; when the SO₂ row is present the name leaves the line.

## Non-goals

CO. A 24-h SO₂ window. Volcanic vog's sulfate aerosol, which SO₂ does not see ([research](../research/asthma-triggers-evidence.md), sweep 4 §4d).
