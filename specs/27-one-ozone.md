# One ozone number — the window on the label, the station when there is one

**Status:** proposed · **Effort:** M · **Deps:** [21-airnow-migration.md](21-airnow-migration.md) (AirNow as a source), [22-exposure-windows.md](22-exposure-windows.md) (mean8h) · **Priority:** high

## Problem

Ozone appears twice on the home screen, as two different quantities from two different sources, and neither is labeled.

- The row shows `current.raw.o3`, the CAMS hour. Its verdict chip grades `current.exposure.o3`, the 8-hour max. The number and the verdict are different things.
- The measured strip shows AirNow's ozone AQI walked back to µg/m³. That AQI is AirNow's ozone NowCast, a weighted multi-hour average, so the strip is a third window.
- CAMS global runs warm-season ozone high in the eastern US. On 2026-08-07 CAMS read 166 µg/m³ while the New Haven monitor implied about 82. The strip's caption says "trust the station," which is right, but the screen still shows both.

So there is no way to tell which number is the ozone, and a 2× gap reads as a contradiction rather than as the model being wrong.

## Design

1. **One row, one number.** The number is the engine feature: the trailing 8-hour mean. The sub-label names the window and the source: "8-h · New Haven monitor" or "8-h · model".

2. **Source priority.** When the AirNow series is active (the rule in spec 21), the row runs on the monitor's hourly concentrations and the app computes its own 8-hour mean from them. Otherwise it runs on CAMS. The engine's feature and the row's number are one computation on one series, whichever source.

3. **The strip's ozone chip goes away** when the row already runs on the monitor. It would be the same number twice. The strip keeps particles, where model-vs-station disagreement means something (a local source the model missed).

4. **Sparkline stays hourly.** Hourly values, not the 8-h mean, so the afternoon ramp is visible. Past hours come from the active source; forecast hours come from CAMS, since AirNow has no hourly forecast. A visible seam marks where measured ends and model begins.

5. **Bias warning when on the model in the US.** With no monitor in the bbox, the caption says plainly: "Model ozone runs high in the eastern US in summer."

6. **The scoreboard keeps the AQI points and the `aqi.ts` bridge.** Nothing there changes.

7. **"Right now" versus "8-h".** The M1 finding was that the 8-hour number lags a ramp by hours. That's the mechanism, not an artifact: ozone dose accumulates over hours and the response is delayed. The hourly sparkline and the forecast curve answer "walk now or at 7 pm." The row answers "what is my exposure."

## Acceptance

- In Hamden with AirNow on, the ozone row's number equals the mean of the monitor's last eight hourly readings, the sub-label names the site, and the measured strip has no ozone chip.
- With AirNow off, the row runs on CAMS `mean8h`, the sub-label says "model", and the bias caption shows.
- The row's verdict and its number come from the same value. Test: a series where the current hour is low and the 8-h mean is high grades high and displays the mean.

## Non-goals

Changing the ozone breakpoints. Using AirNow's daily forecast AQI for the ozone curve.
