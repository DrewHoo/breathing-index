# Temperature swing — the day's range, graded only at the tail

**Status:** proposed · **Effort:** S · **Deps:** [23-dew-point-air.md](23-dew-point-air.md), [28-mold.md](28-mold.md) (temperature is back in the weather fetch) · **Priority:** medium

## Problem

Big day-to-day and within-day temperature swings predict asthma admissions, and the shape of the effect is a threshold. Extreme diurnal temperature range (the top 5 % of days) carries RR 1.72 (1.10–2.71); the linear effect per 1 °C of range is not significant (1.06, 0.99–1.15). Day-to-day change adds about 4 % per 1 °C at lags of one to five days. The research graded it Tier B, forecastable, and the only weather factor after the dew-point pair with an effect size worth a variable.

The app fetches hourly temperature again since spec 28 and does nothing with it.

## Advantages

- The data is already on the screen's fetch. No new source, no relay work, no key.
- Threshold-shaped, so with a floor at the tail it is silent on ordinary days and costs nothing in attribution. Most New England days have a 6–12 °C range; the variable would appear on the handful with 16+.
- Forecastable: the forecast hours carry temperatures, so tomorrow's swing is known today and the hourly curve can warn ahead.
- Cheap to explain: "the temperature moved 20 degrees today" is a sentence anyone can check against a thermometer.

## Challenges

- **The lag.** The evidence is emergency-visit time series at lags of one to five days, not a same-hour reflex. An entry captures the trailing 24-hour range at log time; the day that mattered may have been yesterday. A 48-hour max of the 24-hour range covers lag one at the cost of blurring which day it was.
- **No named mechanism.** The literature reports the association without a settled pathway (airway cooling and rewarming, thermoregulatory stress, and the weather types that produce big swings are all candidates). The glossary entry has to say "seen in emergency-visit studies" and stop there.
- **Correlation with dry air.** Clear, dry autumn days are exactly the days with the biggest swings, so `temp_swing` and `dry_air` will co-elevate and stay ambiguous until a humid big-swing day or a dry flat day separates them. The identifiability paragraph in the trigger-model doc applies in full.
- **A range straddles two days' weather.** A cold front at 3 pm makes the 24-hour range large for the next 24 hours, half of which is the new air mass. The number is honest about the range and vague about the cause.
- **Where the tail is.** P95 is a local fact. A fixed floor in °C is wrong somewhere; the honest first version picks a New England number and says so.

## Design

1. **`temp_swing`** = max − min of hourly temperature over the trailing 24 hours, °C, computed per hour like the other windows. Absent when the window has fewer than 12 readings.
2. **Floor 12 °C.** Below it the variable is never a candidate. Priors, ceiling only, heuristic: `{2: 16, 3: 20}`. Noise margin 0.05 (measured weather).
3. **A row only above the floor**, like SO₂ and smoke: `Temperature swing · 24-h`, value in the display unit as a delta (`displayTemperatureDelta`), sparkline of the hourly range.
4. **Not source-scoped** (weather).
5. **Glossary entry** ([30-glossary.md](30-glossary.md)) with the evidence tier in plain words and the lag stated.
6. **Absent line**: below the floor it appears on neither line under the table; a range is always measured, and printing "swing 8 °C, too low to matter" every day would be noise. Say so in the spec 29 §7 comment when built.

## Acceptance

- A synthetic day with hourly temperatures from 4 °C to 22 °C grades `temp_swing: 18` at the hour the range closes, draws the row, and joins a bad day's candidate set; a 4-to-13 day grades 9, draws no row, and is never a candidate.
- Fixture: rating 3 at `{temp_swing: 20, pm25: 4, o3: 10}` confirms `temp_swing` on a clean day.
- The window is stated on the row and in the trigger-model table with the lag caveat.

## Non-goals

Day-to-day mean change as a second variable. Heat index. A locally calibrated percentile floor (revisit once the diary has a winter and a summer in it).
