import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { PRIORS, negligibleFor } from '../engine/config'
import { buildModel, predict, variableStatus } from '../engine/infer'
import type { DiaryEntry, Prediction, Rating, TriggerModel } from '../engine/types'
import { fetchAirNow, type AirNowReport } from '../sources/airnow'
import type { ExposureSeries } from '../sources/openMeteo'
import { track } from '../ui/analytics'
import { LevelPill, SectionRule } from '../ui/bits'
import { hasStoredDiary, loadDiary, saveDiary } from '../ui/diaryStorage'
import { sentinelInLocalStorage } from '../ui/durability'
import { InstallNudge } from '../ui/durabilityUi'
import { newEntryId } from '../ui/entryId'
import { evidence } from '../ui/evidence'
import { BI_LABELS, FORECAST_MEANING, VARIABLE_LABELS, levelWord } from '../ui/labels'
import { todaysSimilarEntries } from '../ui/recentEntry'
import { loadSettings } from '../ui/settings'
import { displayTemperature, useTemperatureUnit, type TemperatureUnit } from '../ui/units'
import { useExposureSeries } from '../ui/useExposureSeries'

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { log?: boolean } =>
    search.log ? { log: true } : {},
  beforeLoad: () => {
    // A sentinel with no diary means the browser took it. /intro sorts out
    // which screen that deserves — the restore offer, not the welcome.
    if (!hasStoredDiary() && sentinelInLocalStorage()) throw redirect({ to: '/intro' })
    if (!loadSettings().introSeen && loadDiary().length === 0) {
      throw redirect({ to: '/intro' })
    }
  },
  component: Home,
})

const RATINGS: Rating[] = [1, 2, 3, 4]

/** Numeral/dot ink per level (the "ink + one alarm" ramp). */
const LEVEL_INK: Record<Rating, string> = {
  1: '#A7B6BE',
  2: '#7A8B94',
  3: '#3B4A54',
  4: '#C13A31',
}

/** Sparkline run ink per level — level 1 sits a shade lighter. */
const SPARK_INK: Record<Rating, string> = { ...LEVEL_INK, 1: '#B9C6CC' }

const hourNum = (iso: string): number => Number.parseInt(iso.slice(11, 13), 10)

function fmtHour(h: number, spaced: boolean): string {
  const meridiem = h < 12 ? 'AM' : 'PM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display}${spaced ? ' ' : ''}${meridiem}`
}

