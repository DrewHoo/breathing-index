# Dry air and humid heat — two one-sided features from dew point

**Status:** built 2026-09-14 (branch `claude/spec-23-dew-point-air`); amended to what was built · **Effort:** S · **Deps:** [22-exposure-windows.md](22-exposure-windows.md) (the source bump covers this change too) · **Priority:** high

## Problem

Three weather features today: `heat_stress = max(0, T − 25)`, `cold_dry_stress = (T < 10 && dew < 2) ? 10 − T : 0`, and `humidity = mean72h RH`.

The controlled-exposure literature says the mechanism behind "cold air" is airway drying, gated on the water content of inspired air, not on temperature. Bronchoconstriction needs inspired air below 10 mg H₂O/L, which is a dew point of 11 °C / 52 °F. Cold adds nothing over dry (Evans et al.). The current gate needs T < 10 °C, so a 20 °C April day with a 5 °C dew point reads 0.

Hot humid air is a separate reflex. Hayes 2012 produced bronchoconstriction in asthmatics with hot humid hyperventilation and blocked it completely with ipratropium.

Humidity by itself pools at OR 1.05 across 21 studies. As an outdoor mold proxy it points the wrong way: Alternaria and Cladosporium are dry-weather spores ([28-mold.md](28-mold.md)).

## Design

1. **`dry_air = max(0, 11 − dewpoint_C)`.** Replaces `cold_dry_stress`. Floor 1. Priors: 2 at 5 (dew ≤ 6 °C), 3 at 11 (dew ≤ 0 °C).

2. **`humid_heat = max(0, dewpoint_C − 18)`.** Replaces `heat_stress`. A dew point that high only occurs in hot air, so one number encodes hot and humid together. Floor 1. Priors: 2 at 2 (dew 20 °C), 3 at 5 (dew 23 °C).

3. **Retire `humidity`.** It leaves the vector. `INDOOR_PROXY_VARIABLES` keeps the name: an old entry carrying `humidity` and `worse-outdoors` has to keep meaning what it meant when it was saved, and the set is the mechanism [28-mold.md](28-mold.md) reuses. Temperature and relative humidity leave the weather fetch with the features derived from them; spec 28's proxy asks for them back.

4. **Old names stay renderable.** `heat_stress`, `cold_dry_stress` and `humidity` remain in `VARIABLE_LABELS` and `PRIORS` as retired rows, the way the grains/m³ pollen rows do, so old entries still read.

5. **The temperature row becomes a dew-point row.** Name follows the active side: "Dry air" or "Humid heat", and "Dew point" with a `comfortable` chip when neither is (a 14 °C dew point is not "barely present" of anything). Value is the dew point in the display unit; the sparkline is the hourly dew point, not either feature, so it doesn't hinge to zero through the comfortable band. On the dry side past-your-easy is downward, so the waterline flips as the cold side did, and the easy level comes back through the same fold (`11 − tol`, `18 + tol`). An hour with no dew point gets no row, the rule the pollutants follow. The diary's evidence rows lead with Dry air and Humid heat; the three retired rows appear only while an old entry still holds a verdict on one.

6. **Exertion is an observation chip.** Airway drying engages above about 30 L/min ventilation, and nasal breathing nearly cancels it. The engine can't know. Add `exercising` as an observation (not a confounder). v1: a note on the entry the engine ignores. A later spec can make it sharpen `dry_air` the way `worse-outdoors` sharpens outdoor variables.

7. Noise margin stays 0.05 for both.

Considered and skipped: extreme diurnal temperature range (RR 1.72 at the P95 tail, linear slope not significant). It's a fourth weather variable and it co-moves with `dry_air` in spring and fall. Wait for the diary to ask.

## Acceptance

- `openMeteo.test.ts`: a 20 °C / dew 5 °C hour yields `dry_air: 6, humid_heat: 0`. A 30 °C / dew 22 °C hour yields `dry_air: 0, humid_heat: 4`. A null dew point yields both absent.
- Fixture 10 (U-shape) rewritten on the new variables and passing.
- Old entries carrying `cold_dry_stress` still render in the diary.
- The `exercising` chip saves to `observations` and shows on the entry.
- A dew point between 11 and 18 °C renders "Dew point" with the `comfortable` chip and no waterline.
- Weather bounds are not source-scoped, so a retired weather name is never reused for a different quantity (documented in the trigger-model doc).

## Non-goals

Wind chill, heat index. Indoor humidity. Diurnal range.
