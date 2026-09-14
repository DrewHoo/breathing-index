# Vector diet — fewer variables, sharper attribution

**Status:** proposed · **Effort:** S · **Deps:** [22-exposure-windows.md](22-exposure-windows.md) · **Priority:** high

## Problem

The trigger-model doc's identifiability argument: every variable enlarges candidate sets, and correlated pairs rarely decorrelate on their own. Two current variables cost attribution and buy little, and one planned addition is right for Asia and wrong here.

## Design

1. **`pm10` becomes display-only.** Coarse PM has weak independent evidence for acute asthma, and PM10 is PM2.5 plus the coarse fraction, so it co-moves with PM2.5 in every candidate set. Keep fetching it: the row and the smoke fingerprint need it. Feature extraction stops writing `pm10` into `exposure` and keeps it in `raw`. `smokeFingerprint` already reads `raw` (moved in [22-exposure-windows.md](22-exposure-windows.md) §6), so nothing else changes. No engine change. Where coarse PM matters on its own (dust storms, RR 1.06 at lag 0–3), [20-baseline-bad-air.md](20-baseline-bad-air.md) already adds `dust` as its own variable.

2. **`no2` leaves the vector.** Controlled-exposure meta-analyses find it statistically significant, clinically marginal, and without a dose-response between 100 and 600 ppb; where it matters is as an amplifier after allergen challenge. NO₂ gradients are sub-kilometer, so a 45 km CAMS cell reads as noise. The row goes with it. The label stays for old entries.

3. **Traffic is what NO₂ was standing in for, and PM2.5 can't see it.** Karner 2010: PM2.5 mass shows no gradient with distance from a road, while ultrafines, black carbon, NO₂ and CO decay sharply. The Oxford Street crossover (FEV₁ down 6.1% after two hours) tracked ultrafines, which no public network measures. So add `near-traffic` as an observation chip. v1: a note, like `exercising`. Later it can gate a static road-proximity feature per saved location. NASA TEMPO (2 × 4.5 km hourly NO₂, free with an Earthdata login) is the measured route if anyone wants it; it's NetCDF and a scheduled job, not a relay request.

4. **`so2` and `co` stay out of the US vector.** [20-baseline-bad-air.md](20-baseline-bad-air.md) adds them by region. The region rule is the guard.

After [23-dew-point-air.md](23-dew-point-air.md) and this spec the US vector is `pm25`, `o3`, `dry_air`, `humid_heat`, the in-season pollen plants, `viral` ([26](26-sick-as-signal.md)) and `smoke` ([25](25-smoke-variable.md)). Roughly seven live dimensions instead of nine or more.

## Acceptance

- A bad day with pm25 and pm10 both elevated yields the candidate set `{pm25}`.
- The NO₂ row is gone; an older entry still lists its NO₂ in the diary.
- `smoke.test.ts` still passes (the fingerprint has read `raw` since spec 22).
- The `near-traffic` chip saves to `observations`.

## Non-goals

A road-proximity feature. TEMPO.
