#!/usr/bin/env bash
# M1 data spike: per-pollutant readings for a location, from both sources.
# Usage: ./scripts/spike.sh [lat] [lon] [timezone]
set -euo pipefail

LAT="${1:-41.396}"   # Hamden, CT
LON="${2:--72.897}"
TZ="${3:-America/New_York}"

echo "=== Open-Meteo (CAMS model) current + hourly ==="
curl -s "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&current=pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,us_aqi,us_aqi_pm2_5,us_aqi_pm10,us_aqi_ozone,us_aqi_nitrogen_dioxide,european_aqi&hourly=pm2_5,pm10,ozone,us_aqi,us_aqi_pm2_5,us_aqi_ozone&past_days=1&forecast_days=2&timezone=${TZ//\//%2F}" \
  | jq '{current, hourly_sample: (.hourly | [.time, .pm2_5, .ozone, .us_aqi_pm2_5, .us_aqi_ozone] | transpose | map(select(.[0][11:13] | tonumber | . % 3 == 0)))}'

echo
echo "=== AirNow (measured stations, no key — unofficial widget endpoint) ==="
curl -s "https://airnowgovapi.com/reportingarea/get?latitude=${LAT}&longitude=${LON}&stateCode=CT&maxDistance=50" \
  | jq '[.[] | {type: .dataType, date: .validDate, time, parameter, aqi, category, primary: .isPrimary, actionDay: .isActionDay}]'
