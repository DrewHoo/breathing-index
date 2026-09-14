import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useId, useMemo, useState } from 'react'
import { PRIORS, negligibleFor } from '../engine/config'
import { buildModel, predict, variableStatus } from '../engine/infer'
import type { DiaryEntry, Prediction, Rating, TriggerModel } from '../engine/types'
import { airNowReport, fetchAirNow, type AirNowReport } from '../sources/airnow'
import { bridgeableParameter, concentrationFromAqi } from '../sources/aqi'
import { AIRNOW_SOURCE, POLLEN_TYPE_ORDER, type ExposureSeries } from '../sources/openMeteo'

const POLLEN_ROW_NAMES = { tree: 'Tree pollen', grass: 'Grass pollen', weed: 'Weed pollen' } as const
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
  COMFORTABLE,
  FORECAST_MEANING,
  NOT_GRADED,
  RESCUE_CLAUSE,
  VARIABLE_LABELS,
  type VariableLabel,
  levelWord,
} from '../ui/labels'
import { LocationNeededCard } from '../ui/locationUi'
import { backfillPending, settled } from '../ui/pendingExposure'
import { todaysSimilarEntries } from '../ui/recentEntry'
import { loadSettings } from '../ui/settings'
import { smokeFingerprint } from '../ui/smoke'
import { displayTemperature, useTemperatureUnit, type TemperatureUnit } from '../ui/units'
import { useExposureSeries } from '../ui/useExposureSeries'
import { VIRAL } from '../ui/viralTag'

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
          <Link to="/settings">Export your logs now.</Link>
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
      <MeasuredStrip
        lat={location.lat}
        lon={location.lon}
        source={data.source}
        utcOffsetSeconds={data.utcOffsetSeconds}
      />
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
  // An observation, not a confounder: exertion does not make the day
  // untrustworthy, it makes the dose bigger. Airway drying engages above
  // about 30 L/min of ventilation and nasal breathing nearly cancels it, so
  // the same dry air is a different exposure depending on what the user was
  // doing in it — which only the user knows. v1 writes it down and nothing
  // reads it (see engine/infer.ts).
  { label: 'exercising', kind: 'observation', value: 'exercising' },
  // The traffic mixture is invisible in every number this app fetches. Karner
  // 2010 pooled 41 studies of concentration against distance from a road:
  // PM2.5 *mass* shows essentially no gradient, while ultrafines, black
  // carbon, NO₂ and CO decay sharply within a few hundred metres. The Oxford
  // Street crossover is the clinical end of it — two hours walking a
  // traffic-heavy street dropped FEV₁ 6.1 % against the same walk in Hyde
  // Park, tracking ultrafines, which no public network measures anywhere. So
  // the PM2.5 row can be perfectly honest and still miss the exposure, and
  // dropping NO₂ (specs/24-vector-diet.md) costs nothing here: a 45 km CAMS
  // cell never saw the gradient either. This tag is the only handle v1 has on
  // it. Recorded and not read, like `exercising`; later it can gate a static
  // road-proximity feature per saved location.
  { label: 'near traffic', kind: 'observation', value: 'near-traffic' },
  // A third kind, and `sick` is the only chip in it (specs/26-sick-as-signal.md).
  // It used to be a confounder — the entry stayed in the diary and left
  // inference — and the research says that threw away the best days the diary
  // gets. A virus *alone* is null: Green 2002 put it at OR 1.67 with an
  // interval crossing 1. What multiplies is virus × sensitization × allergen
  // exposure, at OR 8.4 in Green's adults and 19.4 in Murray 2005's children.
  // So a sick day with oak up is the most informative day about allergen
  // triggers there is, and excluding it was the one rule guaranteeing the app
  // could never see the interaction.
  //
  // As an exposure key it costs the user nothing: same chip, same place, one
  // tap, and no onset date or decay window — the flag lands on the day it is
  // tapped and the engine handles the rest through the combo-repeat clause.
  { label: 'sick', kind: 'exposure', value: VIRAL },
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
      chip.kind === 'exposure'
        ? saved.exposure[chip.value] === 1
        : chip.kind === 'observation'
          ? (saved.observations ?? []).includes(chip.value)
          : (saved.confounders ?? []).includes(chip.value)
    const toggle = (chip: (typeof SAVED_CHIPS)[number]) => {
      // An exposure chip writes a variable, not a tag. Off deletes the key
      // rather than writing a 0: absent means "nobody said", and a 0 would be
      // a reading of something nobody measured.
      if (chip.kind === 'exposure') {
        const { [chip.value]: had, ...rest } = saved.exposure
        onAmend({ exposure: had === 1 ? rest : { ...saved.exposure, [chip.value]: 1 } })
        return
      }
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
              No logs yet, so this ceiling comes from population breakpoints for sensitive groups.
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
  /**
   * What the row says on its right-hand side. Either the variable and
   * exposure-space value the diary's verdict is computed from, or a chip the
   * row supplies itself in place of the one the evidence would have spoken.
   * Two rows speak for themselves: the dew point between its thresholds,
   * where there is no exposure for the diary to have a view on, and PM10,
   * which is shown and never graded (specs/24-vector-diet.md). A self-spoken
   * chip wears the unknown chip's styling, because that is what it is — and
   * the union is what keeps a row that has no variable from having to invent
   * one to be ignored.
   */
  status: { variable: string; value: number } | { chip: string }
  /**
   * The row's last 48 h in display units, oldest first, ending at now. An
   * hour the source never reported is null, not zero: a monitor that was down
   * from Tuesday lunchtime drew a flat floor across a third of the window and
   * pulled every other hour's shape flat with it.
   */
  series: (number | null)[]
  /** "your easy level" (highest handled fine) in display units — the waterline */
  tol?: number
  /** dry side of the dew-point row: past-easy is below the waterline */
  invert?: boolean
  /**
   * A line under the row about the *reading* rather than in it: where the
   * number came from, or what the particulate looks like. Its own line
   * because the name row is already carrying a name, a unit and a verdict,
   * and neither of these is allowed to squeeze the number off a phone.
   * `claim` marks the one that asserts something — the smoke fingerprint;
   * the provenance caveats stay quiet. `href` makes the note a link out to
   * the prerendered document that explains it (a plain anchor, not a route —
   * the target is served off disk like /privacy).
   */
  note?: { text: string; claim?: boolean; href?: string }
}

