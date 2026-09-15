import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { GlossaryKey } from '../content/glossary'
import { PRIORS, negligibleFor } from '../engine/config'
import { buildModel, predict, variableStatus } from '../engine/infer'
import type { DiaryEntry, Prediction, Rating, TriggerModel } from '../engine/types'
import { airNowReport, fetchAirNow, inAirNowCoverage, type AirNowReport } from '../sources/airnow'
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
import { ESTIMATE_ASIDE, evidence } from '../ui/evidence'
import { exposureAgeMinutes, isEstimatedAge, isStale } from '../ui/freshness'
import { useGlossaryHelp, useGoodHelp, type GoodReference } from '../ui/help'
import {
  BI_LABELS,
  CALENDAR_ESTIMATE,
  COMFORTABLE,
  DRY_SPORE_ESTIMATE,
  EPA_GOOD_CEILING,
  FORECAST_MEANING,
  MODEL_OZONE_BIAS,
  MOLD_ESTIMATE,
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

  // The hour on screen is the payload's own newest hour, never the clock: the
  // service worker can hand back a six-hour-old response that parses as new.
  const dataHour = fmtHour(hourNum(current.time), true)
  const showStale = stale || isStale(data)
  // The diary's "+ Log now" (`?log=true`) reopens the ask over an existing
  // answer; a fresh tap closes it. The home screen itself no longer offers a
  // second tap — one answer a visit is the whole idea of the card.
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
        model={model}
        diary={modelDiary}
        diaryCount={diary.length}
        nowCounting={released && !coldStart && modelDiary.length > 0 ? modelDiary.length : 0}
        estimated={current.estimated ?? []}
      />
      <AirTable
        data={data}
        model={model}
        tempUnit={tempUnit}
        lat={location.lat}
        lon={location.lon}
      />
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
  onDismiss,
}: {
  coldStart: boolean
  saved: DiaryEntry | null
  /** the echoed entry was saved in this session, so taking it back is fair */
  canUndo: boolean
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
      <section className="quicklog" key="saved">
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
          <button type="button" className="dismiss-button" onClick={onDismiss}>
            Nothing to add
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="quicklog" key="asking">
      {coldStart ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="quicklog-question">How is your breathing?</span>
          <span className="quicklog-cold-sub">
            Easy days teach the most — they prove today&rsquo;s whole mix is fine for you.
          </span>
        </div>
      ) : (
        <span className="quicklog-question">How is your breathing?</span>
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
      <section className="quicklog" key="saved-offline">
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
    <section className="quicklog" key="asking-offline">
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
  model,
  diary,
  diaryCount,
  nowCounting,
  estimated,
}: {
  prediction: Prediction
  coldStart: boolean
  holdOut: boolean
  /** entries logged today against a model that can't use them yet */
  banked: number
  model: TriggerModel
  /** the model diary: everything the forecast is allowed to use */
  diary: DiaryEntry[]
  /** the whole diary, held-out entries included */
  diaryCount: number
  /** entries released from the hold-out overnight, announced once */
  nowCounting: number
  /** today's estimated variables, so the sentence can admit to guessing */
  estimated: string[]
}) {
  const { floor, ceiling } = prediction
  const headline = coldStart
    ? `Up to ${levelWord(ceiling)} is possible.`
    : floor === ceiling
      ? `${BI_LABELS[ceiling].label}.`
      : `${BI_LABELS[floor].label}, maybe ${levelWord(ceiling)}.`
  const meaning = coldStart
    ? 'Averages for sensitive lungs — not you, yet.'
    : FORECAST_MEANING[ceiling]
  const { main, aside } = forecastReason(prediction, model, diary, diaryCount, coldStart, estimated)
  return (
    <section className="section">
      <SectionRule label="Forecast" note={coldStart ? 'unpersonalized' : undefined} />
      <div className="forecast-headline">{headline}</div>
      <ForecastScale floor={floor} ceiling={ceiling} coldStart={coldStart} />
      {/* What it means and why, one paragraph: the reason is part of the
          forecast, not a section beside it, and a label of its own made it
          read as a peer of "Forecast" rather than the forecast's own footing. */}
      <p className="forecast-meaning">
        {meaning} {main}
      </p>
      {aside && <span className="forecast-aside">{aside}</span>}
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
      {nowCounting > 0 && (
        <span className="why-new">
          Now drawing on your {nowCounting} {nowCounting === 1 ? 'entry' : 'entries'}.
        </span>
      )}
    </section>
  )
}

/**
 * The forecast's footing, in the diary's voice. Before the diary can speak
 * the sentence says where the ceiling comes from instead; after, it is the
 * evidence line. The calendar caveat is the one aside left out: the pollen
 * row under this block carries it as its own note, and the same sentence
 * twice on one screen is what made the block hard to scan.
 */
