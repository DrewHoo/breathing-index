# M1 data spike — findings (2026-08-06)

Question from the spec: is Hamden's bad-feeling air driven by PM2.5 smoke particulate, and why did
"US AQI 70 Moderate" feel worse than Amsterdam's "LKI 7–8 insufficient"?

Sources queried ~15:00 EDT via `scripts/spike.sh`: Open-Meteo (CAMS model, hourly, past + forecast)
and AirNow's keyless reporting-area endpoint (measured stations, New Haven reporting area).

## Verdict: hypothesis *half* right — it's a two-trigger day, and the composite AQI hid one of them

**Measured (AirNow, New Haven, 15:00 EDT):** PM2.5 AQI **55 Moderate** (primary pollutant),
ozone 48, PM10 18. Forecast: ozone AQI **101 today / 108 tomorrow — Unhealthy for Sensitive
Groups**, and today is flagged an official **Ozone Action Day**.

**Model (Open-Meteo, Hamden):** PM2.5 steady at 13–14 µg/m³ (sub-AQI ~50) all day; instantaneous
ozone climbing 59 → 168 µg/m³ through the afternoon, with the 8-hour ozone sub-index jumping
50 → 72 → 113 → **133 by 21:00**. Tomorrow's model peak: ozone sub-index **159** (Unhealthy),
PM2.5 sub-index 61.

So at the moment the app said "70, Moderate":

1. **PM2.5 was genuinely elevated and smoke-like.** Fine fraction is the fingerprint: model
   PM2.5/PM10 ≈ 0.93 (14.0/15.0); measured PM2.5 AQI 55 vs PM10 AQI 18. Nearly all the particulate
   is fine-mode — consistent with smoke/secondary aerosol, not dust. Hypothesis supported.
2. **Ozone was ramping to Unhealthy-for-Sensitive-Groups underneath the composite.** The 8-hour
   averaging means the headline number lags the instantaneous reality by hours; the composite
   `max()` shows only one pollutant. An asthmatic outdoors at 4–9pm gets moderate smoke particulate
   **and** USG ozone simultaneously — a combination the single "70 Moderate" cannot express.

## The Amsterdam comparison (Aug 3–4, model hourly)

Amsterdam on Mon/Tue was an **ozone-only** event: instantaneous ozone peaked 156 µg/m³ (Mon
17:00) — comparable to Hamden today — but PM2.5 sat at just **10–12 µg/m³** during daytime hours
(EAQI ~65 "poor", which maps to the Dutch LKI 7–8 "onvoldoende" observed). Tonight (Aug 6)
Amsterdam is clean: PM2.5 3.8, ozone 68.

**One trigger (ozone) in Amsterdam vs two triggers (ozone + smoke-like PM2.5) in Hamden** is a
coherent explanation for "labored but functional" there vs "can't walk" here — and neither
country's composite number surfaces the distinction.

## Model vs measured

Model PM2.5 sub-AQI 51 vs measured 55 at the same hour — close here, but the observed "70" earlier
in the day (vs model ~50) suggests measured NowCast PM2.5 runs above the CAMS model locally.
Supports the spec's plugin-source design: show both, treat disagreement as signal.

## Immediate practical read (from the hourly curves)

- **Walk in the morning.** Ozone sub-index is 27–37 before ~10:00; it's 113–159 from 16:00–22:00
  today and tomorrow. PM2.5 is roughly flat all day, so timing is entirely an ozone play.
- Tomorrow (Aug 7) afternoon/evening is forecast **worse** than today.

## Implications for the app

- The **driver line** must be time-aware: today's driver flips from PM2.5 (midday) to ozone
  (evening). A single "driven by X" snapshot is wrong within hours; show driver-over-time.
- **Co-elevation deserves its own signal.** When ≥2 sub-indices exceed ~50, the personal score
  should reflect the combination (asthma literature treats ozone + PM2.5 as compounding). The pure
  `max()` in the spec understates days like today — revisit (e.g. max + secondary-pollutant bump).
- **Fine-fraction (PM2.5/PM10) smoke fingerprint works** and is cheap — both sources provide it.
- **AirNow's widget endpoint needs no key** (`airnowgovapi.com/reportingarea/get`) and returns
  measured per-pollutant AQI + category + Action Day flags + forecast. Unofficial/undocumented, so
  wrap it in a source plugin with Open-Meteo fallback rather than depending on it.
- The **hourly forecast view (M2 detail screen) is arguably the highest-value screen**: "walk now
  or at 7pm?" had a decisive answer hiding in the data.
