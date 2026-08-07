import { Link, createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { track } from '../ui/analytics'
import { PRIORS } from '../engine/config'
import { buildModel, predict, variableStatus } from '../engine/infer'
import type { DiaryEntry, Prediction, Rating } from '../engine/types'
import { fetchAirNow, type AirNowReport } from '../sources/airnow'
import type { ExposureSeries, Hour } from '../sources/openMeteo'
import { loadDiary, saveDiary } from '../ui/diaryStorage'
import { evidenceLine } from '../ui/evidence'
import { BI_LABELS, VARIABLE_LABELS, variableUnit } from '../ui/labels'
import { QuickLog } from '../ui/QuickLog'
import { todaysSimilarEntries } from '../ui/recentEntry'
import { loadSettings } from '../ui/settings'
import { displayExposure, useTemperatureUnit, type TemperatureUnit } from '../ui/units'
import { useExposureSeries } from '../ui/useExposureSeries'

export const Route = createFileRoute('/')({ component: Home })

const STRIP_VARIABLES = ['pm25', 'pm10', 'o3', 'no2', 'heat_stress', 'cold_dry_stress', 'humidity']

function Home() {
  const { location, series: data, error, stale } = useExposureSeries()
  const [diary, setDiary] = useState<DiaryEntry[]>(loadDiary)
  const unit = useTemperatureUnit()
  const current: Hour | null = (data && data.hours[data.currentIndex]) ?? null

  // Only ask for a rating if today hasn't already answered for air like this.
  const answered = useMemo(
    () => (current ? todaysSimilarEntries(diary, current.exposure, PRIORS) : []),
    [diary, current],
  )
  const logged = answered[0] ?? null

  /**
   * The forecast is built from every day *except* the answers the quick-log
   * card is already showing. Today's rating is evidence for air exactly like
   * today's, so leaving it in collapses the range onto the number the user just
   * tapped — the screen would quote them back to themselves and call it a
   * prediction. Held out, the headline stays what the rest of the diary
   * expects, and the gap between the two is the interesting part.
   */
  const forecastDiary = useMemo(() => {
    if (answered.length === 0) return diary
    const reported = new Set(answered.map((e) => e.id))
    return diary.filter((e) => !reported.has(e.id))
  }, [diary, answered])
  const model = useMemo(() => buildModel(forecastDiary), [forecastDiary])

  const logRating = useCallback(
    (rating: Rating) => {
      if (!current) return
      const entry: DiaryEntry = {
        id: crypto.randomUUID(),
        time: new Date().toISOString(),
        rating,
        exposure: current.exposure,
        official: current.official,
      }
      const next = [...diary, entry]
      setDiary(next)
      saveDiary(next)
      track('Diary entry saved', {
        rating,
        confounders: [],
        observations: [],
        hasNote: false,
        totalEntries: next.length,
        source: 'home-quick-log',
      })
    },
    [current, diary],
  )

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
      <QuickLog logged={logged} onRate={logRating} />
      <BigRating prediction={prediction} />
      <div className="evidence-block">
        <p className="evidence-line">{evidenceLine(prediction, forecastDiary)}</p>
        {logged && (
          <p className="hint forecast-note">
            Your rating above isn't counted here — this is what your other days expect from air
            like this.
          </p>
        )}
      </div>
      <ConstituentStrip
        model={model}
        exposure={current.exposure}
        raw={current.raw}
        unit={unit}
      />
      <TodayCurve data={data} model={model} />
      <MeasuredStrip lat={location.lat} lon={location.lon} />
      <Link to="/diary" className="log-cta">
        Open your diary →
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
  unit,
}: {
  model: ReturnType<typeof buildModel>
  exposure: Record<string, number>
  raw: Record<string, number>
  unit: TemperatureUnit
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
              {Math.round(
                displayExposure(
                  variable,
                  (variable === 'humidity' ? exposure[variable] : raw[variable]) ?? 0,
                  unit,
                ),
              )}
              <span className="strip-unit"> {variableUnit(variable, unit)}</span>
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