function forecastReason(
  prediction: Prediction,
  model: TriggerModel,
  diary: DiaryEntry[],
  diaryCount: number,
  coldStart: boolean,
  estimated: string[],
): { main: ReactNode; aside?: string } {
  if (coldStart) {
    if (diary.length === 0 && diaryCount > 0) {
      return {
        main: (
          <>
            Your first entries are from today, so they&rsquo;re held aside — today&rsquo;s rating
            can&rsquo;t grade itself. Tomorrow they start driving this forecast.
          </>
        ),
      }
    }
    if (diaryCount > 0) {
      return {
        main: (
          <>
            Every entry so far came with something else going on, so this ceiling still comes from
            population breakpoints for sensitive groups.
          </>
        ),
      }
    }
    return {
      main: (
        <>
          No logs yet, so this ceiling comes from population breakpoints for sensitive groups. Every
          entry you log replaces a piece of it with <em>you</em>.
        </>
      ),
    }
  }
  const { main, aside } = evidence(prediction, model, diary, estimated)
  return aside === undefined || aside === ESTIMATE_ASIDE ? { main } : { main, aside }
}

/**
 * The forecast on the scale the reader just tapped: the four numerals sit on
 * the same four columns as the log buttons above, each in its level ink, and
 * a bracket under the likely span. No fill, because a filled bar reads as an
 * amount and this is a range. Cold start draws the bracket dashed from 1 to
 * the ceiling and lights only the ceiling, which is all the averages claim.
 */
function ForecastScale({
  floor,
  ceiling,
  coldStart,
}: {
  floor: Rating
  ceiling: Rating
  coldStart: boolean
}) {
  const lo: Rating = coldStart ? 1 : floor
  return (
    <div
      className="forecast-scale"
      role="img"
      aria-label={
        coldStart
          ? `Forecast: up to ${ceiling}, ${levelWord(ceiling)}, on a 1 to 4 scale.`
          : floor === ceiling
            ? `Forecast: ${floor}, ${levelWord(floor)}, on a 1 to 4 scale.`
            : `Forecast: ${floor} to ${ceiling}, ${levelWord(floor)} to ${levelWord(ceiling)}, on a 1 to 4 scale.`
      }
    >
      <div className="scale-numerals">
        {RATINGS.map((level) => {
          const within = level >= lo && level <= ceiling
          const emphasized = coldStart ? level === ceiling : within
          return (
            <span
              key={level}
              className={`scale-numeral${emphasized ? ' on' : ''}`}
              style={emphasized ? { color: LEVEL_INK[level] } : undefined}
            >
              {level}
            </span>
          )
        })}
      </div>
      <div className="scale-bracket-row">
        <span
          className={`scale-bracket${coldStart ? ' cold' : ''}`}
          style={{ gridColumn: `${lo} / ${ceiling + 1}` }}
        />
      </div>
    </div>
  )
}

/* --- in the air --- */

