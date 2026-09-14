# NWS alerts — the official warnings, as a banner and never a variable

**Status:** proposed · **Effort:** S · **Deps:** relay · **Priority:** high. Free, keyless, and the one input in the catalog that comes with official standing.

## Problem

The National Weather Service publishes active alerts for any point, keyless, with seconds of latency, and the list includes the ones this app's variables are about: Air Quality Alert, Air Stagnation Advisory, Dense Smoke Advisory, Blowing Dust Advisory and Dust Storm Warning, Red Flag Warning, Heat Advisory and Excessive Heat Warning. The app shows the AirNow Action Day flag and nothing else official.

The distinction that decides the design: an alert is a declaration about a region, not an exposure. It says a forecaster judged conditions worth a warning. The variables it warns about (PM2.5, smoke, dust, heat) are already in the vector as measurements.

## Advantages

- Free, keyless (a `User-Agent` header with a contact address is the only requirement), JSON, point-filterable (`/alerts/active?point=lat,lon`), updated within seconds of issue.
- Authoritative in a way nothing else here is. "The NWS has a Dense Smoke Advisory up until 6 pm" is a sentence with standing; the app's own smoke row is a satellite polygon and a ratio.
- The pattern exists: the Action Day banner is exactly this, from a different agency.
- Covers what the app cannot compute: a Red Flag Warning is about fire risk, an Air Stagnation Advisory is about the next two days' ventilation, both forward-looking.
- The communication layer the US AQI wastes. A warning with a time window and a plain sentence is what a person acts on.

## Challenges

- **Must never enter the vector.** If a warning were a variable, the engine would learn from a forecaster's judgement instead of the air, and a good day under an advisory would "exonerate" the advisory. Alerts are display and diary metadata only, on the same rule as the official indices: captured on the entry, never read by inference.
- **Region, not point.** Alerts are issued by zone or county; `point=` resolves to the zone containing the coarse cell centre, which can differ from the user's actual block at a zone edge. Acceptable at 11 km; say so in the privacy page's description.
- **Prose varies by office.** `headline` and `description` are written by whichever forecaster is on shift. The banner shows the event name and the expiry, and the headline only when short.
- **Reliability.** api.weather.gov has documented slow spells and occasional 5xx. The relay caches 15 minutes and passes failures through; the banner is absent, never wrong.
- **Noise.** A location can have several active alerts, most irrelevant to breathing (Coastal Flood Advisory). A whitelist of event types is the whole filter, and it has to be maintained by hand when the NWS renames one (they do).
- **Two sources say "air quality."** AirNow's Action Day and an NWS Air Quality Alert are usually the same state agency's decision relayed twice. Show both when both fire; do not attempt to dedupe them.

## Design

1. **Relay route `/v1/alerts?lat=&lon=`**: fetches `https://api.weather.gov/alerts/active?point={lat},{lon}` with the required `User-Agent` (`breathingindex.com, {contact}`) and `Accept: application/geo+json`, filters `features[].properties.event` against a whitelist (Air Quality Alert, Air Stagnation Advisory, Dense Smoke Advisory, Blowing Dust Advisory, Blowing Dust Warning, Dust Storm Warning, Red Flag Warning, Heat Advisory, Excessive Heat Warning, Excessive Heat Watch), returns `[{ event, headline, expires, severity }]`, cached 15 minutes per coarse cell. Upstream failure passes through uncached.
2. **Banner**: under the Action Day line (same `.action-day` style), one line per alert: `⚠ Dense Smoke Advisory · until 6 PM`. Tapping expands the headline. Absent when the list is empty.
3. **Diary**: entries capture `official.alerts: string[]` (event names) alongside `usAqi`/`eaqi`. Never read by inference; the scoreboard, when built, can compare.
4. **Coverage**: US only, by the AirNow box. Outside it the route is not called.
5. **Privacy page**: the route, and the note that the cell centre is what the NWS sees.
6. **Glossary**: one entry, "Official alerts", saying what a warning is and is not.

## Acceptance

- A cell with an active whitelisted alert shows the banner with event and expiry; a cell with only a Coastal Flood Advisory shows nothing; a relay 5xx shows nothing.
- A logged entry under an alert carries `official.alerts`; `buildModel` output is byte-identical with and without it (fixture).
- The relay sends the `User-Agent` and caches 15 minutes (`x-relay-cache: hit` on the second call).

## Non-goals

Alerts as variables. Push notifications (spec 13). Deduping AirNow and NWS. Thunderstorm-asthma logic.
