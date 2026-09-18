# Research

Agent-written research reports: the first batch behind specs 21–28, later ones as they landed. Each report says what it verified and what it didn't. Nothing here is medical advice.

| File | What it is |
|---|---|
| [asthma-triggers-evidence.md](asthma-triggers-evidence.md) | Acute asthma triggers outside the standard AQI, graded A–D by evidence, with thresholds, lags and citations. Includes a correction pass (viral prevalence, NH₃, lead, traffic) and a fourth sweep on PM composition, VOCs and marine aerosols. |
| [data-sources-catalog.md](data-sources-catalog.md) | US data sources for a breathing index: per-pollutant air quality, pollen, mold, weather, smoke, lightning, viral activity, consumer sensors. Live-verified 2026-09-13/14, with pricing, auth, resolution, gotchas, and a recommended free stack. Includes the AirNow endpoint retirement. |
| [mold-sources.md](mold-sources.md) | Every institution found publishing outdoor mold spore counts, worldwide, with access method and scrapeability. Feeds [specs/28-mold.md](../specs/28-mold.md). |
| [aqi-indices-comparison.md](aqi-indices-comparison.md) | How the world's composite indices are built (US AQI, EAQI, CAQI, and the rest), pulled from the drewhoover.com post draft. |
| [purpleair-license.md](purpleair-license.md) | PurpleAir's terms read clause by clause — what the open-source clause actually bars, what a legal relay serves, points pricing — plus the AirGradient contrast. Corrects spec 21 §8; feeds spec 37. |
| [upstream-api-limits.md](upstream-api-limits.md) | Rate limits and true data cadences for Open-Meteo, AirNow, Google Pollen, HMS and the mold pages, plus the workbox/HTTP-cache facts. The numbers behind the refetch floors in [docs/code-standards.md](../docs/code-standards.md). |
| [free-oss-tooling.md](free-oss-tooling.md) | The $0 tooling roster a public Apache-2.0 repo qualifies for — Sentry sponsorship, real-device iOS programs, Lighthouse CI and its INP blind spot — with adopt/skip verdicts. |
| [openaq-v3.md](openaq-v3.md) | OpenAQ v3 mechanics: the two-call join, per-unit parameter ids, staleness traps, per-provider licenses, and the real coverage map (Europe strong, China dead, Canada absent). Feeds [specs/38-openaq.md](../specs/38-openaq.md). |

The chat-level synthesis that produced specs 21–28 is not archived; the specs are the durable form.
