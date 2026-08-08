import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { PRIORS, negligibleFor } from '../engine/config'
import { buildModel, predict, variableStatus } from '../engine/infer'
import type { DiaryEntry, Prediction, Rating, TriggerModel } from '../engine/types'
import { fetchAirNow, type AirNowReport } from '../sources/airnow'
import { bridgeableParameter, concentrationLabel } from '../sources/aqi'
import type { ExposureSeries } from '../sources/openMeteo'
import { track } from '../ui/analytics'
import { claimBankedRelease, markBankedToday } from '../ui/bankedDay'
import { LevelPill, SectionRule } from '../ui/bits'
import { hasStoredDiary, loadDiary, saveDiary } from '../ui/diaryStorage'
import { sentinelInLocalStorage } from '../ui/durability'
import { InstallNudge } from '../ui/durabilityUi'
import { newEntryId } from '../ui/entryId'
import { evidence } from '../ui/evidence'
import { exposureAgeMinutes, isEstimatedAge, isStale } from '../ui/freshness'
import {
  BI_LABELS,
  CALENDAR_ESTIMATE,
  FORECAST_MEANING,
  RESCUE_CLAUSE,
  VARIABLE_LABELS,
  levelWord,
} from '../ui/labels'
import { LocationNeededCard } from '../ui/locationUi'
import { backfillPending, settled } from '../ui/pendingExposure'
import { todaysSimilarEntries } from '../ui/recentEntry'
import { loadSettings } from '../ui/settings'
import { smokeFingerprint } from '../ui/smoke'
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

/**
 * Numeral/dot ink per level (the "ink + one alarm" ramp). Named colours rather
 * than literals so the dark-mode block in styles.css can re-point the whole
 * ramp — an SVG with #22303A baked in is invisible on a dark ground.
 */
const LEVEL_INK: Record<Rating, string> = {
  1: 'var(--l1)',
  2: 'var(--l2)',
  3: 'var(--l3)',
  4: 'var(--l4)',
}

/** Sparkline run ink per level — level 1 sits a shade lighter. */
const SPARK_INK: Record<Rating, string> = { ...LEVEL_INK, 1: 'var(--l1-soft)' }

const hourNum = (iso: string): number => Number.parseInt(iso.slice(11, 13), 10)

function fmtHour(h: number, spaced: boolean): string {
  const meridiem = h < 12 ? 'AM' : 'PM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display}${spaced ? ' ' : ''}${meridiem}`
}