function Home() {
  const { location, source, series: data, error, stale } = useExposureSeries()
  const { log: forceLog } = Route.useSearch()
  const [diary, setDiary] = useState<DiaryEntry[]>(loadDiary)
  const [justSaved, setJustSaved] = useState<DiaryEntry | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const tempUnit = useTemperatureUnit()

  const current = data?.hours[data.currentIndex]

  // Today's similar-air entries are held out so a fresh tap never predicts itself.
  const heldOut = useMemo(
    () => (current ? todaysSimilarEntries(diary, current.exposure, PRIORS) : []),
    [diary, current],
  )
  const modelDiary = useMemo(() => {
    const held = new Set(heldOut.map((e) => e.id))
    return diary.filter((e) => !held.has(e.id))
  }, [diary, heldOut])
  const model = useMemo(() => buildModel(modelDiary), [modelDiary])
  const coldStart = modelDiary.filter((e) => !e.confounders?.length).length === 0

  const prediction = current ? predict(model, current.exposure, PRIORS) : null

  useEffect(() => {
    if (!prediction) return
    track('Prediction viewed', {
      // The predicted band and the variables behind it are this person's air
      // and lungs, so only the shape of the evidence goes out: how many
      // entries the model had, and whether the reading was stale.
      diaryEntries: diary.length,
      stale,
      // How the location was chosen, never which one — location.label is now
      // the user's actual town.
      locationSource: source,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  if (error) return <p className="status-line error">Couldn&rsquo;t reach Open-Meteo: {error}</p>
  if (!data || !current || !prediction) return <p className="status-line">Reading the air…</p>

  const updateDiary = (next: DiaryEntry[]) => {
    setDiary(next)
    setSaveFailed(!saveDiary(next))
  }

  const logNow = (rating: Rating) => {
    const tapped = performance.now()
    const entry: DiaryEntry = {
      id: newEntryId(),
      time: new Date().toISOString(),
      rating,
      exposure: current.exposure,
      official: current.official,
    }
    updateDiary([...diary, entry])
    setJustSaved(entry)
    setDismissed(false)
    // The rating and the air it was rated against are the diary — they stay
    // here. What ships is that a tap happened, and that saving it was fast.
    track('Diary entry saved', {
      coldStart,
      saveMs: Math.round(performance.now() - tapped),
      totalEntries: diary.length + 1,
    })
  }

  const amendSaved = (patch: Partial<DiaryEntry>) => {
    if (!justSaved) return
    const amended = { ...justSaved, ...patch }
    setJustSaved(amended)
    updateDiary(diary.map((e) => (e.id === justSaved.id ? amended : e)))
  }

  const undo = () => {
    if (!justSaved) return
    updateDiary(diary.filter((e) => e.id !== justSaved.id))
    setJustSaved(null)
  }

  const fetchedTime = new Date(data.fetchedAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const showCard = !dismissed && (justSaved !== null || heldOut.length === 0 || Boolean(forceLog))

  return (
    <>
      <header className="screen-header">
        <span className="wordmark">Breathing Index 🫁</span>
        <span className="header-meta">
          {location.label.replace(' (default)', '')} · {fetchedTime}
        </span>
      </header>
      {stale && <p className="stale-banner">Offline — showing air fetched {fetchedTime}.</p>}

      {showCard && (
        <QuickLogCard
          coldStart={coldStart}
          saved={justSaved}
          onLog={logNow}
          onAmend={amendSaved}
          onUndo={undo}
          onDismiss={() => setDismissed(true)}
        />
      )}

      {saveFailed ? (
        <p className="save-error">
          Couldn&rsquo;t save that — this browser is out of room.{' '}
          <Link to="/settings">Export your diary now.</Link>
        </p>
      ) : (
        <InstallNudge entryCount={diary.length} />
      )}

      <ForecastBlock
        prediction={prediction}
        coldStart={coldStart}
        holdOut={justSaved !== null}
      />
      <WhyBlock prediction={prediction} model={model} diary={modelDiary} coldStart={coldStart} />
      <AirTable data={data} model={model} tempUnit={tempUnit} />
      <ByHour data={data} model={model} coldStart={coldStart} />
      <MeasuredStrip lat={location.lat} lon={location.lon} />
    </>
  )
}

/* --- quick log --- */

const SAVED_CHIPS = [
  { label: 'worse outdoors', kind: 'observation', value: 'worse-outdoors' },
  { label: 'sick', kind: 'confounder', value: 'sick' },
  { label: 'allergies', kind: 'confounder', value: 'allergies' },
  { label: 'indoors all day', kind: 'confounder', value: 'indoors all day' },
] as const

function QuickLogCard({
  coldStart,
  saved,
  onLog,
  onAmend,
  onUndo,
  onDismiss,
}: {
  coldStart: boolean
  saved: DiaryEntry | null
  onLog: (rating: Rating) => void
  onAmend: (patch: Partial<DiaryEntry>) => void
  onUndo: () => void
  onDismiss: () => void
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')

  if (saved) {
    const savedTime = new Date(saved.time).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    })
    const isOn = (chip: (typeof SAVED_CHIPS)[number]): boolean =>
      chip.kind === 'observation'
        ? (saved.observations ?? []).includes(chip.value)
        : (saved.confounders ?? []).includes(chip.value)
    const toggle = (chip: (typeof SAVED_CHIPS)[number]) => {
      const key = chip.kind === 'observation' ? 'observations' : 'confounders'
      const cur = saved[key] ?? []
      const next = cur.includes(chip.value)
        ? cur.filter((v) => v !== chip.value)
        : [...cur, chip.value]
      onAmend({ [key]: next.length ? next : undefined })
    }
    return (
      <section className="card quicklog" key="saved">
        <div className="quicklog-saved-row">
          <LevelPill level={saved.rating} variant="inline" />
          <div className="quicklog-saved-text">
            <span className="quicklog-saved-when">Saved, {savedTime}</span>
            <span className="quicklog-saved-sub">logged with this air</span>
          </div>
          <button type="button" className="quicklog-undo" onClick={onUndo}>
            undo
          </button>
        </div>
        <div className="chip-row">
          {SAVED_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className={`chip${isOn(chip) ? ' on' : ''}`}
              onClick={() => toggle(chip)}
            >
              {chip.label}
            </button>
          ))}
          <button
            type="button"
            className={`chip${saved.note ? ' on' : ''}`}
            onClick={() => setNoteOpen((v) => !v)}
          >
            + note
          </button>
        </div>
        {noteOpen && (
          <input
            className="note-input"
            placeholder="note"
            value={note}
            autoFocus
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => onAmend({ note: note.trim() || undefined })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onAmend({ note: note.trim() || undefined })
                setNoteOpen(false)
              }
            }}
          />
        )}
        <button type="button" className="dismiss-button" onClick={onDismiss}>
          Nothing to add
        </button>
      </section>
    )
  }

  return (
    <section className={`card quicklog${coldStart ? ' cold' : ''}`} key="asking">
      {coldStart ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="quicklog-question">How is your breathing?</span>
          <span className="quicklog-cold-sub">
            Your first tap starts the learning — good days count double.
          </span>
        </div>
      ) : (
        <div className="quicklog-ask-row">
          <span className="quicklog-question">How is your breathing?</span>
          <span className="quicklog-hint">one tap saves this air</span>
        </div>
      )}
      <div className="quicklog-buttons">
        {RATINGS.map((r) => (
          <button key={r} type="button" className="quicklog-button" onClick={() => onLog(r)}>
            <span className={`quicklog-digit d${r}`}>{r}</span>
            <span className="quicklog-word">{BI_LABELS[r].label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

/* --- forecast --- */

function ForecastBlock({
  prediction,
  coldStart,
  holdOut,
}: {
  prediction: Prediction
  coldStart: boolean
  holdOut: boolean
}) {
  const { floor, ceiling } = prediction
  const headline = coldStart
    ? `Up to ${levelWord(ceiling)} is possible.`
    : floor === ceiling
      ? `${BI_LABELS[ceiling].label}.`
      : `${BI_LABELS[floor].label}, maybe ${levelWord(ceiling)}.`
  return (
    <section className="section">
      <SectionRule label="Forecast" note={coldStart ? 'unpersonalized' : undefined} />
      <div className="forecast-headline">{headline}</div>
      <NumberLine floor={floor} ceiling={ceiling} coldStart={coldStart} />
      <span className="forecast-meaning">
        {coldStart ? 'Averages for sensitive lungs — not you, yet.' : FORECAST_MEANING[ceiling]}
      </span>
      {holdOut && (
        <span className="holdout-note">
          Your tap is not counted here — this is what the rest of your diary expects from air like
          this.
        </span>
      )}
    </section>
  )
}

function NumberLine({
  floor,
  ceiling,
  coldStart,
}: {
  floor: Rating
  ceiling: Rating
  coldStart: boolean
}) {
  const x = (level: number): number => 10 + ((level - 1) * 320) / 3
  const lo = coldStart ? 1 : floor
  const inRange = RATINGS.filter((l) => l >= lo && l <= ceiling)
  const bracket =
    ceiling > lo
      ? `M${x(lo)},19 V12 H${x(ceiling)} V19`
      : `M${x(ceiling) - 12},19 V12 H${x(ceiling) + 12} V19`
  return (
    <svg className="forecast-svg" viewBox="0 0 340 50" role="img" aria-label={`Forecast ${floor} to ${ceiling}`}>
      <line x1={10} y1={28} x2={330} y2={28} stroke="#C7D2D8" strokeWidth={1.5} />
      <line x1={10} y1={24} x2={10} y2={32} stroke="#C7D2D8" strokeWidth={1.5} />
      <line x1={330} y1={24} x2={330} y2={32} stroke="#C7D2D8" strokeWidth={1.5} />
      <path
        d={bracket}
        fill="none"
        stroke={coldStart ? '#7A8B94' : '#22303A'}
        strokeWidth={1.3}
        strokeDasharray={coldStart ? '3 3' : undefined}
      />
      <text
        x={(x(lo) + x(ceiling)) / 2}
        y={9}
        textAnchor="middle"
        fontFamily="Instrument Sans, sans-serif"
        fontStyle="italic"
        fontSize={10}
        fill={coldStart ? '#64757F' : '#3B4A54'}
      >
        {coldStart ? 'at most' : 'likely'}
      </text>
      {coldStart ? (
        <circle cx={x(ceiling)} cy={28} r={5} fill="#F3F6F7" stroke="#7A8B94" strokeWidth={1.5} />
      ) : (
        inRange.map((level) => (
          <circle key={level} cx={x(level)} cy={28} r={5} fill={LEVEL_INK[level]} />
        ))
      )}
      {RATINGS.map((level) => {
        const within = level >= lo && level <= ceiling
        const emphasized = coldStart ? level === ceiling : within
        return (
          <text
            key={level}
            x={x(level)}
            y={46}
            textAnchor="middle"
            fontFamily="Spline Sans Mono, monospace"
            fontSize={11}
            fontWeight={emphasized ? 600 : 400}
            fill={
              !within ? '#A7B6BE' : !coldStart && level === ceiling ? '#22303A' : '#5F707A'
            }
          >
            {level}
          </text>
        )
      })}
    </svg>
  )
}

/* --- why --- */

function WhyBlock({
  prediction,
  model,
  diary,
  coldStart,
}: {
  prediction: Prediction
  model: TriggerModel
  diary: DiaryEntry[]
  coldStart: boolean
}) {
  if (coldStart) {
    return (
      <section className="section tight">
        <SectionRule label="Why" />
        <span className="why-text">
          No diary yet, so this ceiling comes from population breakpoints for sensitive groups.
          Every entry you log replaces a piece of it with <em>you</em>.
        </span>
      </section>
    )
  }
  const { main, aside } = evidence(prediction, model, diary)
  return (
    <section className="section tight">
      <SectionRule label="Why" />
      <span className="why-text">{main}</span>
      {aside && <span className="why-aside">{aside}</span>}
    </section>
  )
}

/* --- in the air --- */

interface AirRow {
  key: string
  name: string
  sub?: string
  value: number
  unit: string
  /** exposure-space value + variable the evidence status is computed from */
  statusVar: string
  statusValue: number
  lo: number
  hi: number
  dot: number
  /** personal tolerance tick ("highest handled fine"), display space */
  tol?: number
  /** shaded stress zones (temperature row), as [start, end] in display space */
  zones?: [number, number][]
}

function pct(value: number, lo: number, hi: number): number {
  if (hi <= lo) return 50
  return Math.min(98, Math.max(2, ((value - lo) / (hi - lo)) * 100))
}

function buildAirRows(
  data: ExposureSeries,
  model: TriggerModel,
  tempUnit: TemperatureUnit,
): AirRow[] {
  const ci = data.currentIndex
  const window = data.hours.slice(Math.max(0, ci - 47), ci + 1)
  const current = data.hours[ci]!
  const range = (pick: (h: (typeof window)[number]) => number): [number, number] => {
    const values = window.map(pick)
    return [Math.min(...values), Math.max(...values)]
  }
  const tolerance = (variable: string): number | undefined => {
    const tol = model.tolerance[variable]?.[2]
    return tol !== undefined && tol > negligibleFor(variable) ? tol : undefined
  }

  const rows: AirRow[] = []
  for (const key of ['pm25', 'o3', 'pm10', 'no2'] as const) {
    const [lo, hi] = range((h) => h.raw[key] ?? 0)
    const meta = VARIABLE_LABELS[key]!
    rows.push({
      key,
      name: meta.name,
      sub: meta.sub,
      value: Math.round(current.raw[key] ?? 0),
      unit: meta.unit ?? '',
      statusVar: key,
      statusValue: current.exposure[key] ?? 0,
      lo: Math.round(lo),
      hi: Math.round(hi),
      dot: current.raw[key] ?? 0,
      tol: tolerance(key),
    })
  }

  // One temperature row backed by the two one-sided stresses; the name
  // follows the active side, and both stress zones shade the track.
  const coldSide = (current.exposure.cold_dry_stress ?? 0) > 0
  const [loC, hiC] = range((h) => h.raw.temp ?? 0)
  const disp = (c: number): number => Math.round(displayTemperature(c, tempUnit))
  const zones: [number, number][] = []
  if (loC < 10) zones.push([disp(loC), disp(Math.min(10, hiC))])
  if (hiC > 25) zones.push([disp(Math.max(25, loC)), disp(hiC)])
  const tempVar = coldSide ? 'cold_dry_stress' : 'heat_stress'
  const tolStress = tolerance(tempVar)
  rows.push({
    key: 'temp',
    name: coldSide ? 'Cold, dry' : 'Heat',
    value: disp(current.raw.temp ?? 0),
    unit: `°${tempUnit}`,
    statusVar: tempVar,
    statusValue: current.exposure[tempVar] ?? 0,
    lo: disp(loC),
    hi: disp(hiC),
    dot: disp(current.raw.temp ?? 0),
    tol: tolStress !== undefined ? disp(coldSide ? 10 - tolStress : 25 + tolStress) : undefined,
    zones,
  })

  const [loH, hiH] = range((h) => h.raw.humidity ?? 0)
  rows.push({
    key: 'humidity',
    name: 'Humidity',
    sub: '3-day',
    value: Math.round(current.exposure.humidity ?? 0),
    unit: '%',
    statusVar: 'humidity',
    statusValue: current.exposure.humidity ?? 0,
    lo: Math.round(loH),
    hi: Math.round(hiH),
    dot: current.exposure.humidity ?? 0,
    tol: tolerance('humidity'),
  })
  return rows
}

function statusChip(
  model: TriggerModel,
  variable: string,
  value: number,
): { text: string; cls: string } {
  if (value <= negligibleFor(variable)) return { text: '· low', cls: '' }
  switch (variableStatus(model, PRIORS, variable, value)) {
    case 'confirmed':
      return { text: '● trigger', cls: 'trigger' }
    case 'suspected':
      return { text: '◐ suspect', cls: 'suspect' }
    case 'tolerated':
      return { text: '○ fine before', cls: 'fine' }
    default:
      return { text: '◌ no data', cls: '' }
  }
}

function AirTable({
  data,
  model,
  tempUnit,
}: {
  data: ExposureSeries
  model: TriggerModel
  tempUnit: TemperatureUnit
}) {
  const rows = buildAirRows(data, model, tempUnit)
  const hour = fmtHour(hourNum(data.hours[data.currentIndex]!.time), true)
  const hasTolerance = rows.some((r) => r.tol !== undefined)
  return (
    <section className="section" style={{ gap: 4 }}>
      <SectionRule
        label="In the air"
        note={`${hour} · range = past 48 h${hasTolerance ? ' · ○ handled fine' : ''}`}
        faint
      />
      <div className="air-table">
        {rows.map((row) => {
          const status = statusChip(model, row.statusVar, row.statusValue)
          return (
            <div key={row.key} className="air-row">
              <div className="air-name-row">
                <span className="air-name">{row.name}</span>
                {row.sub && <span className="air-sub">{row.sub}</span>}
                <span className="air-spacer" />
                <span className="air-value">
                  {row.value} <span className="air-unit">{row.unit}</span>
                </span>
                <span className={`air-status ${status.cls}`}>{status.text}</span>
              </div>
              <div className="air-range-row">
                <span className="air-endpoint lo">{row.lo}</span>
                <div className="air-track">
                  {row.zones?.map(([start, end], i) => {
                    const a = pct(start, row.lo, row.hi)
                    const b = pct(end, row.lo, row.hi)
                    return (
                      <span
                        key={i}
                        className={`air-zone${a <= 2 ? ' left' : ''}${b >= 98 ? ' right' : ''}`}
                        style={{ left: `${a}%`, width: `${b - a}%` }}
                      />
                    )
                  })}
                  {row.tol !== undefined && (
                    <span className="air-tol" style={{ left: `${pct(row.tol, row.lo, row.hi)}%` }} />
                  )}
                  <span className="air-dot" style={{ left: `${pct(row.dot, row.lo, row.hi)}%` }} />
                </div>
                <span className="air-endpoint">{row.hi}</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* --- by hour --- */

const SPAN_HOURS = 19

function ByHour({
  data,
  model,
  coldStart,
}: {
  data: ExposureSeries
  model: TriggerModel
  coldStart: boolean
}) {
  const hours = data.hours.slice(data.currentIndex, data.currentIndex + SPAN_HOURS)
  if (hours.length < 2) return null
  const levels = hours.map((h) => predict(model, h.exposure, PRIORS).ceiling)
  const y = (level: Rating): number => 42 - (level - 1) * 12.5
  const step = 320 / levels.length

  // Group consecutive equal levels into horizontal runs.
  const runs: { level: Rating; from: number; to: number }[] = []
  for (let i = 0; i < levels.length; i++) {
    const last = runs[runs.length - 1]
    if (last && last.level === levels[i]) last.to = i
    else runs.push({ level: levels[i]!, from: i, to: i })
  }

  const first = levels[0]!
  const changeAt = levels.findIndex((l) => l !== first)
  const takeaway =
    changeAt === -1
      ? 'steady ahead'
      : `${levels[changeAt]! < first ? 'eases' : 'climbs'} after ${fmtHour(hourNum(hours[changeAt]!.time), true)}`

  const tickCount = 4
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const index = Math.round((i * (hours.length - 1)) / (tickCount - 1))
    return fmtHour(hourNum(hours[index]!.time), false)
  })

  return (
    <section className="section tight">
      <SectionRule
        label="By hour"
        note={coldStart ? 'unpersonalized ceiling' : takeaway}
        faint={coldStart}
        italic={coldStart}
      />
      <svg
        className={`byhour-svg${coldStart ? ' cold' : ''}`}
        viewBox="0 0 320 48"
        preserveAspectRatio="none"
        role="img"
        aria-label="Forecast level by hour"
      >
        {([1, 2, 3] as Rating[]).map((level) => (
          <line key={level} x1={0} y1={y(level)} x2={320} y2={y(level)} stroke="#E3EAED" strokeWidth={1} />
        ))}
        {runs.slice(1).map((run, i) => (
          <path
            key={`v${i}`}
            d={`M${run.from * step},${y(runs[i]!.level)} V${y(run.level)}`}
            stroke="#C7D2D8"
            strokeWidth={1.5}
            fill="none"
          />
        ))}
        {runs.map((run, i) => (
          <path
            key={`h${i}`}
            d={`M${run.from * step},${y(run.level)} H${Math.min(320, (run.to + 1) * step)}`}
            stroke={SPARK_INK[run.level]}
            strokeWidth={2.5}
            fill="none"
          />
        ))}
      </svg>
      <div className="byhour-ticks">
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </section>
  )
}

/* --- measured nearby (AirNow) --- */

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
    <section className="section">
      <SectionRule
        label="Measured nearby"
        note={`${report.reportingArea}${report.time ? ` · ${report.time}` : ''}`}
        faint
      />
      {report.actionDay && <p className="action-day">⚠ Official air quality Action Day</p>}
      <div className="measured-row">
        {report.observations.map((o) => (
          <span key={o.parameter} className={`measured-item${o.isPrimary ? ' primary' : ''}`}>
            {o.parameter} <strong>{o.aqi}</strong> {o.category}
          </span>
        ))}
      </div>
      <span className="settings-note">
        Station readings from AirNow. Disagreement with the model usually means a local source,
        such as smoke, that the model missed.
      </span>
    </section>
  )
}
