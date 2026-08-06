import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { track } from '../ui/analytics'
import { PRIORS } from '../engine/config'
import { buildModel, predict, variableStatus } from '../engine/infer'
import type { Prediction, Rating } from '../engine/types'
import { fetchAirNow, type AirNowReport } from '../sources/airnow'
import type { ExposureSeries } from '../sources/openMeteo'
import { loadDiary } from '../ui/diaryStorage'
import { evidenceLine } from '../ui/evidence'
import { BI_LABELS, VARIABLE_LABELS } from '../ui/labels'
import { loadSettings } from '../ui/settings'
import { useExposureSeries } from '../ui/useExposureSeries'

export const Route = createFileRoute('/')({ component: Home })

const STRIP_VARIABLES = ['pm25', 'pm10', 'o3', 'no2', 'heat_stress', 'cold_dry_stress', 'humidity']

function Home() {
  const { location, series: data, error, stale } = useExposureSeries()
  const diary = useMemo(loadDiary, [])
  const model = useMemo(() => buildModel(diary), [diary])

  useEffect(() => {
    if (!data) return
    const hour = data.hours[data.currentIndex]
    if (!hour) return
    const p = predict(model, hour.exposure, PRIORS)
    track('Prediction viewed', {
      floor: p.floor,
      ceiling: p.ceiling,
      reasonKinds: [...new Set(p.reasons.map((r) => r.kind))],
      diaryEntries: diary.length,
      stale,
      location: location.label,
    })
  }, [data, model, diary, stale, location])

  if (error) return <p className="status-line error">Couldn't reach Open-Meteo: {error}</p>
  if (!data) return <p className="status-line">Reading the air…</p>

  const current = data.hours[data.currentIndex]
  if (!current) return <p className="status-line error">No data for the current hour.</p>

  const prediction = predict(model, current.exposure, PRIORS)

  return (
    <>
      {stale && (
        <p className="stale-banner">
          Offline. Showing air data fetched{' '}
          {new Date(data.fetchedAt).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          })}
          .
        </p>
      )}
      <BigRating prediction={prediction} />
      <p className="evidence-line">{evidenceLine(prediction, diary)}</p>
      <ConstituentStrip
        model={model}
        exposure={current.exposure}
        raw={current.raw}
      />
      <TodayCurve data={data} model={model} />
      <MeasuredStrip lat={location.lat} lon={location.lon} />
      <Link to="/diary" className="log-cta">
        How's breathing? →
      </Link>
      <p className="meta-line">
        {location.label} · Open-Meteo (model) · as of{' '}
        {current.time.slice(11)} local
      </p>
    </>
  )
}

function BigRating({ prediction }: { prediction: Prediction }) {
  const { floor, ceiling } = prediction
  const display = floor === ceiling ? `${ceiling}` : `${floor}–${ceiling}`
  const label =
    floor === ceiling
      ? BI_LABELS[ceiling].label
      : `${BI_LABELS[floor].label} to ${BI_LABELS[ceiling].label}`
  return (
    <section className="big-rating">
      <div className={`bi-digit bi-${ceiling}`}>{display}</div>
      <div>
        <div className="bi-label">{label}</div>
        <div className="bi-meaning">{BI_LABELS[ceiling].meaning}</div>
      </div>
    </section>
  )
}

function ConstituentStrip({
  model,
  exposure,
  raw,
}: {
  model: ReturnType<typeof buildModel>
  exposure: Record<string, number>
  raw: Record<string, number>
}) {
  return (
    <section className="strip">
      {STRIP_VARIABLES.map((variable) => {
        const status = variableStatus(model, PRIORS, variable, exposure[variable] ?? 0)
        const meta = VARIABLE_LABELS[variable]
        const prior2 = PRIORS[variable]?.[2]
        const fill =
          prior2 !== undefined
            ? Math.min(1, (exposure[variable] ?? 0) / (2 * prior2))
            : 0
        return (
          <div key={variable} className={`strip-item status-${status}`} title={status}>
            <div className="strip-bar">
              <div className="strip-fill" style={{ height: `${Math.max(4, fill * 100)}%` }} />
            </div>
            <div className="strip-name">{meta?.name ?? variable}</div>
            <div className="strip-value">
              {/* humidity's status is driven by its 72h mean, so display that */}
              {Math.round((variable === 'humidity' ? exposure[variable] : raw[variable]) ?? 0)}
              <span className="strip-unit"> {meta?.unit}</span>
            </div>
            <div className="strip-status">{status.replace('-', ' ')}</div>
          </div>
        )
      })}
    </section>
  )
}

function MeasuredStrip({ lat, lon }: { lat: number; lon: number }) {
  const [report, setReport] = useState<AirNowReport | null>(null)
  const enabled = useMemo(() => loadSettings().airnowEnabled, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchAirNow(lat, lon)
      .then((r) => {
        if (!cancelled) setReport(r)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [enabled, lat, lon])

  if (!enabled || !report || report.observations.length === 0) return null

  return (
    <section className="measured">
      <h2 className="section-title">
        Measured nearby ({report.reportingArea}
        {report.time ? ` · ${report.time}` : ''})
      </h2>
      {report.actionDay && <p className="action-day">⚠ Official air quality Action Day</p>}
      <div className="measured-row">
        {report.observations.map((o) => (
          <span key={o.parameter} className={`measured-item${o.isPrimary ? ' primary' : ''}`}>
            {o.parameter} <strong>{o.aqi}</strong> {o.category}
          </span>
        ))}
      </div>
      <p className="hint">
        Station measurements from AirNow, reported as a US AQI value per pollutant. Disagreement
        with the model above usually means a local source, such as smoke, that the model missed.
      </p>
    </section>
  )
}

function TodayCurve({
  data,
  model,
}: {
  data: ExposureSeries
  model: ReturnType<typeof buildModel>
}) {
  const start = Math.max(0, data.currentIndex - 6)
  const hours = data.hours.slice(start, start + 36)
  const nowOffset = data.currentIndex - start
  const barWidth = 100 / hours.length
  return (
    <section>
      <h2 className="section-title">Next 30 hours</h2>
      <svg className="curve" viewBox="0 0 100 34" preserveAspectRatio="none" role="img">
        {hours.map((hour, i) => {
          const p = predict(model, hour.exposure, PRIORS)
          return (
            <rect
              key={hour.time}
              className={`bi-fill-${p.ceiling as Rating}${i < nowOffset ? ' past' : ''}`}
              x={i * barWidth}
              y={34 - p.ceiling * 8}
              width={barWidth * 0.85}
              height={p.ceiling * 8}
            />
          )
        })}
        <line
          x1={nowOffset * barWidth}
          x2={nowOffset * barWidth}
          y1={0}
          y2={34}
          className="now-line"
        />
      </svg>
      <div className="curve-labels">
        {hours
          .filter((_, i) => i % 6 === 0)
          .map((hour) => (
            <span key={hour.time}>{hour.time.slice(11, 13)}h</span>
          ))}
      </div>
    </section>
  )
}
