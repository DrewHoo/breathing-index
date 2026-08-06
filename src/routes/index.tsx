import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { PRIORS } from '../engine/config'
import { buildModel, predict, variableStatus } from '../engine/infer'
import type { Prediction, Rating } from '../engine/types'
import type { ExposureSeries } from '../sources/openMeteo'
import { loadDiary } from '../ui/diaryStorage'
import { evidenceLine } from '../ui/evidence'
import { BI_LABELS, VARIABLE_LABELS } from '../ui/labels'
import { useExposureSeries } from '../ui/useExposureSeries'

export const Route = createFileRoute('/')({ component: Home })

const STRIP_VARIABLES = ['pm25', 'pm10', 'o3', 'no2', 'heat_stress', 'cold_dry_stress', 'humidity']

function Home() {
  const { location, series: data, error, stale } = useExposureSeries()
  const diary = useMemo(loadDiary, [])
  const model = useMemo(() => buildModel(diary), [diary])

  if (error) return <p className="status-line error">Couldn't reach Open-Meteo: {error}</p>
  if (!data) return <p className="status-line">Reading the air…</p>

  const current = data.hours[data.currentIndex]
  if (!current) return <p className="status-line error">No data for the current hour.</p>

  const prediction = predict(model, current.exposure, PRIORS)

  return (
    <>
      {stale && (
        <p className="stale-banner">
          Offline — showing air data fetched{' '}
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
      <Link to="/diary" className="log-cta">
        How's breathing? Log it →
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
              {Math.round(raw[variable] ?? 0)}
              <span className="strip-unit"> {meta?.unit}</span>
            </div>
            <div className="strip-status">{status.replace('-', ' ')}</div>
          </div>
        )
      })}
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
