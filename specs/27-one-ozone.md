# One ozone number — the window on the label, the station when there is one

**Status:** built 2026-09-14 (branch `claude/spec-27-one-ozone`); amended to what was built · **Effort:** M · **Deps:** [21-airnow-migration.md](21-airnow-migration.md) (AirNow as a source), [22-exposure-windows.md](22-exposure-windows.md) (mean8h) · **Priority:** high

## Problem

Ozone appears twice on the home screen, as two different quantities from two different sources, and neither is labeled.

- The row shows `current.raw.o3`, the CAMS hour. Its verdict chip grades `current.exposure.o3`, the 8-hour max. The number and the verdict are different things.
- The measured strip shows AirNow's ozone AQI walked back to µg/m³. That AQI is AirNow's ozone NowCast, a weighted multi-hour average, so the strip is a third window.
- CAMS global runs warm-season ozone high in the eastern US. On 2026-08-07 CAMS read 166 µg/m³ while the New Haven monitor implied about 82. The strip's caption says "trust the station," which is right, but the screen still shows both.

So there is no way to tell which number is the ozone, and a 2× gap reads as a contradiction rather than as the model being wrong.

## Design

Most of this was already true when the branch opened. [21-airnow-migration.md](21-airnow-migration.md) put the row on the monitor and took the ozone chip off the strip; [22-exposure-windows.md](22-exposure-windows.md) made every row's number the same quantity its verdict is spoken about. What was left was the labelling — which is the whole problem, because the numbers were never the thing that was wrong.

1. **One row, one number.** *Spec 22.* The row shows `exposure.o3`, the trailing 8-hour mean, and the chip grades the same value. The sub-label names the window: `O₃ · 8-h`.

2. **Source priority.** *Spec 21.* When the AirNow series resolves, the app lays the monitor's hourly concentrations onto the series' hour grid and computes its own 8-hour mean from them; otherwise the column is CAMS. One computation on one series either way, and the series carries the source name that scopes learned bounds (`airnow` / `cams-w2`).

3. **The strip's ozone chip goes away.** *Spec 21, and further than this item asked.* On a station series the strip drops **every** chip, not just ozone: all of them would be the same monitors twice, in AQI points walked back to µg/m³ instead of the screen's own units. What survives is the Action Day, which is a declaration by an agency rather than a reading, and with no Action Day the section does not render at all.

4. **Sparkline stays hourly, and the seam is marked.** *Spec 22 for the hourly values; this PR for the seam.* `Hour.forecastSource: 'cams'` already marked the forecast hours of a station series — AirNow publishes no hourly forecast, so everything after now is the model. Nothing said so on screen. The by-hour curve now carries `measured to now · model after` under its ticks when the series is `airnow`, in the ticks' own type so it reads as part of the scale. The curve itself is untouched: it starts at now, so the seam is its left edge, and drawing a marker there would be pointing at an axis.

5. **Bias note when the row runs on the model inside the US.** *This PR.* Where the number came from CAMS and the place is inside AirNow's coverage, the ozone row grows a note: "Model ozone runs high in the eastern US in summer." Gated on both, because the claim is about a region — Amsterdam gets the sub-label and no note. It is a quiet note rather than the claim variant: the row is still the best number available for that place, and the note says which way to discount it rather than telling someone to disbelieve their own screen. It rides the ozone row alone; CAMS's particulate has no equivalent known lean, and a caveat repeated under every row stops being read.

6. **The scoreboard keeps the AQI points and the `aqi.ts` bridge.** Nothing there changed.

7. **"Right now" versus "8-h".** Unchanged, and worth restating: the 8-hour number lags a ramp because ozone dose accumulates over hours. The hourly sparkline and the by-hour curve answer "walk now or at 7 pm"; the row answers "what is my exposure."

Two more things this PR added that the original design did not name:

- **Every pollutant row names its source, not just the ones with a monitor.** The sub-label used to append `New Haven monitor` when a station produced the number and nothing at all when the model did, which made "model" the unmarked case — and an unnamed number reads as *the* number. That is the same shape as the confusion this spec exists to end. So the ozone row reads `O₃ · 8-h · model` or `O₃ · 8-h · New Haven monitor`, and PM2.5 and PM10 the same with their 24-h. Per row rather than per series, because on a station series every row shown has a monitor behind it and the two rules never disagree.

- **The strip's caption says what is actually different.** It used to explain the gap as "stations report averages — 24 h for particles, 8 h for ozone." Since spec 22 the rows are averages too, so that named nothing that set the two apart. What is different is the quantity and the place: a chip is AirNow's NowCast, a weighted multi-hour AQI for a whole reporting area walked back through the EPA table; a row is the model's own trailing mean for this spot. The particles and ozone lines under it keep their jobs — particles disagreeing means a local source the model missed, and on ozone, trust the station.

## Acceptance

- In Hamden with AirNow on, the ozone row's number equals the mean of the monitor's last eight hourly readings, the sub-label names the site, and the measured strip has no ozone chip.
- With AirNow off inside the eastern US (east of the 100th meridian), the row runs on CAMS `mean8h`, the sub-label says "model", and the bias note appears under the ozone row.
- The row's verdict and its number come from the same value. Test: a series where the current hour is low and the 8-h mean is high grades high and displays the mean.

## Non-goals

Changing the ozone breakpoints. Using AirNow's daily forecast AQI for the ozone curve.
