import { createFileRoute } from '@tanstack/react-router'
import type { ExposureSeries } from '../sources/openMeteo'
import { useExposureSeries } from '../ui/useExposureSeries'

export const Route = createFileRoute('/detail')({ component: Detail })

const ROWS: { key: string; label: string; unit: string }[] = [
  { key: 'pm25', label: 'PM2.5', unit: 'µg/m³' },
  { key: 'pm10', label: 'PM10', unit: 'µg/m³' },
  { key: 'o3', label: 'Ozone', unit: 'µg/m³' },
  { key: 'no2', label: 'NO₂', unit: 'µg/m³' },
  { key: 'temp', label: 'Temp', unit: '°C' },
  { key: 'humidity', label: 'Humidity', unit: '%RH' },
]

function Detail() {
  const { location, series, error } = useExposureSeries()
  if (error) return <p className="status-line error">Couldn't reach Open-Meteo: {error}</p>
  if (!series) return <p className="status-line">Reading the air…</p>

  return (
    <>
      <h1 className="section-title">Past 3 days · next 2 days</h1>
      {ROWS.map((row) => (
        <SparkRow key={row.key} row={row} series={series} />
      ))}
      <DayLabels series={series} />
      <p className="meta-line">
        {location.label} · Open-Meteo (model) · raw hourly values, not exposure windows
      </p>
    </>
  )
}

function SparkRow({
  row,
  series,
}: {
  row: { key: string; label: string; unit: string }
  series: ExposureSeries
}) {
  const values = series.hours.map((h) => h.raw[row.key] ?? 0)
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const n = values.length
  const points = values
    .map((v, i) => `${(i / (n - 1)) * 100},${30 - ((v - Math.min(min, 0)) / (max - Math.min(min, 0) || 1)) * 28}`)
    .join(' ')
  const nowX = (series.currentIndex / (n - 1)) * 100
  const current = values[series.currentIndex] ?? 0
  return (
    <div className="spark-row">
      <div className="spark-meta">
        <span className="spark-label">{row.label}</span>
        <span className="spark-value">
          {Math.round(current)} <span className="strip-unit">{row.unit}</span>
        </span>
        <span className="spark-range">
          {Math.round(min)}–{Math.round(max)}
        </span>
      </div>
      <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" role="img">
        <line x1={nowX} x2={nowX} y1={0} y2={30} className="now-line" />
        <polyline points={points} className="spark-line" />
      </svg>
    </div>
  )
}

function DayLabels({ series }: { series: ExposureSeries }) {
  const midnights = series.hours
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.time.slice(11) === '00:00')
  return (
    <div className="spark-days">
      {midnights.map(({ h, i }) => (
        <span key={h.time} style={{ left: `${(i / (series.hours.length - 1)) * 100}%` }}>
          {new Date(`${h.time}:00`).toLocaleDateString(undefined, { weekday: 'short' })}
        </span>
      ))}
    </div>
  )
}
