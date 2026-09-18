# PurpleAir — license, pricing, and the shape of a legal integration

Agent-compiled (Claude, September 2026). Read for spec 37; corrects the license claim spec 21 §8 shipped with. Every clause below is from the Terms and Conditions dated July 18, 2022 — still current as of 2026-09-17, and unrevised since (the DMCA section still lists the Draper, UT address the company has since left).

Sources: [Terms of Service](https://www.purpleair.com/policies/terms-of-service) · [Data License](https://www.purpleair.com/license) · [Attribution guide](https://www.purpleair.com/attribution) · [API docs](https://api.purpleair.com/) · [staff reading of §4.5](https://community.purpleair.com/t/purpleair-data-download-tool/3787/9) · [API pricing thread](https://community.purpleair.com/t/api-pricing/4523)

## The open-source clause, and what it actually bars

§4.5 "No Open Source Materials": in creating Data Derivatives, the licensee "shall not incorporate, derive from, or otherwise use any Open Source Materials." The definition sweeps in Apache-2.0 (its criteria iii and iv cover notice-reproduction and royalty-free patent grants) and names GPL, MIT, BSD and the rest explicitly. Read literally, an Apache-2.0 app computing anything from PurpleAir data trips it.

PurpleAir's own staff read it the other way. Their Data Download Tool is MIT-licensed; when a forum user pointed out the contradiction in July 2023, staff answered that the tool is compliant because it fetches with the user's own key, and that the clause governs the data: "The PurpleAir Data Download Tool is still open-source and can be distributed. The data collected through the PurpleAir Data Download Tool cannot."

So: open-source code calling the API is fine by PurpleAir's stated position. Distributing the data is not. Committing PurpleAir data to this repo is prohibited three ways over — §4.5 as staff read it, §4.7 ("You shall not make the PurpleAir Data available in raw form to any third parties"), and §4.3.d, which licenses storage only "on one or more internal servers possessed or otherwise controlled by you."

## What the relay may and may not do

- §4.3, final paragraph: "PurpleAir API calls shall be made solely by you and you shall not allow or otherwise enable any third-party to make PurpleAir API calls." A relay holding our key and making the calls itself is us; handing browsers anything that lets them call PurpleAir is not.
- §4.7: no raw data to third parties, no service-bureau access, no competing air quality database. A relay route that returns PurpleAir's own JSON shape is raw data to third parties. A route that returns a derived value is a Licensee Product serving End Users, which the Data License page blesses in as many words: "a user of the PurpleAir API can utilize PurpleAir data to provide to an end-user (e.g., a viewer of a map or user of an app), but cannot resell data or an API modeled from PurpleAir data."
- §4.3.d: caching on servers we control is licensed "solely as necessary" — KV with a short TTL is that.
- §5.2: the key is never shared. It lives in the Worker's secrets, like AirNow's.

So the deleted `/v1/purpleair` route (spec 21 §8) was the right call for a half-right reason: it returned PurpleAir's payload shape, which is the §4.7 problem. The route that is legal serves one derived number per cell.

## Obligations that come with shipping it

- **Attribution** (§4.8 and the attribution guide): "Data from PurpleAir" for direct display, "Powered by PurpleAir", and a link to purpleair.com for apps.
- **Health context** (§7.3): a "conspicuous notice that the Licensee Product does not warrant the accuracy or availability of any service or information provided in a health or emergency context," with near-verbatim wording prescribed in the attribution guide. Directly applicable to this app.
- **Revenue triggers written notice** (§4.3.c): distributing for "any commercial purpose or in any manner intended to generate revenue" requires prior written notice to PurpleAir. The supporter tier (specs/16) would trip this, so the notice email goes out before that tier does.
- **Grantback** (§4.4): PurpleAir gets a perpetual, sublicensable license over Licensee Derivatives, explicitly including models trained on the data. Philosophically at odds with an open project even though it never mentions open source.
- The End User definition limits use to "internal, non-commercial, non-public use" — a personal breathing diary fits; republishing readings would not.

The safe play before building on any of this: email contact@purpleair.com with a "Data Licensing Inquiry" describing the app (free, open-source, personal health tool, derived-value relay, supporter tier planned) and keep the answer on file, the way spec 28 §1 handles the NAB.

## Points and pricing

- One million points granted once per organization. Points never expire. There is no recurring free tier and no nonprofit tier.
- Top-ups: $10–49 buys 100k points per USD — so a million more points is ten dollars.
- Cost per call: an endpoint base cost (≤5 points) plus a per-field cost per row. `pm2.5` is 2 points per data point.
- The expensive shape is discovery: a `get_sensors_data` bbox query over an urban cell touches ~100 sensors at roughly 205 points per call, which burns the million in months at hourly refresh. The cheap shape is fetching a handful of known sensor IDs with few fields, roughly 15–25 points per cell-hour, which makes the million last years per active cell. Sensor locations don't move, so the discovery query caches for days and the hourly fetch names its sensors.
- Unverified: current per-field costs live behind the Developer Dashboard login ("Billing → Pricing"); the numbers above are from the 2023 community article and could be stale. Re-check after creating the org.

## AirGradient, for contrast

Spec 21 §8 names AirGradient as the license-clean alternative. Verified: `GET https://api.airgradient.com/public/api/v1/world/locations/measures/current` answers with ~1.5 MB of global sensor rows, no key. The license is CC-BY-SA 4.0 ([data ownership page](https://www.airgradient.com/documentation/data-ownership-and-sharing/)) with named-contributor attribution. Two caveats: share-alike is copyleft on derived datasets (permitted-and-keyless, not obligation-free), and CC-BY-SA is itself an "Open Source Material" under PurpleAir's §4.5 definition, so under the strict reading the two sources can never be merged into one derivative. About a thousand CONUS sensors online versus PurpleAir's tens of thousands.