/**
 * The span each pollutant's number covers, for the row's sub-label. Every row
 * shows the feature the engine grades (specs/22-exposure-windows.md), and
 * "PM2.5 · 24-h" is a different claim from the reading at the top of the hour
 * — a screen that shows one and means the other is the gaslighting this app
 * exists to undo. PM10 keeps its entry after leaving the vector
 * (specs/24-vector-diet.md): ungraded is not the same as unaveraged, and the
 * row still owes the reader the span its number covers.
 */
const WINDOW_LABELS: Record<string, string> = { pm25: '24-h', pm10: '24-h', o3: '8-h' }

/** HMS's three analyst-drawn steps, indexed by the density the relay returns. */
const SMOKE_DENSITY_WORDS = ['', 'Light', 'Medium', 'Heavy']

/**
 * How old the plume behind the smoke row may be before the row says so. Three
 * hours is roughly the span of one HMS analysis, so anything past it is a
 * *previous* one — and overnight that is yesterday afternoon's, because the
 * satellites need daylight to see smoke at all.
 */
const SMOKE_AS_OF_HOURS = 3

/**
 * An instant as the hour it was at the *place* being shown, not in the reader's
 * own timezone: the rest of the table is on the location's local clock (the
 * hourly curve, the freshness line), and a saved place three timezones away
 * would otherwise carry an "as of" nobody there would recognise.
 */
const localHour = (iso: string, utcOffsetSeconds: number): string =>
  new Date(Date.parse(iso) + utcOffsetSeconds * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    timeZone: 'UTC',
  })