interface AirRow {
  key: string
  name: string
  /**
   * The glossary entry the row's `?` opens (specs/30-glossary.md). Set on the
   * row rather than looked up from the key, because two rows are not one
   * variable: the dew-point row is drawn from `dry_air` and `humid_heat`
   * folded together, and the pollen rows are drawn at type level over
   * per-plant variables.
   */
  help: GlossaryKey
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
  /**
   * Parallel to `series`: true where the hour's number is the last reading
   * copied forward rather than one taken that day (`Hour.carried`). The
   * sparkline draws those hours dotted and ends in an open circle — "I don't
   * know what it is yet" — instead of a solid line that claims a count nobody
   * took. Only the mold row sets it today.
   */
  carried?: boolean[]
  /** "your easy level" (highest handled fine) in display units — the waterline */
  tol?: number
  /**
   * The instrument behind the number ("New Haven monitor", "model"), kept
   * apart from `sub` so the table can name it once at the top when every row
   * shares it and per row when they do not (specs/27-one-ozone.md).
   */
  source?: string
  /**
   * Where the sparkline's axis starts. Concentrations and counts start at
   * zero, so a row's headroom under its reference line is a visible gap and
   * a barely-present row draws flat instead of filling the plot; the dew
   * point row, a temperature, has no zero worth drawing and leaves it unset.
   */
  floor?: number
  /**
   * Where the axis must reach even when nothing does: the top of an index
   * ("4 of 5" belongs four-fifths of the way up, not at the top). Unset for
   * a concentration, which has no ceiling of its own.
   */
  ceiling?: number
  /**
   * The top of the EPA's "Good" band, for a row whose diary has no easy level
   * yet to draw instead. `span` spells out the window for the sheet the `?`
   * opens ("24 hours").
   */
  guide?: { value: number; span: string }
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
const WINDOW_LABELS: Record<string, string> = {
  pm25: '24-h',
  pm10: '24-h',
  pm_coarse: '24-h',
  o3: '8-h',
  // SO₂ has no window — the number is the hour (specs/29-sulfur-dioxide.md) —
  // and it says "1-h" anyway, because that is the span the reading covers and
  // a row that named a span for every neighbour and not for itself would read
  // as an oversight rather than as a claim.
  so2: '1-h',
}

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

/**
 * A mold reading's date as "Sep 11". Pinned to noon UTC before formatting,
 * because the string is the *station's* local day and has no time in it — fed
 * to `Date` as a bare date it would be parsed as midnight UTC and slide to the
 * 10th for every reader west of Greenwich.
 */
const readingDay = (date: string): string =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

/**
 * Where "eastern US" starts for the model-ozone note: the 100th meridian. The
 * documented CAMS warm-season ozone bias is an eastern-US finding (the 2026-08-07
 * Hamden case), and a note that says "eastern US" should not fire in Honolulu.
 */
const EASTERN_US_LON = -100

function buildAirRows(
  data: ExposureSeries,
  model: TriggerModel,
  tempUnit: TemperatureUnit,
  /**
   * Where the air is. Nothing on a row is computed from it — it answers the
   * one question a reading cannot, which is whether the *region* is one a
   * known model bias applies to (specs/27-one-ozone.md).
   */
  lat: number,
  lon: number,
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
  //
  // The instrument is named either way, never left blank (specs/27-one-ozone
  // .md). Naming only the monitor made "model" the unmarked case, and the
  // confusion this spec exists to end was two numbers both labelled ozone with
  // neither labelled by source — an unnamed number reads as *the* number. So a
  // row whose figure a station produced says which station, and a row whose
  // figure the model produced says "model". Per key rather than per series
  // because that is the true statement: on a station series every row shown
  // has a monitor behind it, so the two rules never disagree, and if one ever
  // did the row would still be telling the truth about itself.
  const subLabel = (key: string, meta: VariableLabel): string =>
    [
      meta.sub,
      WINDOW_LABELS[key],
      key === 'pm25' && likelySmoke && smokeDensity === 0 ? 'likely smoke' : null,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · ')
  // The instrument, on the row rather than in its sub-label: the table names
  // it once for everyone when every row agrees, and per row when they don't.
  const sourceOf = (key: string): string =>
    data.siteNames?.[key] ? `${data.siteNames[key]} monitor` : 'model'
  // The EPA's Good ceiling, for the reference line a row draws before the
  // diary has graded it. Only the pollutants the EPA publishes a band for.
  const guideFor = (key: string): AirRow['guide'] => {
    const value = EPA_GOOD_CEILING[key]
    const window = WINDOW_LABELS[key]
    if (value === undefined || window === undefined) return undefined
    const hours = Number.parseInt(window, 10)
    return { value, span: `${hours} ${hours === 1 ? 'hour' : 'hours'}` }
  }

  // The one caveat on this screen that is about a region rather than a
  // reading, so it is gated on both: the number has to have come from the
  // model, and the place has to be inside the coverage the bias was measured
  // in. It rides the ozone row alone — CAMS's particulate has no equivalent
  // known lean, and a caveat repeated under every row would stop being read.
  const modelOzoneInUs = data.source !== AIRNOW_SOURCE && inAirNowCoverage(lat, lon) && lon > EASTERN_US_LON

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
      help: key,
      ...(sub ? { sub } : {}),
      // Quiet, not a claim: the row is still the best number available for
      // this place, and the note says which way to discount it rather than
      // telling anyone to disbelieve their own screen.
      ...(key === 'o3' && modelOzoneInUs ? { note: { text: MODEL_OZONE_BIAS } } : {}),
      value: Math.round(reading),
      unit: meta.unit ?? '',
      status: { variable: key, value: reading },
      series: window.map((h) => h.raw[key] ?? null),
      tol: tolerance(key),
      source: sourceOf(key),
      floor: 0,
      guide: guideFor(key),
    })
  }

  // SO₂, after the two pollutants that are always on the screen and before the
  // one that is never graded (specs/29-sulfur-dioxide.md). The row appears
  // only above the floor, on the smoke rule and for the smoke reason: the
  // variable sits at 0.2–2.7 µg/m³ in Connecticut against a floor of 20, so a
  // standing "1 µg/m³ · barely present" row on every screen for years would
  // teach people to skip past the one row that matters on the day it means
  // something. What the table owes the reader instead is a line saying the app
  // did look — which is what `AbsentNames` below is for.
  //
  // Absent is a third state and not this one: an airnow series whose monitors
  // do not report SO₂ has no number at all, and that line says so separately.
  const so2 = current.exposure.so2
  if (so2 !== undefined && so2 > negligibleFor('so2')) {
    const meta = VARIABLE_LABELS.so2!
    const sub = subLabel('so2', meta)
    rows.push({
      key: 'so2',
      name: meta.name,
      help: 'so2',
      ...(sub ? { sub } : {}),
      value: Math.round(so2),
      unit: meta.unit,
      status: { variable: 'so2', value: so2 },
      series: window.map((h) => h.raw.so2 ?? null),
      tol: tolerance('so2'),
      source: sourceOf('so2'),
      floor: 0,
      guide: guideFor('so2'),
    })
  }

  // Coarse particles keep a row and carry no verdict (specs/24-vector-diet.md).
  // The number is the coarse fraction, PM10 − PM2.5, so the row is what its
  // name says rather than the fine particles above it counted a second time;
  // raw PM10 still rides along as the denominator of the smoke fingerprint.
  // Coarse mass is worth seeing — it is what a dust day and a gritty day are
  // made of — and it is not graded: the acute-asthma evidence for it is thin
  // and dust gets a variable of its own (specs/32-dust.md). So: the same
  // 24-hour mean, read from `display` instead of `exposure`, no waterline, no
  // tolerance lookup, and a chip that says out loud that nothing here is being
  // graded. The sub-label is keyed `pm10` because the monitor that measured
  // the total is the one to name. A series cached before this has no
  // `pm_coarse` in `display` and simply draws no row, the same rule every
  // other row follows about a missing number.
  const pmCoarse = current.display?.pm_coarse
  if (pmCoarse !== undefined) {
    const meta = VARIABLE_LABELS.pm_coarse!
    const sub = subLabel('pm10', meta)
    rows.push({
      key: 'pm_coarse',
      name: meta.name,
      help: 'pm_coarse',
      ...(sub ? { sub } : {}),
      value: Math.round(pmCoarse),
      unit: meta.unit,
      status: { chip: NOT_GRADED },
      series: window.map((h) => h.raw.pm_coarse ?? null),
      source: sourceOf('pm10'),
      floor: 0,
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
      help: 'smoke',
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
      floor: 0,
      ceiling: 3,
      tol: tolerance('smoke'),
    })
  }

  // Mold, after the smoke it is nothing like and before the pollen it is
  // usually confused with (specs/28-mold.md). Two rows, and they are two
  // different claims: a count somebody made with a microscope 50 miles away,
  // and a weather pattern that would put dry-weather spores in the air if
  // there were any. Both can be on the screen at once, and should be — the
  // engine grades both, and an evidence line may only cite a number the reader
  // can see.
  //
  // The note carries the station and the day it counted, because those are
  // what make the number checkable: a spore count is an integration over one
  // day at one building, and "5,116" with neither of those on it is exactly
  // the unsourced number this app exists to stop printing. When the count has
  // aged past three days the note says "estimate" as well, which is the same
  // word the vector is carrying (`estimated`) rather than a second opinion
  // about it.
  const moldReading = current.exposure.mold
  if (moldReading !== undefined && data.mold) {
    const meta = VARIABLE_LABELS.mold!
    // The genus numbers the engine actually grades, not the station's whole
    // list: Cladosporium first because it is the larger of the two by an order
    // of magnitude nearly everywhere, so it reads as the headline of the split.
    const split = (['mold_cladosporium', 'mold_alternaria'] as const)
      .filter((variable) => current.exposure[variable] !== undefined)
      .map((variable) => `${VARIABLE_LABELS[variable]!.short} ${Math.round(current.exposure[variable]!)}`)
    // A station with no split has its own band word to spend instead. It is
    // the publisher's, verbatim and lowercased to sit in a sub-label — never
    // this app's reading of the number beside it.
    const band = data.mold.category?.toLowerCase()
    const sub = [...(split.length > 0 ? split : band ? [band] : []), '3-day'].join(' · ')
    rows.push({
      key: 'mold',
      name: meta.name,
      help: 'mold',
      sub,
      value: Math.round(moldReading),
      // St. Louis prints a number and never names its unit, so the row says
      // "count" rather than inventing a per-cubic-metre it was not given.
      unit: data.mold.units === 'count' ? 'count' : meta.unit,
      note: {
        text: [
          data.mold.name,
          readingDay(data.mold.date),
          current.estimated?.includes('mold') ? MOLD_ESTIMATE : null,
        ]
          .filter((part): part is string => Boolean(part))
          .join(' · '),
      },
      status: { variable: 'mold', value: moldReading },
      // The station's own daily totals, which draw as a staircase. Flat within
      // a day is what a once-a-morning instrument looks like on an hourly axis,
      // and smoothing it would be drawing hours nobody counted.
      series: window.map((h) => h.raw.mold ?? null),
      floor: 0,
      carried: window.map((h) => h.carried?.includes('mold') ?? false),
      tol: tolerance('mold'),
    })
  }

  // The proxy. It is on the screen in season whether or not a station is, and
  // for most people it is the only mold signal there will ever be: Hamden's
  // nearest live counting stations are Olean, NY and Silver Spring, MD.
  const drySpore = current.exposure.dry_spore_index
  if (drySpore !== undefined) {
    const meta = VARIABLE_LABELS.dry_spore_index!
    rows.push({
      key: 'dry_spore_index',
      name: meta.name,
      help: 'dry_spore_index',
      sub: 'estimate from weather',
      value: drySpore,
      unit: meta.unit,
      // Quiet rather than a claim: the row is not asserting that there are
      // spores, it is saying what kind of number it is. The sentence is the
      // mechanism in eight words, because "3 of 5" on its own is a score in a
      // game nobody explained.
      note: { text: DRY_SPORE_ESTIMATE },
      status: { variable: 'dry_spore_index', value: drySpore },
      series: window.map((h) => h.raw.dry_spore_index ?? null),
      floor: 0,
      tol: tolerance('dry_spore_index'),
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
      // The row is drawn at type level; the entries are too, so the row's own
      // key is the glossary key. The plant variables under it resolve to the
      // same entry through `glossaryKeyFor`, which is what the diary's
      // per-species evidence rows use.
      help: `pollen_${type}`,
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
      floor: 0,
      ceiling: 5,
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
      // One entry whichever name the row is wearing: the two features are one
      // curve folded twice, and a reader tapping the `?` is asking about the
      // number on the screen, which is the dew point either way.
      help: 'dewpoint',
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

/** One name under the air table, with whatever the app can say about it. */
interface AbsentName {
  name: string
  /** the reading, where there is one to show ("1 µg/m³", "none") */
  detail?: string
  /** the glossary entry its `?` opens (specs/30-glossary.md) */
  help: GlossaryKey
}

/**
 * The two lines under the air table that name what has no row
 * (specs/29-sulfur-dioxide.md §7). A variable the app carries and does not
 * draw has to say so somewhere, or the day its row does appear reads as a bug
 * rather than as news.
 *
 * They are two lines and never one, because the two silences are different
 * claims. "Too low to matter" is the floor: the number was read, and it sits
 * below the level at which the variable could be a suspect at all — so the
 * number is printed, because somebody measured it. "Not measured here" is the
 * other absence: a station series whose nearest monitor does not report the
 * variable, where the model is deliberately not consulted for it, since one
 * CAMS number inside a series of monitor readings would be a bound learned
 * against the wrong instrument.
 *
 * A name with a row is in neither line, by construction rather than by a
 * check: each line's condition is the exact complement of the row's — the
 * floor for SO₂, a zero for smoke. NO₂ is in neither because it left the
 * vector outright (specs/24-vector-diet.md), and naming it would promise a
 * check nobody is performing.
 */
function AbsentNames({
  data,
  help,
}: {
  data: ExposureSeries
  /** the route's one `?`-and-sheet pair, passed down rather than opened again */
  help: (key: GlossaryKey, name?: string) => ReactElement
}) {
  const current = data.hours[data.currentIndex]!
  const so2 = current.exposure.so2
  const so2Meta = VARIABLE_LABELS.so2!

  const tooLow: AbsentName[] = []
  if (so2 !== undefined && so2 <= negligibleFor('so2')) {
    tooLow.push({ name: so2Meta.name, detail: `${Math.round(so2)} ${so2Meta.unit}`, help: 'so2' })
  }
  // Smoke says "none" rather than "0 of 3": the scale is analyst-drawn steps,
  // and the honest reading of a zero is that the satellite looked and there
  // was no plume over this place. An hour nobody has an answer for carries no
  // `smoke` key at all and appears on neither line — unknown is not none.
  if (current.exposure.smoke === 0) {
    tooLow.push({ name: VARIABLE_LABELS.smoke!.short, detail: 'none', help: 'smoke' })
  }

  // "Not measured here" is a fact about the network, not about this hour, so
  // it is decided by whether a monitor reports SO₂ at all — `siteNames` holds
  // one entry per variable some monitor answered for. An hour whose reading
  // has not posted yet is a different absence entirely (AirNow publishes the
  // NowCast before the raw hourly) and belongs on neither line: the station
  // does measure SO₂, and it is about to say so. Only ever a station series
  // either way — on the model every variable has a number, so the line would
  // be false wherever it could be printed.
  const notMeasured: AbsentName[] =
    data.source === AIRNOW_SOURCE && data.siteNames?.so2 === undefined
      ? [{ name: so2Meta.name, help: 'so2' as const }]
      : []

  if (tooLow.length === 0 && notMeasured.length === 0) return null
  return (
    <div className="air-absent">
      <AbsentLine label="Also checked, too low to matter" names={tooLow} help={help} />
      <AbsentLine label="Not measured here" names={notMeasured} help={help} />
    </div>
  )
}

/**
 * One of those lines, or nothing when it has no names. Each name is its own
 * element because [30-glossary.md] hangs a `?` off it — the line is a list of
 * things a person may not know the meaning of, which is most of why it is
 * worth printing at all.
 */
function AbsentLine({
  label,
  names,
  help,
}: {
  label: string
  names: AbsentName[]
  help: (key: GlossaryKey, name?: string) => ReactElement
}) {
  if (names.length === 0) return null
  return (
    <div>
      {label}:{' '}
      {names.map((item, i) => (
        <Fragment key={item.name}>
          {i > 0 ? ' · ' : ''}
          <span className="air-absent-name">{item.name}</span>
          {help(item.help, item.name)}
          {item.detail ? ` ${item.detail}` : ''}
        </Fragment>
      ))}
    </div>
  )
}

function AirTable({
  data,
  model,
  tempUnit,
  lat,
  lon,
}: {
  data: ExposureSeries
  model: TriggerModel
  tempUnit: TemperatureUnit
  /** the place, for the row caveat that is about a region (see buildAirRows) */
  lat: number
  lon: number
}) {
  const rows = buildAirRows(data, model, tempUnit, lat, lon)
  // One sheet for the whole surface — the rows and the two absent lines under
  // them — rather than one per name (specs/30-glossary.md §3). The Good sheet
  // is the same shape: one per screen, opened from whichever row drew the line.
  const { help, sheet } = useGlossaryHelp()
  const { goodHelp, goodSheet } = useGoodHelp()
  // Every pollutant row names its instrument (specs/27-one-ozone.md). When
  // every row that has one names the same instrument, the section names it
  // once on the rule and the rows stop repeating it three times; the moment
  // two rows would disagree, each says its own. Either way no number on the
  // screen is unmarked.
  const sources = new Set(rows.map((r) => r.source).filter((x): x is string => x !== undefined))
  const shared = sources.size === 1 ? [...sources][0] : undefined
  // The legend under the table names only the lines that are actually drawn.
  const showEasy = rows.some((r) => r.tol !== undefined)
  const showGood = rows.some((r) => r.tol === undefined && r.guide !== undefined)
  return (
    <section className="section" style={{ gap: 4 }}>
      <SectionRule label="In the air" note={shared ? `${shared} · last 48 h` : 'last 48 h'} faint />
      <div className="air-table">
        {rows.map((row) => {
          const status =
            'chip' in row.status
              ? { text: row.status.chip, cls: '' }
              : statusChip(model, row.status.variable, row.status.value)
          const sub = [row.sub, shared ? undefined : row.source]
            .filter((x): x is string => x !== undefined)
            .join(' · ')
          // The verdict names the level it was spoken against, so the number
          // in the gutter and the sentence under the name are one claim.
          const verdict =
            'chip' in row.status
              ? status.text
              : row.tol !== undefined
                ? `${status.text} · your easy level is ${Math.round(row.tol)}`
                : status.text === 'no logs yet'
                  ? status.text
                  : `${status.text} · no easy level of yours yet`
          const good: GoodReference | undefined =
            row.tol === undefined && row.guide !== undefined
              ? { name: row.name.toLowerCase(), value: row.guide.value, unit: row.unit, span: row.guide.span }
              : undefined
          return (
            <div key={row.key} className="air-row">
              <div className="air-name-row">
                <span className="air-name">{row.name}</span>
                {help(row.help, row.name)}
                {sub && <span className="air-sub">{sub}</span>}
                <span className="air-spacer" />
                <span className="air-value">
                  {row.value} <span className="air-unit">{row.unit}</span>
                </span>
              </div>
              <span className={`air-status ${status.cls}`}>{verdict}</span>
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
              <AirSpark
                series={row.series}
                carried={row.carried}
                tol={row.tol}
                guide={good ? row.guide : undefined}
                floor={row.floor}
                ceiling={row.ceiling}
                invert={row.invert}
                name={row.name}
                goodHelp={good ? goodHelp(good) : undefined}
                sayNoLevel={'chip' in row.status}
              />
              <div className="air-ticks" aria-hidden="true">
                <span>−48 h</span>
                <span>−24 h</span>
                <span>now</span>
              </div>
            </div>
          )
        })}
      </div>
      {(showEasy || showGood) && (
        <span className="air-legend">
          {showEasy && (
            <>
              <span className="rule-dash" /> your easy level, from your diary
            </>
          )}
          {showEasy && showGood && ' · '}
          {showGood && (
            <>
              <span className="rule-dot" /> EPA&rsquo;s &ldquo;Good&rdquo; ceiling, until you have one
            </>
          )}
        </span>
      )}
      <AbsentNames data={data} help={help} />
      {sheet}
      {goodSheet}
    </section>
  )
}

/**
 * The row's last 48 hours against its reference line. The line is the air;
 * ink appears only between the line and the dashed easy level, so a calm
 * window is a bare line and the table's total ink literally equals hours
 * past this person. A row with no easy day logged yet draws the EPA's Good
 * ceiling instead, dotted and in the AQI's own green, and a row with neither
 * says so in the gutter.
 *
 * The axis starts at the row's floor (zero for anything measured in air) and
 * reaches the reference line or the highest reading, whichever is higher, so
 * the gap between the line and the air is headroom you can see, and a row
 * that is barely present draws flat along the bottom instead of filling the
 * plot with its own noise.
 */
function AirSpark({
  series,
  carried,
  tol,
  guide,
  floor,
  ceiling,
  invert,
  name,
  goodHelp,
  sayNoLevel,
}: {
  series: (number | null)[]
  /** parallel to `series`: hours whose number is a copy of the last reading */
  carried?: boolean[]
  /** "your easy level" in the row's display units */
  tol?: number
  /** the EPA's Good ceiling, drawn only when there is no easy level */
  guide?: { value: number; span: string }
  /** where the axis starts; unset means the lowest value in the window */
  floor?: number
  /** where the axis must reach regardless of the readings (an index's top) */
  ceiling?: number
  /** dry side of the dew-point row: past-easy is below the waterline */
  invert?: boolean
  name: string
  /** the `?` beside the Good label, from the table's one Good sheet */
  goodHelp?: ReactElement
  /**
   * With no line to label, whether the gutter says so. Off where the verdict
   * line under the name already says "no easy level of yours yet"; on for
   * the rows that carry a chip instead ("not graded"), which say nothing.
   */
  sayNoLevel?: boolean
}) {
  const clip = useId()
  const readings = series.filter((v): v is number => v !== null)
  if (readings.length < 2) return null
  // Plot in x 2..286; the right gutter holds the reference line's label.
  const X0 = 2
  const X1 = 286
  const Y0 = 6
  const Y1 = 42
  const H = 48
  const ref = tol ?? guide?.value
  const values = ref === undefined ? readings : [...readings, ref]
  let lo = floor ?? Math.min(...values)
  let hi = Math.max(...values, ceiling ?? -Infinity)
  if (hi - lo < 1e-9) {
    lo -= 1
    hi += 1
  }
  const x = (i: number): number => X0 + (i * (X1 - X0)) / (series.length - 1)
  const y = (v: number): number => Y1 - ((v - lo) / (hi - lo)) * (Y1 - Y0)
  // One sub-path per unbroken run of hours. The line simply stops where a
  // monitor did, which is the truth; joining across the gap would draw a
  // reading nobody took, and dropping to the floor would invent a clean hour.
  //
  // A run also breaks where the hours turn from readings into copies of the
  // last reading (`carried`), and the copied run is drawn dotted from the last
  // real point — the two share that point so the line stays joined — because
  // a solid line across a day nobody counted claims a count. Dotted, not
  // dashed: dashes on this sparkline already mean the waterline.
  const runs: { points: { x: number; y: number }[]; carried: boolean }[] = []
  let run: { x: number; y: number }[] = []
  let runCarried = false
  series.forEach((v, i) => {
    const isCarried = carried?.[i] ?? false
    if (v === null) {
      if (run.length > 0) runs.push({ points: run, carried: runCarried })
      run = []
    } else {
      if (run.length > 0 && isCarried !== runCarried) {
        runs.push({ points: run, carried: runCarried })
        run = [run[run.length - 1]!]
      }
      if (run.length === 0) runCarried = isCarried
      run.push({ x: x(i), y: y(v) })
    }
  })
  if (run.length > 0) runs.push({ points: run, carried: runCarried })
  const trace = (points: { x: number; y: number }[]): string =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const line = runs.filter((r) => !r.carried).map((r) => trace(r.points)).join(' ')
  const copied = runs.filter((r) => r.carried).map((r) => trace(r.points)).join(' ')
  const endsCarried = carried?.[series.length - 1] ?? false
  // The marker sits on the last hour that has a number, which is not always
  // the last hour: AirNow publishes the NowCast before the raw hourly, so the
  // current hour is routinely blank. Drawing it from `series[last]` put the
  // dot at y(null) — coerced to zero, under the plot, detached from the line.
  // A series that ends blank gets the same hollow marker as a carried one:
  // the point is a reading, just not a fresh one.
  const lastIndex = series.length - 1 - [...series].reverse().findIndex((v) => v !== null)
  const lastValue = series[lastIndex]!
  const endsBlank = lastIndex < series.length - 1
  const past = tol !== undefined && readings.some((v) => (invert ? v < tol : v > tol))
  const yTol = tol !== undefined ? y(tol) : 0
  const yRef = ref !== undefined ? y(ref) : undefined
  // The gutter label is HTML, not SVG text, so it wears the app's type and
  // the `?` beside "Good" is a real button with a real target. It is centred
  // on the line, except near either edge, where it hangs inside the plot.
  const gutterStyle =
    yRef === undefined
      ? { bottom: 0, display: sayNoLevel ? undefined : 'none' }
      : yRef < 14
        ? { top: `${(yRef / H) * 100}%` }
        : yRef > Y1 - 8
          ? { top: `${(yRef / H) * 100}%`, transform: 'translateY(-100%)' }
          : { top: `${(yRef / H) * 100}%`, transform: 'translateY(-50%)' }
  return (
    <div className="air-spark-wrap">
      <svg
        className="air-spark"
        viewBox={`0 0 340 ${H}`}
        role="img"
        aria-label={
          (tol !== undefined
            ? `${name}, past 48 hours; dashes mark your easy level, ${Math.round(tol)}.${
                past ? ' The air was past it during this window.' : ''
              }`
            : guide !== undefined
              ? `${name}, past 48 hours; dots mark the EPA's Good ceiling, ${guide.value}.`
              : `${name}, past 48 hours.`) +
          (copied ? ' The dotted end is the last count carried forward, not a new one.' : '') +
          (endsBlank ? ' The latest hour has no reading yet; the marker is the last one taken.' : '')
        }
      >
        <line
          x1={(X0 + X1) / 2}
          y1={Y0}
          x2={(X0 + X1) / 2}
          y2={Y1}
          stroke="var(--hairline-light)"
          strokeWidth={1}
        />
        {past && (
          <>
            <clipPath id={clip}>
              {invert ? (
                <rect x={0} y={yTol} width={340} height={H - yTol} />
              ) : (
                <rect x={0} y={0} width={340} height={yTol} />
              )}
            </clipPath>
            <path
              d={runs
                .map(({ points }) => `${trace(points)} V${invert ? 0 : H} H${points[0]!.x.toFixed(1)} Z`)
                .join(' ')}
              fill="var(--l3)"
              clipPath={`url(#${clip})`}
            />
          </>
        )}
        {tol !== undefined ? (
          <line
            x1={X0}
            y1={yTol}
            x2={X1}
            y2={yTol}
            stroke="var(--l2)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : (
          yRef !== undefined && (
            <line
              x1={X0}
              y1={yRef}
              x2={X1}
              y2={yRef}
              stroke="var(--good)"
              strokeWidth={1}
              strokeDasharray="1 3"
              strokeLinecap="round"
              opacity={0.85}
            />
          )
        )}
        {line && (
          <path
            d={line}
            fill="none"
            stroke="var(--ink-2)"
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {copied && (
          <path
            d={copied}
            fill="none"
            stroke="var(--ink-2)"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeDasharray="0.1 4"
          />
        )}
        {endsCarried || endsBlank ? (
          <circle
            cx={x(lastIndex)}
            cy={y(lastValue)}
            r={3.5}
            fill="var(--paper)"
            stroke="var(--ink)"
            strokeWidth={1.5}
          />
        ) : (
          <circle cx={x(lastIndex)} cy={y(lastValue)} r={4} fill="var(--ink)" />
        )}
      </svg>
      <div
        className={`spark-gutter${tol === undefined && guide !== undefined ? ' good' : ''}`}
        style={gutterStyle}
        aria-hidden={goodHelp ? undefined : true}
      >
        {tol !== undefined ? (
          <>
            <span className="spark-gutter-word">your easy</span>
            <span className="spark-gutter-num">{Math.round(tol)}</span>
          </>
        ) : guide !== undefined ? (
          <>
            <span className="spark-gutter-word">
              Good {goodHelp}
            </span>
            <span className="spark-gutter-num">{guide.value}</span>
          </>
        ) : (
          <span className="spark-gutter-word">no level yet</span>
        )}
      </div>
    </div>
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
      {/* The seam (specs/27-one-ozone.md). This curve starts at now and runs
          forward, and on a station series only its first hour is measured:
          AirNow publishes no hourly forecast, so every hour after now is CAMS
          (`forecastSource: 'cams'`). A reader who has just been told the ozone
          row is a New Haven monitor would otherwise carry that standing across
          the whole curve. On a model series there is no seam to mark — it is
          one instrument the whole way across, and the rows already say so. */}
      {data.source === AIRNOW_SOURCE && (
        <span className="byhour-seam">measured to now · model after</span>
      )}
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
        // Since spec 22 the rows above are averages too, so "stations report
        // averages" named nothing that sets the two apart and left the reader
        // to guess at a gap. What is actually different is the quantity and
        // the place: a chip is AirNow's NowCast — a weighted multi-hour AQI
        // for a whole reporting area, walked back to µg/m³ through the EPA
        // table — and a row is the model's own trailing mean for this spot.
        // Two honest numbers about different things (specs/27-one-ozone.md).
        <span className="settings-note">
          Chips are AirNow&rsquo;s NowCast AQI for that reporting area, walked back to µg/m³.
          The rows above are the model&rsquo;s own 8- and 24-hour means for this spot — a
          different quantity from a different place, so a gap is not by itself a contradiction.
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
