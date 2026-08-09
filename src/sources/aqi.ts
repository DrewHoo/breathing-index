/**
 * AQI points back to a concentration, so the station strip and the model rows
 * can be read against each other.
 *
 * AirNow's widget endpoint reports per-pollutant *AQI values*: "OZONE 58" is a
 * position on a piecewise index, not a number of micrograms, and sitting it
 * under "Ozone 180 µg/m³" invited a comparison that was never true. The EPA
 * mapping is piecewise-linear and invertible inside a category, so the points
 * can be walked back to the concentration that produced them — which is the
 * only number the strip shows: the points themselves never reach the screen.
 *
 * The tables are the ones `scripts/derive-breakpoints.mjs` documents, extended
 * to the full ladder (that script only needs each category's lower bound; an
 * inverse needs both ends of every segment). The engine's own breakpoints stay
 * where they are — nothing here feeds inference, only the display.
 *
 * The result is approximate on purpose: AQI is reported as an integer, so a
 * single point covers a range of concentrations, and the station's averaging
 * window (24-h for PM, 8-h for ozone) is not this hour. Hence "≈".
 */

/** µg/m³ per ppb at the EPA's 25 °C / 1013 hPa — same constant as the script. */
const UG_M3_PER_PPB = { o3: 1.96 } as const

/** AQI category ends. Every EPA pollutant shares them. */
const AQI_BANDS: [number, number][] = [
  [0, 50],
  [51, 100],
  [101, 150],
  [151, 200],
  [201, 300],
  [301, 500],
]

/**
 * Concentration ends per category, in the unit the table publishes. Each band's
 * lower bound is the number `derive-breakpoints.mjs` carries for that category
 * (PM2.5 9.1 / 35.5 / 55.5 · PM10 55 / 155 / 255 · ozone 55 / 71 / 86 ppb).
 */
const TABLES: Record<string, { unit: 'µg/m³' | 'ppb'; bands: ([number, number] | null)[] }> = {
  // EPA AQI table, 2024 PM2.5 revision, 24-h mean.
  pm25: {
    unit: 'µg/m³',
    bands: [
      [0, 9.0],
      [9.1, 35.4],
      [35.5, 55.4],
      [55.5, 125.4],
      [125.5, 225.4],
      [225.5, 325.4],
    ],
  },
  // EPA AQI table, 24-h mean.
  pm10: {
    unit: 'µg/m³',
    bands: [
      [0, 54],
      [55, 154],
      [155, 254],
      [255, 354],
      [355, 424],
      [425, 604],
    ],
  },
  // EPA AQI table, 8-h mean, published in ppb. Above 200 ppb the 8-h table
  // stops and the 1-h table takes over, so the top band has no inverse here.
  o3: {
    unit: 'ppb',
    bands: [
      [0, 54],
      [55, 70],
      [71, 85],
      [86, 105],
      [106, 200],
      null,
    ],
  },
}

export type Bridgeable = 'pm25' | 'pm10' | 'o3'

/** AirNow's parameter names for the pollutants we can bridge. */
const PARAMETERS: Record<string, Bridgeable> = {
  'PM2.5': 'pm25',
  PM10: 'pm10',
  OZONE: 'o3',
  O3: 'o3',
}

export const bridgeableParameter = (parameter: string): Bridgeable | undefined =>
  PARAMETERS[parameter.toUpperCase()]

/**
 * The concentration an AQI value stands for, in µg/m³, or null when the
 * pollutant or the value is off the table. Gas rows convert at the EPA's
 * reference conditions, exactly as the engine's own breakpoints do.
 */
export function concentrationFromAqi(parameter: string, aqi: number): number | null {
  const variable = bridgeableParameter(parameter)
  if (!variable || !Number.isFinite(aqi) || aqi < 0) return null
  const table = TABLES[variable]!
  const index = AQI_BANDS.findIndex(([lo, hi]) => aqi >= lo && aqi <= hi)
  const band = index === -1 ? undefined : table.bands[index]
  if (!band) return null
  const [iLo, iHi] = AQI_BANDS[index]!
  const [cLo, cHi] = band
  const value = cLo + ((aqi - iLo) * (cHi - cLo)) / (iHi - iLo)
  return table.unit === 'ppb' ? value * UG_M3_PER_PPB.o3 : value
}