function buildAirRows(
  data: ExposureSeries,
  model: TriggerModel,
  tempUnit: TemperatureUnit,
): AirRow[] {
  const ci = data.currentIndex
  const window = data.hours.slice(Math.max(0, ci - 47), ci + 1)
  const current = data.hours[ci]!
  const tolerance = (variable: string): number | undefined => {
    const tol = model.tolerance[variable]?.[2]
    return tol !== undefined && tol > negligibleFor(variable) ? tol : undefined
  }

  // The hour's readings, not its window features: what the particulate is made
  // of is a question about the air outside right now, and a 24-hour mean would
  // both miss a plume that arrived at 3 pm and go on calling it smoke into
  // tomorrow.
  const likelySmoke = smokeFingerprint(current.raw)

  // The gated satellite density (specs/25-smoke-variable.md). When it is above
  // zero the table grows a Smoke row, and the PM2.5 row gives up its "likely
  // smoke" sub-label: one claim belongs in one place, and the row with a named
  // satellite behind it is the better place for it. Where HMS says nothing and
  // the fingerprint still fires — a plume too thin to draw, or a place the
  // analysis does not reach — the sub-label stays exactly as it was.
  const smokeDensity = current.exposure.smoke ?? 0

  // Composable, because these say different things and a row can need all of
  // them: what the pollutant is, what span its number covers, what the
  // particulate looks like, and which instrument saw it.
  const subLabel = (key: string, meta: VariableLabel): string =>
    [
      meta.sub,
      WINDOW_LABELS[key],
      key === 'pm25' && likelySmoke && smokeDensity === 0 ? 'likely smoke' : null,
      data.siteNames?.[key] ? `${data.siteNames[key]} monitor` : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · ')

  const rows: AirRow[] = []
  for (const key of ['pm25', 'o3'] as const) {
    // The number on the row is the window feature, the same quantity the
    // verdict beside it is spoken about (specs/22-exposure-windows.md). It
    // used to be the hour's own reading while the chip graded the window, so
    // a row could say 30 and "past your easy" about a threshold of 40.
    //
    // A pollutant this series has no feature for gets no row at all — a row
    // reading "0 µg/m³" would be a measurement nobody made. The hour's own
    // reading going missing is not that case and no longer costs the row:
    // AirNow publishes the NowCast before the raw hourly, so the current hour
    // is routinely blank while the trailing window is full.
    const reading = current.exposure[key]
    if (reading === undefined) continue
    const meta = VARIABLE_LABELS[key]!
    const sub = subLabel(key, meta)
    rows.push({
      key,
      name: meta.name,
      ...(sub ? { sub } : {}),
      value: Math.round(reading),
      unit: meta.unit ?? '',
      status: { variable: key, value: reading },
      series: window.map((h) => h.raw[key] ?? null),
      tol: tolerance(key),
    })
  }

  // PM10 keeps the row and loses the verdict (specs/24-vector-diet.md). Coarse
  // particulate is worth seeing — it is what a dust day is made of, and it is
  // the denominator of the smoke fingerprint on the PM2.5 row above — but it
  // is PM2.5 plus the coarse fraction, so it walked into every candidate set
  // alongside PM2.5 and no clean day could ever tell them apart. So: the same
  // 24-hour mean, read from `display` instead of `exposure`, no waterline, no
  // tolerance lookup, and a chip that says out loud that nothing here is being
  // graded. A series cached before the diet has no `display` block and simply
  // draws no row, the same rule every other row follows about a missing
  // number.
  const pm10 = current.display?.pm10
  if (pm10 !== undefined) {
    const meta = VARIABLE_LABELS.pm10!
    const sub = subLabel('pm10', meta)
    rows.push({
      key: 'pm10',
      name: meta.name,
      ...(sub ? { sub } : {}),
      value: Math.round(pm10),
      unit: meta.unit,
      status: { chip: NOT_GRADED },
      series: window.map((h) => h.raw.pm10 ?? null),
    })
  }

  // Smoke, after the pollutants it is cut from and before the pollen
  // (specs/25-smoke-variable.md). The row exists only when two instruments
  // agree — HMS drew a plume over this cell *and* the particulate underneath
  // it is fine-mode — so a zero never draws one: "no plume" is not a reading
  // worth a row, it is the ordinary state of the sky.
  //
  // The number is the density itself, 1–3, because that is the whole scale the
  // source publishes; the sub-label spends the words the number cannot on what
  // Light means and who says so. "as of" appears only when the plume behind it
  // has aged past three hours, which is most of every night: smoke detection
  // needs daylight, so after dark the newest analysis is the afternoon's and a
  // row that did not say so would be quietly claiming a live reading.
  if (smokeDensity > 0) {
    const meta = VARIABLE_LABELS.smoke!
    const asOf = data.smokeAsOf
    const aged = asOf !== undefined && Date.now() - Date.parse(asOf) > SMOKE_AS_OF_HOURS * 3_600_000
    rows.push({
      key: 'smoke',
      name: meta.name,
      sub: [
        SMOKE_DENSITY_WORDS[smokeDensity],
        'satellite',
        aged ? `as of ${localHour(asOf!, data.utcOffsetSeconds)}` : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' · '),
      value: smokeDensity,
      unit: meta.unit,
      status: { variable: 'smoke', value: smokeDensity },
      // The ungated density, so the curve draws the plume overhead rather than
      // the hours the PM columns happened to have posted by.
      series: window.map((h) => h.raw.hms_density ?? null),
      tol: tolerance('smoke'),
    })
  }

  // Three pollen rows, display at type level, evidence at plant level
  // (specs/18-measured-pollen.md): the headline is the source's type index,
  // the sub-label carries every plant reading the engine reasons about
  // ("birch 4 · oak 2") so any number an evidence line cites is on the
  // screen, and the row's verdict tracks its highest plant. A type with no
  // reporting plant has no row — out of season is not a reading, and three
  // zeros all winter is noise. The 0–5 index is the table's one deliberate
  // exception to the real-units rule; pollen has no unit a user could check.
  for (const type of POLLEN_TYPE_ORDER) {
    const display = current.pollenDisplay?.[type]
    const top = display?.plants[0]
    if (!display || !top) continue
    rows.push({
      key: `pollen_${type}`,
      name: POLLEN_ROW_NAMES[type],
      // Grass alone names a window, because grass alone has one: its number is
      // the highest of the trailing three days (specs/22-exposure-windows.md),
      // computed in feature extraction, so the headline, the sub-label and the
      // verdict are already the same quantity by the time the row is built.
      sub: [
        display.plants.map((p) => `${p.name.toLowerCase()} ${p.value}`).join(' · '),
        type === 'grass' ? '3-day' : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' · '),
      ...(current.estimated?.includes(top.variable)
        ? { note: { text: CALENDAR_ESTIMATE, href: '/pollen/calendar' } }
        : {}),
      value: display.value,
      unit: 'of 5',
      status: { variable: top.variable, value: current.exposure[top.variable] ?? top.value },
      series: window.map((h) => h.pollenDisplay?.[type]?.value ?? 0),
      tol: tolerance(top.variable),
    })
  }

  // One dew-point row backed by the two one-sided features, which are the
  // same curve folded at 11 °C and 18 °C (specs/23-dew-point-air.md). The
  // number is the dew point itself rather than either feature: a hinge
  // sparkline would drop to zero every time the air passed through
  // comfortable, and "6°" says nothing a person can stand outside and check.
  // The name follows whichever side is active, and on the dry side "past your
  // easy" is downward — drier is worse — so the waterline flips and the fill
  // hangs below it, exactly as the cold side used to.
  //
  // An hour with no dew point gets no row, the same rule the pollutants
  // follow: a series cached by an earlier version has no `dewpoint` in its
  // raw block, and a row reading 0° would be a reading nobody took.
  const dewpoint = current.raw.dewpoint
  if (dewpoint !== undefined) {
    const disp = (c: number): number => Math.round(displayTemperature(c, tempUnit))
    const dryAir = current.exposure.dry_air ?? 0
    const humidHeat = current.exposure.humid_heat ?? 0
    const drySide = dryAir > 0
    // Neither side active is its own honest state: the air is between the two
    // thresholds, so the row names a measurement rather than a stress, and it
    // draws no waterline — an easy level belongs to one side of the fold, and
    // hanging the humid side's line over a 14 °C dew point would answer a
    // question nobody asked.
    const side = drySide ? 'dry_air' : humidHeat > 0 ? 'humid_heat' : null
    const tolFeature = side ? tolerance(side) : undefined
    rows.push({
      key: 'dewpoint',
      name: side === 'dry_air' ? 'Dry air' : side === 'humid_heat' ? 'Humid heat' : 'Dew point',
      // The sub-label says what the number is; on the neutral day the name
      // already does, and "Dew point · dew point" reads as a stutter.
      ...(side ? { sub: 'dew point' } : {}),
      value: disp(dewpoint),
      unit: `°${tempUnit}`,
      status: side
        ? { variable: side, value: current.exposure[side] ?? 0 }
        : { chip: COMFORTABLE },
      series: window.map((h) => (h.raw.dewpoint === undefined ? null : disp(h.raw.dewpoint))),
      // The waterline is a dew point too, so an easy level learned in feature
      // space comes back through the same fold it went out by.
      tol: tolFeature !== undefined ? disp(drySide ? 11 - tolFeature : 18 + tolFeature) : undefined,
      invert: drySide,
    })
  }
  return rows
}

/**
 * The row's verdict, spoken against the waterline. Suspicion outranks the
 * easy level — a bad day logged below it is the sharper fact — and a
 * confirmed trigger reads as past-your-easy even before an easy day has
 * drawn the line.
 */
function statusChip(
  model: TriggerModel,
  variable: string,
  value: number,
): { text: string; cls: string } {
  if (value <= negligibleFor(variable)) return { text: 'barely present', cls: '' }
  const tol = model.tolerance[variable]?.[2]
  const pastEasy = tol !== undefined && tol > negligibleFor(variable) && value > tol
  switch (variableStatus(model, PRIORS, variable, value)) {
    case 'confirmed':
      return { text: 'past your easy', cls: 'past' }
    case 'suspected':
      return pastEasy
        ? { text: 'past your easy', cls: 'past' }
        : { text: 'maybe a trigger', cls: 'suspect' }
    case 'tolerated':
      return { text: 'handled higher fine', cls: 'fine' }
    default:
      return pastEasy ? { text: 'past your easy', cls: 'past' } : { text: 'no logs yet', cls: '' }
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
  // The dash needs its legend only once a row actually draws a waterline.
  const showWaterline = rows.some((r) => r.tol !== undefined)
  return (
    <section className="section" style={{ gap: 4 }}>
      <SectionRule
        label="In the air"
        note={
          <>
            last 48 h → now
            {showWaterline && (
              <>
                {' · '}
                <span className="rule-dash" /> your easy level
              </>
            )}
          </>
        }
        faint
      />
      <div className="air-table">
        {rows.map((row) => {
          const status =
            'chip' in row.status
              ? { text: row.status.chip, cls: '' }
              : statusChip(model, row.status.variable, row.status.value)
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
              {row.note &&
                (row.note.href ? (
                  <a className={`air-note${row.note.claim ? ' claim' : ''}`} href={row.note.href}>
                    {row.note.text}
                  </a>
                ) : (
                  <span className={`air-note${row.note.claim ? ' claim' : ''}`}>
                    {row.note.text}
                  </span>
                ))}
              <AirSpark series={row.series} tol={row.tol} invert={row.invert} name={row.name} />
              <div className="air-ticks" aria-hidden="true">
                <span>−48 h</span>
                <span>−24 h</span>
                <span>now</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/**
 * The row's last 48 hours against the personal waterline. The line is the
 * air; ink appears only between the line and the dashed easy level, so a
 * calm window is a bare line and the table's total ink literally equals
 * hours past this person. A row with no easy day logged yet has no
 * waterline to be past.
 */
function AirSpark({
  series,
  tol,
  invert,
  name,
}: {
  series: (number | null)[]
  /** "your easy level" in the row's display units */
  tol?: number
  /** dry side of the dew-point row: past-easy is below the waterline */
  invert?: boolean
  name: string
}) {
  const clip = useId()
  const readings = series.filter((v): v is number => v !== null)
  if (readings.length < 2) return null
  // Plot in x 2..300; the right gutter holds the waterline's ring + value.
  const X0 = 2
  const X1 = 300
  const Y0 = 5
  const Y1 = 35
  const values = tol === undefined ? readings : [...readings, tol]
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  if (hi - lo < 1e-9) {
    lo -= 1
    hi += 1
  }
  const x = (i: number): number => X0 + (i * (X1 - X0)) / (series.length - 1)
  const y = (v: number): number => Y1 - ((v - lo) / (hi - lo)) * (Y1 - Y0)
  // One sub-path per unbroken run of hours. The line simply stops where a
  // monitor did, which is the truth; joining across the gap would draw a
  // reading nobody took, and dropping to the floor would invent a clean hour.
  const runs: { x: number; y: number }[][] = []
  let run: { x: number; y: number }[] = []
  series.forEach((v, i) => {
    if (v === null) {
      if (run.length > 0) runs.push(run)
      run = []
    } else {
      run.push({ x: x(i), y: y(v) })
    }
  })
  if (run.length > 0) runs.push(run)
  const trace = (points: { x: number; y: number }[]): string =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const line = runs.map(trace).join(' ')
  const past = tol !== undefined && readings.some((v) => (invert ? v < tol : v > tol))
  const yTol = tol !== undefined ? y(tol) : 0
  return (
    <svg
      className="air-spark"
      viewBox="0 0 340 40"
      role="img"
      aria-label={
        tol === undefined
          ? `${name}, past 48 hours.`
          : `${name}, past 48 hours; dashes mark your easy level, ${Math.round(tol)}.${
              past ? ' The air was past it during this window.' : ''
            }`
      }
    >
      {past && (
        <>
          <clipPath id={clip}>
            {invert ? (
              <rect x={0} y={yTol} width={340} height={40 - yTol} />
            ) : (
              <rect x={0} y={0} width={340} height={yTol} />
            )}
          </clipPath>
          <path
            d={runs
              .map((points) => `${trace(points)} V${invert ? 0 : 40} H${points[0]!.x.toFixed(1)} Z`)
              .join(' ')}
            fill="var(--l3)"
            clipPath={`url(#${clip})`}
          />
        </>
      )}
      {tol !== undefined && (
        <>
          <line
            x1={X0}
            y1={yTol}
            x2={X1}
            y2={yTol}
            stroke="var(--l2)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <circle
            cx={X1 + 8}
            cy={yTol}
            r={3.5}
            fill="var(--paper)"
            stroke="var(--secondary)"
            strokeWidth={1.5}
          />
          <text
            x={X1 + 16}
            y={yTol + 3.5}
            fontFamily="Spline Sans Mono, monospace"
            fontSize={10}
            fontWeight={600}
            fill="var(--ink-2)"
          >
            {Math.round(tol)}
          </text>
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke="var(--secondary)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(series.length - 1)} cy={y(series[series.length - 1]!)} r={4} fill="var(--ink)" />
    </svg>
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

function MeasuredStrip({
  lat,
  lon,
  source,
  utcOffsetSeconds,
}: {
  lat: number
  lon: number
  /** the source the rows above run on — what this strip is allowed to repeat */
  source: string
  utcOffsetSeconds: number
}) {
  const [report, setReport] = useState<AirNowReport | null>(null)
  const enabled = useMemo(() => loadSettings().airnowEnabled, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchAirNow(lat, lon)
      .then((observations) => {
        if (!cancelled) setReport(observations ? airNowReport(observations) : null)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [enabled, lat, lon])

  if (!enabled || !report) return null

  // When the rows above already run on these monitors, every chip here would
  // be the same measurement twice, in the population's unit system instead of
  // the screen's, and the site name is on each row (specs/21-airnow-migration
  // .md §6). One thing is left that no row can carry: the Action Day, which is
  // a declaration by an agency rather than a reading. Without one there is
  // nothing to say, so the section does not appear at all.
  if (source === AIRNOW_SOURCE) {
    if (!report.actionDay) return null
    return (
      <section className="section">
        <SectionRule label="Measured nearby" note={report.reportingArea} faint />
        <p className="action-day">⚠ Official air quality Action Day</p>
      </section>
    )
  }

  // AirNow's hours are UTC; the rest of the screen is local to the location.
  const hour = report.time
    ? fmtHour(new Date(Date.parse(`${report.time}:00Z`) + utcOffsetSeconds * 1000).getUTCHours(), false)
    : ''

  // AQI points are population vocabulary, and this screen speaks µg/m³. Two
  // numbers both labelled "Ozone" in different unit systems read as a 2×
  // disagreement when the air actually agrees, so a chip only appears when the
  // EPA table can walk its points back to a concentration; anything it cannot
  // (rare gases, off-table values) stays off the screen rather than showing a
  // number the rows above cannot answer. The points themselves live on only in
  // the diary scoreboard, the one screen official indices are for.
  const chips = report.observations.flatMap((o) => {
    const value = concentrationFromAqi(o.parameter, o.aqi)
    return value === null ? [] : [{ ...o, value, variable: bridgeableParameter(o.parameter)! }]
  })
  if (chips.length === 0 && !report.actionDay) return null

  const particles = chips.some((c) => c.variable === 'pm25' || c.variable === 'pm10')
  const ozone = chips.some((c) => c.variable === 'o3')

  return (
    <section className="section">
      <SectionRule
        label="Measured nearby"
        note={`${report.reportingArea}${hour ? ` · ${hour}` : ''}`}
        faint
      />
      {report.actionDay && <p className="action-day">⚠ Official air quality Action Day</p>}
      <div className="measured-row">
        {chips.map((c) => (
          <span key={c.parameter} className={`measured-item${c.isPrimary ? ' primary' : ''}`}>
            {c.parameter} <strong>≈ {Math.round(c.value)}</strong> µg/m³
          </span>
        ))}
      </div>
      {chips.length > 0 && (
        <span className="settings-note">
          Nearby monitor readings from AirNow, in the same µg/m³ as the rows above. Stations
          report averages — 24 h for particles, 8 h for ozone — so a chip can lag a sharp change.
        </span>
      )}
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
