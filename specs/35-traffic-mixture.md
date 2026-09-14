# Traffic mixture — measured NO₂ where a monitor has it, satellite NO₂ later

**Status:** proposed · **Effort:** S (phase 1, AirNow monitors) · L (phase 2, TEMPO) · **Deps:** [21-airnow-migration.md](21-airnow-migration.md), [24-vector-diet.md](24-vector-diet.md) (which removed modelled NO₂) · **Priority:** medium; high for anyone who walks a highway corridor

## Problem

Two hours walking Oxford Street dropped asthmatics' FEV₁ by up to 6.1 % and FVC by 5.4 % against the same walk in Hyde Park, and the change tracked ultrafine particles and elemental carbon. Pooling 41 studies, PM2.5 mass shows no gradient with distance from a road at all, while ultrafines, black carbon, NO₂ and CO decay sharply within a few hundred metres. So the traffic mixture is invisible in the PM2.5 row, and the app's only handle on it is the `near traffic` chip.

No public network anywhere measures ultrafines. NO₂ is the available tracer: it decays with the same gradient, it is measured hourly at EPA near-road monitors in about fifty cities, and NASA's TEMPO instrument now maps it from orbit at 2 × 4.5 km every daylight hour over North America. Spec 24 removed NO₂ because a 45 km CAMS cell cannot see a gradient that is sub-kilometre; that argument does not apply to a monitor a mile away or a satellite pixel.

## Advantages

- **Phase 1 is nearly free.** The AirNow `aq/data/` service takes `NO2` as a parameter (spec 29 did the same for SO₂). Where a near-road monitor is inside the bbox, `no2` returns as a measured, hourly, source-scoped variable with the WHO-derived priors already in `config.ts`.
- **NO₂ as a traffic tracer is settled science**, even though NO₂ as a trigger is weak. The variable stands in for the mixture the way the smoke density stands in for smoke PM.
- **TEMPO resolves neighbourhoods**: 2.1 × 4.4 km at nadir, hourly in daylight, free with an Earthdata login, and it distinguishes I-91 from the Sleeping Giant.
- **It answers the `near traffic` chip.** Today the tag is a note the engine ignores; with a measured NO₂ it becomes context a bad day can be read against.

## Challenges

- **NO₂ is the wrong molecule, on purpose.** Controlled exposure finds it statistically significant and clinically marginal, with no dose-response between 100 and 600 ppb; its clear effect is amplifying allergen responses. The row would have to say "traffic, by its tracer" and the glossary has to explain that the harm is the ultrafines and soot that travel with it. A person who reads "NO₂ 40 µg/m³" as the thing hurting them has been misled.
- **Monitors are sparse.** The near-road network is roughly fifty sites nationally, one per large metro at most. Most users get nothing from phase 1. Whether New Haven's site reports NO₂ is a probe, not a fact.
- **A column is not the street.** TEMPO reports a tropospheric column (molecules/cm²), daylight only, blank under cloud. Column and surface track each other in a well-mixed daytime boundary layer and diverge at dawn, dusk and in winter. The variable would be absent every night, which is honest and odd on a screen.
- **TEMPO is a different shape of source from everything else.** Granules are NetCDF/HDF5 behind Earthdata authentication, tens of megabytes an hour. The relay cannot fetch one per request. It needs a scheduled job (a GitHub Actions cron or a Cloudflare cron worker) that pulls each daylight granule, resamples CONUS to the relay's 0.1° cells, and writes one compact object the worker can range-read — and that keeps the relay stateless about users, which is the privacy line the app has drawn.
- **Exposure is personal in a way the pixel is not.** The same NO₂ pixel covers the person in a parked car on the interstate and the person in a park two kilometres upwind. The `near traffic` chip is the only thing that knows which; the variable and the chip have to be read together, and the engine does not read chips yet.
- **Correlation with everything at rush hour.** NO₂ rises with PM2.5 from traffic and with morning stagnation; candidate sets on a bad weekday morning will hold `no2` and `pm25` together for a long time.

## Design

**Phase 1 — monitors.**
1. Relay: `parameters: 'OZONE,PM25,PM10,SO2,NO2'`; cache key bump.
2. Client: `AirNowVariable` gains `no2`; PPB → µg/m³ at 1.88; `no2` enters the vector on a station series when the nearest monitor reports it (the hour's own value, with the 2-hour look-back spec 29 added for unposted hours), absent otherwise; never from CAMS. Floor 25 µg/m³ (the WHO 24-h AQG); priors stay derived.
3. Row `NO₂ · 1-h · {site} monitor`, only above the floor; the absent line prints `Not measured here: NO₂` on a station series without it and nothing on the model series (where NO₂ is deliberately not consulted — spec 24's reasoning stands for the model).
4. Glossary entry that says what the number is a tracer for.

**Phase 2 — TEMPO.**
5. A scheduled job pulls the TEMPO L3 NO₂ tropospheric column each daylight hour, resamples to 0.1°, and writes a CONUS grid (two bytes per cell) to R2; the relay adds `/v1/no2?lat=&lon=` that range-reads one cell and returns the column with its granule time and a cloud flag.
6. Client: `no2_column`, its own variable (a column is not a concentration), daylight hours only, with quantile-based priors learned from a month of granules rather than a guideline. Row `Traffic NO₂ · satellite · as of 2 PM`. Not source-scoped.
7. The `near traffic` observation is read by the engine as context on `no2`/`no2_column` singletons, the way `worse-outdoors` strips indoor proxies — a small engine change, specified when phase 2 is real.

## Acceptance

- Phase 1: a station series whose monitor reports NO₂ carries `exposure.no2` in µg/m³ and names the site; one without it leaves `no2` absent and prints `Not measured here: NO₂`; the model series carries no `no2`. Fixture: rating 3 at `{no2: 120, pm25: 4, o3: 10}` confirms `no2`.
- Phase 2: the relay returns a column value for Hamden at 2 pm and absent at 10 pm; the job's grid is under 10 MB and refreshes hourly in daylight.

## Non-goals

Modelled NO₂ (spec 24 stands). Road-proximity as a variable (a constant per location cannot be learned). Black carbon or ultrafine measurement (no public source exists).