function Home() {
  const { location, source, gap, asking, retryLocation, series: data, error, stale, retry } =
    useExposureSeries()
  const { log: forceLog } = Route.useSearch()
  const navigate = useNavigate()
  const [diary, setDiary] = useState<DiaryEntry[]>(loadDiary)
  const [justSaved, setJustSaved] = useState<DiaryEntry | null>(null)
  const [dismissed, setDismissed] = useState(false)
  // Claimed at mount, not at render: yesterday's held-out entries are news once.
  const [released] = useState(claimBankedRelease)
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
    return settled(diary).filter((e) => !held.has(e.id))
  }, [diary, heldOut])
  const model = useMemo(() => buildModel(modelDiary), [modelDiary])
  const coldStart = modelDiary.filter((e) => !e.confounders?.length).length === 0

  const prediction = current ? predict(model, current.exposure, PRIORS) : null

  const updateDiary = (next: DiaryEntry[]) => {
    setDiary(next)
    setSaveFailed(!saveDiary(next))
  }

  // Session-scoped on purpose: undo takes back a tap you just made, and is not
  // a delete button for this morning's entry. That lives in the diary.
  const undo = () => {
    if (!justSaved) return
    updateDiary(diary.filter((e) => e.id !== justSaved.id))
    setJustSaved(null)
  }

  // No air to attach, so the entry keeps the coordinates instead and the vector
  // is fetched for that hour later. Only reachable from the error screen, which
  // renders after the null-location guard — the check is for the compiler.
  const logPending = (rating: Rating) => {
    if (!location) return
    const entry: DiaryEntry = {
      id: newEntryId(),
      time: new Date().toISOString(),
      rating,
      exposure: {},
      pendingExposure: { lat: location.lat, lon: location.lon },
    }
    updateDiary([...diary, entry])
    setJustSaved(entry)
    if (coldStart) markBankedToday()
    track('Diary entry saved', { coldStart, pending: true, totalEntries: diary.length + 1 })
  }

  useEffect(() => {
    if (!prediction || !data) return
    track('Prediction viewed', {
      // The predicted band and the variables behind it are this person's air
      // and lungs, so only the shape of the evidence goes out: how many
      // entries the model had, and whether the reading was stale.
      diaryEntries: diary.length,
      // Staleness as the payload reports it, not as the fetch does — a cached
      // response arrives "fresh" and can be hours old.
      stale: isStale(data),
      offline: stale,
      // How the location was chosen, never which one — location.label is now
      // the user's actual town.
      locationSource: source,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // Entries logged in a dead zone get their air the moment there is air to be
  // had — from the series already on screen where it reaches their hour.
  useEffect(() => {
    let cancelled = false
    void backfillPending(diary, data, location).then((next) => {
      if (cancelled || !next) return
      updateDiary(next)
      // The card echoing a just-logged entry holds its own copy, and amending
      // writes that copy back — it has to be the one that now has air in it.
      setJustSaved((cur) => (cur ? (next.find((e) => e.id === cur.id) ?? cur) : cur))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, diary])

  // No place, no air — the whole screen is the ask, since a forecast under it
  // would be a forecast for somewhere else.
  if (gap) {
    return (
      <>
        <header className="screen-header">
          <h1 className="wordmark">Breathing Index 🫁</h1>
        </header>
        <LocationNeededCard gap={gap} asking={asking} onRetry={retryLocation} />
      </>
    )
  }
  if (!location) return <p className="status-line">Reading the air…</p>

  // The air is unreachable and there is nothing cached to fall back on. The
  // rating still has to be catchable: it is the half of an entry that can't be
  // reconstructed later.
  if (error) {
    return (
      <>
        <Header place={location.label} />
        <OfflineLog saved={justSaved} onLog={logPending} onUndo={undo} />
        <p className="status-line error">
          I can&rsquo;t reach the air readings from here — no forecast until I can.
        </p>
        <div className="retry-row">
          <button type="button" className="dismiss-button" onClick={retry}>
            Retry
          </button>
        </div>
      </>
    )
  }
  if (!data || !current || !prediction) return <p className="status-line">Reading the air…</p>

  // The echo comes from the diary, not from this session: a 4 logged at
  // breakfast is still the answer to "how is your breathing?" after a reload.
  const savedEntry = justSaved ?? heldOut[0] ?? null

  const logNow = (rating: Rating) => {
    const tapped = performance.now()
    // How far behind the air was when the rating was made. Hours-old air makes
    // the vector an estimate of that hour, and the entry says so.
    const ageMinutes = exposureAgeMinutes(data)
    const entry: DiaryEntry = {
      id: newEntryId(),
      time: new Date().toISOString(),
      rating,
      exposure: current.exposure,
      // Bounds are scoped to the source that taught them (engine config).
      source: data.source,
      official: current.official,
      exposureAgeMinutes: ageMinutes,
      ...(isEstimatedAge(ageMinutes) ? { exposureEstimated: true } : {}),
      // Which of these numbers were estimated rather than read — the entry has
      // to carry it, or the engine would later confirm a bound from a guess.
      ...(current.estimated?.length ? { estimated: current.estimated } : {}),
    }
    updateDiary([...diary, entry])
    setJustSaved(entry)
    setDismissed(false)
    // Only while the forecast still owes the user a personalization: this is the
    // tap whose payoff arrives tomorrow, and the app promises to acknowledge it.
    if (coldStart) markBankedToday()
    // The ask has been answered, so drop the flag that reopened it — otherwise a
    // reload of this URL asks again over an entry that already exists.
    if (forceLog) navigate({ to: '/', search: {} })
    // The rating and the air it was rated against are the diary — they stay
    // here. What ships is that a tap happened, and that saving it was fast.
    track('Diary entry saved', {
      coldStart,
      saveMs: Math.round(performance.now() - tapped),
      totalEntries: diary.length + 1,
    })
  }

  // Amends whatever the card is echoing, which after a reload is a diary entry
  // this session never saw. Undo stays on justSaved — see below.
  const amendSaved = (patch: Partial<DiaryEntry>) => {
    if (!savedEntry) return
    const amended = { ...savedEntry, ...patch }
    if (justSaved?.id === savedEntry.id) setJustSaved(amended)
    updateDiary(diary.map((e) => (e.id === savedEntry.id ? amended : e)))
  }

  const logAgain = () => {
    setJustSaved(null)
    setDismissed(false)
    navigate({ to: '/', search: { log: true } })
  }

  // The hour on screen is the payload's own newest hour, never the clock: the
  // service worker can hand back a six-hour-old response that parses as new.
  const dataHour = fmtHour(hourNum(current.time), true)
  const showStale = stale || isStale(data)
  // "log again" reopens the ask over an existing answer; a fresh tap closes it.
  const echo = Boolean(forceLog) && justSaved === null ? null : savedEntry
  const showCard = !dismissed
  // A rating binds to the air in `current` forever, so the ask only appears
  // over air from a place the user chose or the device reported. The hook no
  // longer serves the sample place; this is what keeps it that way.
  const chosenPlace = source !== 'default'

  return (
    <>
      <Header place={location.label} hour={dataHour} />
      {showStale && (
        <p className="stale-banner">
          {stale ? 'Offline — the' : 'The'} newest air I have is from {dataHour}.
        </p>
      )}

      {!chosenPlace && <LocationNeededCard gap="no-answer" asking={asking} onRetry={retryLocation} />}

      {showCard && chosenPlace && (
        <QuickLogCard
          coldStart={coldStart}
          saved={echo}
          canUndo={justSaved !== null && justSaved.id === echo?.id}
          onLog={logNow}
          onAmend={amendSaved}
          onUndo={undo}
          onLogAgain={logAgain}
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
        holdOut={showCard && chosenPlace && echo !== null}
        banked={coldStart ? heldOut.length : 0}
      />
      <WhyBlock
        prediction={prediction}
        model={model}
        diary={modelDiary}
        diaryCount={diary.length}
        coldStart={coldStart}
        nowCounting={released && !coldStart && modelDiary.length > 0 ? modelDiary.length : 0}
        estimated={current.estimated ?? []}
      />
      <AirTable data={data} model={model} tempUnit={tempUnit} />
      <ByHour data={data} model={model} coldStart={coldStart} />
      <MeasuredStrip lat={location.lat} lon={location.lon} />
    </>
  )
}

/**
 * The meta line names the hour of the air below it. Without air to name — the
 * offline screen — it names the place alone rather than a time that would be
 * the clock's rather than the data's.
 */
function Header({ place, hour }: { place: string; hour?: string }) {
  return (
    <header className="screen-header">
      <h1 className="wordmark">Breathing Index 🫁</h1>
      <span className="header-meta">
        {place.replace(' (default)', '')}
        {hour ? ` · ${hour}` : ''}
      </span>
    </header>
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
  canUndo,
  onLog,
  onAmend,
  onUndo,
  onLogAgain,
  onDismiss,
}: {
  coldStart: boolean
  saved: DiaryEntry | null
  /** the echoed entry was saved in this session, so taking it back is fair */
  canUndo: boolean
  onLog: (rating: Rating) => void
  onAmend: (patch: Partial<DiaryEntry>) => void
  onUndo: () => void
  onLogAgain: () => void
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
            <span className="quicklog-saved-when">You rated it {levelWord(saved.rating)}</span>
            <span className="quicklog-saved-sub">logged {savedTime}, with this air</span>
          </div>
          {canUndo && (
            <button type="button" className="quicklog-undo" onClick={onUndo}>
              undo
            </button>
          )}
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
        <div className="quicklog-actions">
          <button type="button" className="dismiss-button" onClick={onLogAgain}>
            Log again
          </button>
          <button type="button" className="dismiss-button" onClick={onDismiss}>
            Nothing to add
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className={`card quicklog${coldStart ? ' cold' : ''}`} key="asking">
      {coldStart ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="quicklog-question">How is your breathing?</span>
          <span className="quicklog-cold-sub">
            Easy days teach the most — they prove today&rsquo;s whole mix is fine for you.
          </span>
        </div>
      ) : (
        <div className="quicklog-ask-row">
          <span className="quicklog-question">How is your breathing?</span>
          <span className="quicklog-hint">one tap saves this air</span>
        </div>
      )}
      <RatingRow onLog={onLog} />
    </section>
  )
}

function RatingRow({ onLog }: { onLog: (rating: Rating) => void }) {
  return (
    <div className="quicklog-buttons">
      {RATINGS.map((r) => (
        <button
          key={r}
          type="button"
          className="quicklog-button"
          // The numeral and the word are two spans, and a screen reader running
          // them together reads "1 Easy" as one token. The name says the scale.
          aria-label={`${r} — ${BI_LABELS[r].label}`}
          onClick={() => onLog(r)}
        >
          <span className={`quicklog-digit d${r}`}>{r}</span>
          <span className="quicklog-word">{BI_LABELS[r].label}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * The quick log with the air missing. Rating and time are the half of an entry
 * that only exists at the moment it happens; the readings for that hour are
 * still there to be fetched afterwards.
 */
function OfflineLog({
  saved,
  onLog,
  onUndo,
}: {
  saved: DiaryEntry | null
  onLog: (rating: Rating) => void
  onUndo: () => void
}) {
  if (saved) {
    return (
      <section className="card quicklog" key="saved-offline">
        <div className="quicklog-saved-row">
          <LevelPill level={saved.rating} variant="inline" />
          <div className="quicklog-saved-text">
            <span className="quicklog-saved-when">You rated it {levelWord(saved.rating)}</span>
            <span className="quicklog-saved-sub">
              Saved — I&rsquo;ll attach the air readings when I&rsquo;m back online.
            </span>
          </div>
          <button type="button" className="quicklog-undo" onClick={onUndo}>
            undo
          </button>
        </div>
      </section>
    )
  }
  return (
    <section className="card quicklog" key="asking-offline">
      <div className="quicklog-ask-row">
        <span className="quicklog-question">How is your breathing?</span>
        <span className="quicklog-hint">the air catches up later</span>
      </div>
      <RatingRow onLog={onLog} />
    </section>
  )
}

/* --- forecast --- */

function ForecastBlock({
  prediction,
  coldStart,
  holdOut,
  banked,
}: {
  prediction: Prediction
  coldStart: boolean
  holdOut: boolean
  /** entries logged today against a model that can't use them yet */
  banked: number
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
      {/* Only where it is predicted. A 4 the user logged is their own report. */}
      {ceiling === 4 && <span className="rescue-note">{RESCUE_CLAUSE}</span>}
      {holdOut && (
        <span className="holdout-note">
          Your rating above isn&rsquo;t counted here — this is what your other days expect from air
          like this.
        </span>
      )}
      {banked > 0 && (
        <span className="banked-note">
          {banked} {banked === 1 ? 'entry' : 'entries'} banked · starts counting tomorrow
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
    <svg
      className="forecast-svg"
      viewBox="0 0 340 50"
      role="img"
      aria-label={
        coldStart
          ? `Forecast: up to ${ceiling}, ${levelWord(ceiling)}, on a 1 to 4 scale.`
          : floor === ceiling
            ? `Forecast: ${floor}, ${levelWord(floor)}, on a 1 to 4 scale.`
            : `Forecast: ${floor} to ${ceiling}, ${levelWord(floor)} to ${levelWord(ceiling)}, on a 1 to 4 scale.`
      }
    >
      <line x1={10} y1={28} x2={330} y2={28} stroke="var(--rule)" strokeWidth={1.5} />
      <line x1={10} y1={24} x2={10} y2={32} stroke="var(--rule)" strokeWidth={1.5} />
      <line x1={330} y1={24} x2={330} y2={32} stroke="var(--rule)" strokeWidth={1.5} />
      <path
        d={bracket}
        fill="none"
        stroke={coldStart ? 'var(--l2)' : 'var(--ink)'}
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
        fill={coldStart ? 'var(--secondary)' : 'var(--ink-2)'}
      >
        {coldStart ? 'at most' : 'likely'}
      </text>
      {coldStart ? (
        <circle
          cx={x(ceiling)}
          cy={28}
          r={5}
          fill="var(--paper)"
          stroke="var(--l2)"
          strokeWidth={1.5}
        />
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
              !within
                ? 'var(--l1)'
                : !coldStart && level === ceiling
                  ? 'var(--ink)'
                  : 'var(--secondary)'
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
  diaryCount,
  coldStart,
  nowCounting,
  estimated,
}: {
  prediction: Prediction
  model: TriggerModel
  /** the model diary: everything the forecast is allowed to use */
  diary: DiaryEntry[]
  /** the whole diary, held-out entries included */
  diaryCount: number
  coldStart: boolean
  /** entries released from the hold-out overnight, announced once */
  nowCounting: number
  /** today's estimated variables, so the sentence can admit to guessing */
  estimated: string[]
}) {
  if (coldStart) {
    return (
      <section className="section tight">
        <SectionRule label="Why" />
        <span className="why-text">
          {diary.length === 0 && diaryCount > 0 ? (
            <>
              Your first entries are from today, so they&rsquo;re held aside — today&rsquo;s rating
              can&rsquo;t grade itself. Tomorrow they start driving this forecast.
            </>
          ) : diaryCount > 0 ? (
            <>
              Every entry so far came with something else going on, so this ceiling still comes from
              population breakpoints for sensitive groups.
            </>
          ) : (
            <>
              No diary yet, so this ceiling comes from population breakpoints for sensitive groups.
              Every entry you log replaces a piece of it with <em>you</em>.
            </>
          )}
        </span>
      </section>
    )
  }
  const { main, aside } = evidence(prediction, model, diary, estimated)
  return (
    <section className="section tight">
      <SectionRule label="Why" />
      {nowCounting > 0 && (
        <span className="why-new">
          Now drawing on your {nowCounting} {nowCounting === 1 ? 'entry' : 'entries'}.
        </span>
      )}
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
  /**
   * A line under the row about the *reading* rather than in it: where the
   * number came from, or what the particulate looks like. Its own line
   * because the name row is already carrying a name, a unit and a verdict,
   * and neither of these is allowed to squeeze the number off a phone.
   * `claim` marks the one that asserts something — the smoke fingerprint;
   * the provenance caveats stay quiet.
   */
  note?: { text: string; claim?: boolean }
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

  const likelySmoke = smokeFingerprint(current.exposure)

  const rows: AirRow[] = []
  for (const key of ['pm25', 'o3', 'pm10', 'no2'] as const) {
    const [lo, hi] = range((h) => h.raw[key] ?? 0)
    const meta = VARIABLE_LABELS[key]!
    rows.push({
      key,
      name: meta.name,
      sub: meta.sub,
      ...(key === 'pm25' && likelySmoke
        ? { note: { text: 'likely smoke — nearly all of it fine-mode', claim: true } }
        : {}),
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

  // One pollen row whatever the source, never three: the dominant species
  // names itself in the sub-label, and a calendar figure says so on the note
  // line rather than passing for a reading — same line the fine-fraction
  // fingerprint uses, since both are the table talking about its own numbers,
  // and inline the two labels pushed the reading off a 390 px screen.
  // Absent on series cached before pollen shipped.
  const pollen = current.pollen
  if (pollen) {
    const species = pollen.variable
    const sub = species ? VARIABLE_LABELS[species]!.short : undefined
    // Same convention as the pollutant rows: the reading of this hour on the
    // track, the 8-hour window feature behind the evidence glyph.
    const [loP, hiP] = species ? range((h) => h.raw[species] ?? 0) : [0, 0]
    rows.push({
      key: 'pollen',
      name: 'Pollen',
      sub,
      ...(pollen.estimated ? { note: { text: CALENDAR_ESTIMATE } } : {}),
      value: Math.round(species ? (current.raw[species] ?? 0) : 0),
      unit: 'grains/m³',
      statusVar: species ?? 'grass_pollen',
      statusValue: species ? (current.exposure[species] ?? 0) : 0,
      lo: Math.round(loP),
      hi: Math.round(hiP),
      dot: species ? (current.raw[species] ?? 0) : 0,
      tol: species ? tolerance(species) : undefined,
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
      return { text: '◌ no evidence yet', cls: '' }
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
  // The glyph needs its legend from the first row the diary has a verdict on,
  // not only from the rows that also carry a tolerance tick.
  const showLegend = rows.some(
    (r) => r.tol !== undefined || statusChip(model, r.statusVar, r.statusValue).cls !== '',
  )
  return (
    <section className="section" style={{ gap: 4 }}>
      <SectionRule
        label="In the air"
        note={`${hour} · range = past 48 h${showLegend ? ' · ○ handled fine' : ''}`}
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
              {row.note && (
                <span className={`air-note${row.note.claim ? ' claim' : ''}`}>{row.note.text}</span>
              )}
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

  // The curve in words. A shape nobody can see is not a chart, and this one
  // carries the only "when" on the screen: read the runs out in order.
  const alt = `Ceiling by hour: ${runs
    .map((run, i) => {
      const next = runs[i + 1]
      const until = next ? ` until ${fmtHour(hourNum(hours[next.from]!.time), true)}` : ' after that'
      return `${i === 0 ? '' : 'then '}${run.level}, ${levelWord(run.level)}${until}`
    })
    .join(', ')}.`

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
        aria-label={alt}
      >
        {([1, 2, 3] as Rating[]).map((level) => (
          <line
            key={level}
            x1={0}
            y1={y(level)}
            x2={320}
            y2={y(level)}
            stroke="var(--track)"
            strokeWidth={1}
          />
        ))}
        {runs.slice(1).map((run, i) => (
          <path
            key={`v${i}`}
            d={`M${run.from * step},${y(runs[i]!.level)} V${y(run.level)}`}
            stroke="var(--rule)"
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

  const measured = report.observations.map((o) => bridgeableParameter(o.parameter))
  const particles = measured.some((v) => v === 'pm25' || v === 'pm10')
  const ozone = measured.includes('o3')

  return (
    <section className="section">
      <SectionRule
        label="Measured nearby"
        note={`${report.reportingArea}${report.time ? ` · ${report.time}` : ''}`}
        faint
      />
      {report.actionDay && <p className="action-day">⚠ Official air quality Action Day</p>}
      <div className="measured-row">
        {report.observations.map((o) => {
          const bridged = concentrationLabel(o.parameter, o.aqi)
          return (
            <span key={o.parameter} className={`measured-item${o.isPrimary ? ' primary' : ''}`}>
              {o.parameter} <strong>{o.aqi}</strong> {o.category}
              {bridged && <span className="measured-bridge">station {bridged}</span>}
            </span>
          )
        })}
      </div>
      <span className="settings-note">
        Station readings from AirNow, reported as AQI points; the µg/m³ beside each is that value
        read back through the EPA table, for comparison with the rows above.
      </span>
      {/* The two disagreements do not mean the same thing, so they do not share
          a caption. A station reading high on particles is a source the model
          could not see; ozone has no hyperlocal source, so a model running high
          against a monitor is just the model being wrong. */}
      {particles && (
        <span className="settings-note">
          Particles: disagreement usually means a local source, such as smoke, that the model
          missed.
        </span>
      )}
      {ozone && (
        <span className="settings-note">
          Ozone: when these disagree, trust the station.
        </span>
      )}
    </section>
  )
}
