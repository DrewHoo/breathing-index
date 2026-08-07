import type { Rating } from '../engine/types'

export const BI_LABELS: Record<Rating, { label: string; meaning: string }> = {
  1: { label: 'Easy', meaning: "The air isn't a factor. Do anything." },
  2: { label: 'Noticeable', meaning: "You'll feel it, but carry on as planned." },
  3: { label: 'Limiting', meaning: 'Change the plan: shorter, slower, later.' },
  4: { label: 'Dangerous', meaning: 'Outside is unsafe for you. Stay in filtered air.' },
}

/** The forecast meaning line, keyed by the ceiling level. */
export const FORECAST_MEANING: Record<Rating, string> = {
  1: "The air isn't a factor today. Do anything.",
  2: "You'll feel it, but you can carry on as planned.",
  3: 'You will feel it. Keep a plan B for the walk.',
  4: 'Outside could be unsafe for you. Plan around filtered air.',
}

export const levelWord = (r: Rating): string => BI_LABELS[r].label.toLowerCase()

export interface VariableLabel {
  /** display name ("Smoke") */
  name: string
  /** tiny sublabel next to the name ("PM2.5"), if any */
  sub?: string
  /** lowercase short name for diary exposure lines ("smoke") */
  short: string
  unit: string
}

export const VARIABLE_LABELS: Record<string, VariableLabel> = {
  pm25: { name: 'Smoke', sub: 'PM2.5', short: 'smoke', unit: 'µg/m³' },
  pm10: { name: 'Dust', sub: 'PM10', short: 'dust', unit: 'µg/m³' },
  o3: { name: 'Ozone', sub: 'O₃', short: 'ozone', unit: 'µg/m³' },
  no2: { name: 'NO₂', short: 'NO₂', unit: 'µg/m³' },
  so2: { name: 'SO₂', short: 'SO₂', unit: 'µg/m³' },
  co: { name: 'CO', short: 'CO', unit: 'µg/m³' },
  heat_stress: { name: 'Heat', short: 'heat', unit: '°' },
  cold_dry_stress: { name: 'Cold, dry', short: 'cold', unit: '°' },
  humidity: { name: 'Humidity', sub: '3-day', short: 'humidity', unit: '%' },
}

export const variableName = (v: string): string => VARIABLE_LABELS[v]?.name ?? v
