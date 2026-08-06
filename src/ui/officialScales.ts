/** Official-scale helpers — used ONLY by the scoreboard (the receipts view). */

export function usAqiCategory(aqi: number): string {
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very Unhealthy'
  return 'Hazardous'
}

export function eaqiCategory(eaqi: number): string {
  if (eaqi <= 20) return 'Good'
  if (eaqi <= 40) return 'Fair'
  if (eaqi <= 60) return 'Moderate'
  if (eaqi <= 80) return 'Poor'
  if (eaqi <= 100) return 'Very poor'
  return 'Extremely poor'
}

/** True when the official rating sounds benign (Moderate or better on the US scale). */
export const usAqiSoundsFine = (aqi: number): boolean => aqi <= 100
