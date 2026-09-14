# Dry air and humid heat — two one-sided features from dew point

**Status:** proposed · **Effort:** S · **Deps:** [22-exposure-windows.md](22-exposure-windows.md) (the source bump covers this change too) · **Priority:** high

## Problem

Three weather features today: `heat_stress = max(0, T − 25)`, `cold_dry_stress = (T < 10 && dew < 2) ? 10 − T : 0`, and `humidity = mean72h RH`.

The controlled-exposure literature says the mechanism behind "cold air" is airway drying, gated on the water content of inspired air, not on temperature. Bronchoconstriction needs inspired air below 10 mg H₂O/L, which is a dew point of 11 °C / 52 °F. Cold adds nothing over dry (Evans et al.). The current gate needs T < 10 °C, so a 20 °C April day with a 5 °C dew point reads 0.

Hot humid air is a separate reflex. Hayes 2012 produced bronchoconstriction in asthmatics with hot humid hyperventilation and blocked it completely with ipratropium.

Humidity by itself pools at OR 1.05 across 21 studies. As an outdoor mold proxy it points the wrong way: Alternaria and Cladosporium are dry-weather spores ([28-mold.md](28-mold.md)).

## Design

1. **`dry_air = max(0, 11 − dewpoint_C)`.** Replaces `cold_dry_stress`. Floor 1. Priors: 2 at 5 (dew ≤ 6 °C), 3 at 11 (dew ≤ 0 °C).

2. **`humid_heat = max(0, dewpoint_C − 18)`.** Replaces `heat_stress`. A dew point that high only occurs in hot air, so one number encodes hot and humid together. Floor 1. Priors: 2 at 2 (dew 20 °C), 3 at 5 (dew 23 °C).

3. **Retire `humidity`.** It leaves the vector. `INDOOR_PROXY_VARIABLES` empties; `worse-outdoors` keeps working with nothing to strip until an indoor variable exists again.

4. **Old names stay renderable.** `heat_stress`, `cold_dry_stress` and `humidity` remain in `VARIABLE_LABELS` and `PRIORS` as retired rows, the way the grains/m³ pollen rows do, so old entries still read.

5. **The temperature row becomes a dew-point row.** Name follows the active side: "Dry air" or "Humid heat". Value is the dew point in the display unit. On the dry side past-your-easy is downward, so the waterline flips as the cold side does today.

6. **Exertion is an observation chip.** Airway drying engages above about 30 L/min ventilation, and nasal breathing nearly cancels it. The engine can't know. Add `exercising` as an observation (not a confounder). v1: a note on the entry the engine ignores. A later spec can make it sharpen `dry_air` the way `worse-outdoors` sharpens outdoor variables.

7. Noise margin stays 0.05 for both.

Considered and skipped: extreme diurnal temperature range (RR 1.72 at the P95 tail, linear slope not significant). It's a fourth weather variable and it co-moves with `dry_air` in spring and fall. Wait for the diary to ask.

## Acceptance

- `openMeteo.test.ts`: a 20 °C / dew 5 °C hour yields `dry_air: 6, humid_heat: 0`. A 30 °C / dew 22 °C hour yields `dry_air: 0, humid_heat: 4`. A null dew point yields both absent.
- Fixture 10 (U-shape) rewritten on the new variables and passing.
- Old entries carrying `cold_dry_stress` still render in the diary.
- The `exercising` chip saves to `observations` and shows on the entry.

## Non-goals

Wind chill, heat index. Indoor humidity. Diurnal range.
