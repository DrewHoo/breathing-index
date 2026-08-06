/**
 * AirNow measured stations via the keyless reporting-area widget endpoint.
 * Unofficial/undocumented — treat as best-effort: US-only, may vanish.
 * Returns per-pollutant *AQI values* (not concentrations), so it feeds the
 * measured-vs-model comparison display, never the inference engine.
 */

export interface AirNowReading {
  parameter: string
  aqi: number
  category: string
  isPrimary: boolean
}

export interface AirNowReport {
  reportingArea: string
  time: string
  observations: AirNowReading[]
  /** today's forecast rows, when present */
  forecast: AirNowReading[]
  actionDay: boolean
  fetchedAt: string
}

interface RawRecord {
  dataType: string
  reportingArea: string
  time: string
  validDate: string
  issueDate: string
  parameter: string
  aqi: number
  category: string
  isPrimary: boolean
  isActionDay: boolean
  recordSequence: number
}

export async function fetchAirNow(lat: number, lon: number): Promise<AirNowReport | null> {
  const res = await fetch(
    `https://airnowgovapi.com/reportingarea/get?latitude=${lat}&longitude=${lon}&maxDistance=50`,
  )
  if (!res.ok) return null
  const records = (await res.json()) as RawRecord[]
  if (!Array.isArray(records) || records.length === 0) return null

  const observations = records.filter((r) => r.dataType === 'O' && r.aqi >= 0)
  const todayForecast = records.filter((r) => r.dataType === 'F' && r.recordSequence === 0 && r.aqi >= 0)
  if (observations.length === 0 && todayForecast.length === 0) return null

  const first = observations[0] ?? todayForecast[0]!
  return {
    reportingArea: first.reportingArea,
    time: observations[0]?.time ?? '',
    observations: observations.map(({ parameter, aqi, category, isPrimary }) => ({
      parameter,
      aqi,
      category,
      isPrimary,
    })),
    forecast: todayForecast.map(({ parameter, aqi, category, isPrimary }) => ({
      parameter,
      aqi,
      category,
      isPrimary,
    })),
    actionDay: records.some((r) => r.isActionDay),
    fetchedAt: new Date().toISOString(),
  }
}
