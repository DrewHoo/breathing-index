import type { Rating } from '../engine/types'
import { TEMPERATURE_FEATURES, displayTemperature, type TemperatureUnit } from './units'

export const BI_LABELS: Record<Rating, { label: string; meaning: string }> = {
  1: { label: 'Excellent', meaning: "The air isn't a factor. Do anything." },
  2: { label: 'Noticeable', meaning: "You'll feel it, but you can carry on as planned." },
  3: { label: 'Limiting', meaning: 'Change the plan: shorter, slower, later, or elsewhere.' },
  4: { label: 'Dangerous', meaning: 'Outside is unsafe for you. Stay in filtered air.' },
}

/** Temperature features have no fixed unit here — see `variableUnit()`. */
export const VARIABLE_LABELS: Record<string, { name: string; unit?: string }> = {
  pm25: { name: 'PM2.5', unit: 'µg/m³' },
  pm10: { name: 'PM10', unit: 'µg/m³' },
  o3: { name: 'Ozone', unit: 'µg/m³' },
  no2: { name: 'NO₂', unit: 'µg/m³' },
  so2: { name: 'SO₂', unit: 'µg/m³' },
  co: { name: 'CO', unit: 'µg/m³' },
  heat_stress: { name: 'Heat' },
  cold_dry_stress: { name: 'Cold-dry' },
  humidity: { name: 'Humidity', unit: '%RH 72h' },
}

export const variableName = (v: string): string => VARIABLE_LABELS[v]?.name ?? v

/**
 * The unit to print next to a variable's value. The temperature stress
 * features are degrees away from a reference temperature, so both the degree
 * symbol and the reference localize: "°C over 25" becomes "°F over 77".
 */
export function variableUnit(variable: string, unit: TemperatureUnit): string {
  const feature = TEMPERATURE_FEATURES[variable]
  if (feature) {
    const reference = Math.round(displayTemperature(feature.referenceC, unit))
    return `°${unit} ${feature.direction} ${reference}`
  }
  return VARIABLE_LABELS[variable]?.unit ?? ''
}
