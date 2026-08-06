import type { Rating } from '../engine/types'

export const BI_LABELS: Record<Rating, { label: string; meaning: string }> = {
  1: { label: 'Clear', meaning: "The air isn't a factor. Do anything." },
  2: { label: 'Noticeable', meaning: "You'll feel it, but you can carry on as planned." },
  3: { label: 'Limiting', meaning: 'Change the plan: shorter, slower, later, or elsewhere.' },
  4: { label: 'Indoors', meaning: 'Outside is unsafe for you. Stay in filtered air.' },
}

export const VARIABLE_LABELS: Record<string, { name: string; unit: string }> = {
  pm25: { name: 'PM2.5', unit: 'µg/m³' },
  pm10: { name: 'PM10', unit: 'µg/m³' },
  o3: { name: 'Ozone', unit: 'µg/m³' },
  no2: { name: 'NO₂', unit: 'µg/m³' },
  so2: { name: 'SO₂', unit: 'µg/m³' },
  co: { name: 'CO', unit: 'µg/m³' },
  heat_stress: { name: 'Heat', unit: '°C over 25' },
  cold_dry_stress: { name: 'Cold-dry', unit: '°C under 10' },
  humidity: { name: 'Humidity', unit: '%RH 72h' },
}

export const variableName = (v: string): string => VARIABLE_LABELS[v]?.name ?? v
