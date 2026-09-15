import { Link, createFileRoute } from '@tanstack/react-router'
import { Fragment, useMemo, useState } from 'react'
import { glossaryKeyFor } from '../content/glossary'
import { PRIORS, SOURCE_SCOPED_VARIABLES, negligibleFor } from '../engine/config'
import { buildModel } from '../engine/infer'
import type {
  AmbiguousConstraint,
  Bounds,
  Confirmation,
  Conflict,
  DiaryEntry,
  Rating,
  TriggerModel,
} from '../engine/types'
import { POLLEN_PLANT_VARIABLES } from '../sources/pollenPlants'
import { track } from '../ui/analytics'
import { LevelPill, SectionRule } from '../ui/bits'
import { loadDiary, saveDiary } from '../ui/diaryStorage'
import { conflictKey, dismissConflict, dismissedConflicts } from '../ui/dismissed'
import { BackupChip } from '../ui/durabilityUi'
import {
  bandEdges,
  bandRates,
  sourceTag,
  sourceWord,
  stackDots,
  stripRange,
  type StripPoint,
} from '../ui/evidenceStrip'
import { useGlossaryHelp } from '../ui/help'
import { VARIABLE_LABELS, levelWord, variableName } from '../ui/labels'
import { isPending, settled } from '../ui/pendingExposure'
import { calendarPollenPatch } from '../ui/pollenTag'
import { displayTemperature, useTemperatureUnit, type TemperatureUnit } from '../ui/units'
import { lastKnownCoords } from '../ui/useExposureSeries'
import { isSick, viralPatch } from '../ui/viralTag'

export const Route = createFileRoute('/diary')({ component: Diary })

const CONFLICT_TAGS = ['pollen', 'sick', 'indoors all day']

/**
 * Both generations of pollen variable: entries logged before spec 18 carry
 * the grains-scale species, everything since carries the index-scale plants.
 * Each is judged against its own prior; they never mix scales.
 */
const POLLEN_VARIABLES = [
  ...POLLEN_PLANT_VARIABLES,
  'grass_pollen',
  'birch_pollen',
  'ragweed_pollen',
] as const

function Diary() {
  const [diary, setDiary] = useState<DiaryEntry[]>(loadDiary)
  // Keyed by entry id and card kind, not by index into the model diary: indexes
  // shift as entries arrive, and a card left alone was left alone about a
  // particular day. Read from storage, so the answer survives the visit.
  const [leftAlone, setLeftAlone] = useState<Set<string>>(dismissedConflicts)
  const [saveFailed, setSaveFailed] = useState(false)
  const tempUnit = useTemperatureUnit()
  // One sheet for the evidence panel, opened by whichever row's `?` was tapped
  // (specs/30-glossary.md §6).
  const { help, sheet } = useGlossaryHelp()
  // Entries still waiting on their air have no vector to reason about, so the
  // model — and every index into it — is built on the settled ones alone.
  const modelDiary = useMemo(() => settled(diary), [diary])
  const model = useMemo(() => buildModel(modelDiary), [modelDiary])

  const update = (next: DiaryEntry[]) => {
    setDiary(next)
    setSaveFailed(!saveDiary(next))
  }

  const amend = (entryId: string, patch: Partial<DiaryEntry>) => {
    update(diary.map((e) => (e.id === entryId ? { ...e, ...patch } : e)))
  }

  const conflicts = model.conflicts.filter((c) => {
    const id = modelDiary[c.entryIndex]?.id
    return id === undefined || !leftAlone.has(conflictKey(id, c.kind))
  })
  const conflictByEntryId = new Map(
    conflicts.map((c) => [modelDiary[c.entryIndex]?.id, c.entryIndex] as const),
  )

  return (
    <>
      <div className="page-title-row">
        <div className="page-title-group">
          <h1 className="page-title">Log</h1>
          <span className="page-title-count">
            {diary.length} {diary.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <Link to="/" search={{ log: true }} className="log-now">
          + Log now
        </Link>
      </div>

      {saveFailed && (
        <p className="save-error">
          Couldn&rsquo;t save that change — export your logs now.
        </p>
      )}
      <BackupChip entryCount={diary.length} />

      <EvidencePanel model={model} diary={modelDiary} tempUnit={tempUnit} help={help} />
      {sheet}

      {conflicts.map((conflict) => (
        <ConflictCard
          key={conflict.entryIndex}
          conflict={conflict}
          entry={modelDiary[conflict.entryIndex]}
          onTag={(id, tag) => {
            const entry = diary.find((e) => e.id === id)
            // Two of these tags name a variable, so the app can answer them
            // instead of filing them. "pollen" attaches the calendar season the
            // day sat in, where one covers it, as an estimate. "sick" attaches
            // `viral` outright (specs/26-sick-as-signal.md) — no season to look
            // up and nothing to estimate — and the day re-enters inference
            // carrying the candidate it was missing, which is the exact
            // opposite of what tagging it sick used to do. "indoors all day"
            // names no variable and stays what it was: a reason to distrust the
            // day, and the entry leaves inference for it.
            const patch =
              entry && tag === 'pollen'
                ? calendarPollenPatch(entry, lastKnownCoords())
                : entry && tag === 'sick'
                  ? viralPatch(entry)
                  : null
            if (patch) amend(id, patch)
            // A "sick" tap the patch declined is a day already marked sick;
            // there is nothing left to record, and filing a confounder would
            // undo the very thing the first tap did.
            else if (tag !== 'sick') amend(id, { confounders: [...(entry?.confounders ?? []), tag] })
            // Which tag they picked is a symptom note; only the card kind ships.
            track('Conflict tagged', { kind: conflict.kind })
          }}
          onNote={(id, note) => amend(id, { note })}
          onLeave={(id) => setLeftAlone(dismissConflict(id, conflict.kind))}
        />
      ))}

      <section>
        {diary.length === 0 && (
          <p className="settings-note">
            No entries yet. Log good days too: a rating of 1 records that you tolerated everything
            in today&rsquo;s air.
          </p>
        )}
        {groupByDay(diary).map((group) => (
          <Fragment key={group.label}>
            <div className="entry-group-label">{group.label}</div>
            {group.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                tempUnit={tempUnit}
                conflictIndex={conflictByEntryId.get(entry.id)}
              />
            ))}
          </Fragment>
        ))}
      </section>
    </>
  )
}

/* --- what your diary shows --- */

/**
 * The verdicts, one row per name the diary has something to say about, and
 * under each row (on a tap) the days themselves: every usable entry as a dot
 * along that variable's own axis, and the rate of easy days by band. The
 * strip is what the panel owes a reader when no verdict is reachable yet —
 * twenty days have a shape long before they have a proof.
 */
function EvidencePanel({
  model,
  diary,
  tempUnit,
  help,
}: {
  model: TriggerModel
  /** the settled diary the model was built on, indexed the same way */
  diary: DiaryEntry[]
  tempUnit: TemperatureUnit
  help: ReturnType<typeof useGlossaryHelp>['help']
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const toggle = (variable: string) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(variable)) next.delete(variable)
      else next.add(variable)
      return next
    })
  // The days the model reasons over: confounded entries are out of it, and
  // out of the strips too, so the dots are the evidence and nothing else.
  const usable = diary.filter((e) => !e.confounders?.length)
  const easy = usable.filter((e) => e.rating === 1).length
  const worst = Math.max(1, ...usable.map((e) => e.rating)) as Rating
  const rows = evidenceRows(model, tempUnit)
  return (
    <section className="section">
      <SectionRule
        label="What your logs show"
        note={
          usable.length > 0 ? (
            <>
              {easy} easy {easy === 1 ? 'day' : 'days'} · {usable.length - easy} not ·{' '}
              <span className="dot-swatch easy" /> easy{' '}
              {([2, 3, 4] as const)
                .filter((r) => r <= worst)
                .map((r) => (
                  <Fragment key={r}>
                    <span className={`dot-swatch l${r}`} /> {r}{' '}
                  </Fragment>
                ))}
            </>
          ) : undefined
        }
        faint
      />
      <div className="row-card">
        {rows.map((row) => {
          const entry = glossaryKeyFor(row.variable)
          const isOpen = open.has(row.variable)
          return (
            <div key={row.variable} className="evidence-item">
              <div className="evidence-row">
                <button
                  type="button"
                  className="evidence-toggle"
                  aria-expanded={isOpen}
                  aria-label={`${row.name}: ${row.text}. ${isOpen ? 'Hide' : 'Show'} the days.`}
                  onClick={() => toggle(row.variable)}
                >
                  <span className={`evidence-glyph ${row.cls || 'none'}`}>{row.glyph}</span>
                  <span className="evidence-name">{row.name}</span>
                </button>
                {entry ? help(entry, row.name) : null}
                {/* The second half of the same control: one action, two spans
                    of the row, because the `?` between them is a control of
                    its own and a button cannot contain a button. */}
                <button
                  type="button"
                  className="evidence-toggle text"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={() => toggle(row.variable)}
                >
                  <span className="evidence-text">{row.text}</span>
                  <span className={`evidence-chevron${isOpen ? ' open' : ''}`} />
                </button>
              </div>
              {isOpen && <EvidenceStrip row={row} diary={usable} />}
            </div>
          )
        })}
      </div>
    </section>
  )
}

interface EvidenceAxis {
  /** a stored feature value -> the number on the strip's axis (folded for dew point) */
  to: (v: number) => number
  /** a number on that axis, short, for the axis ends and the band labels */
  short: (d: number) => string
}

interface EvidenceRowData {
  name: string
  /**
   * The exposure variable the row is about, so the `?` beside its name can
   * find the entry that explains it (specs/30-glossary.md §6). The name alone
   * would not do: "Alternaria" and "Mold" are two rows and one entry.
   */
  variable: string
  glyph: string
  cls: string
  text: string
  axis: EvidenceAxis
  /** reference marks on the strip's axis, from whichever bound set spoke */
  marks: { easy?: number; trigger?: number }
}

/** The part of a model (live or inert) a verdict is read from. */
interface EvidenceView {
  confirmed: Bounds
  tolerance: Bounds
  confirmations: Confirmation[]
  constraints: AmbiguousConstraint[]
}

interface Verdict {
  glyph: string
  cls: string
  text: string
  /** trigger 4 · one-day suspect 3 · never-alone suspect 2 · fine 1 · nothing 0 */
  rank: number
  marks: { easy?: number; trigger?: number }
}

function evidenceRows(model: TriggerModel, tempUnit: TemperatureUnit): EvidenceRowData[] {
  // Every weather feature is a distance from a threshold, and nobody can
  // picture a distance. Fold it back through the threshold it was measured
  // from and the row reads as air a person could stand outside in.
  const fmtAt = (celsius: number): string =>
    `${Math.round(displayTemperature(celsius, tempUnit))} °${tempUnit}`
  const bare = (v: number) => `${Math.round(v)}`
  const plain: EvidenceAxis = { to: (v) => v, short: bare }
  const dewpoint = (fold: (v: number) => number): EvidenceAxis => ({
    to: (v) => displayTemperature(fold(v), tempUnit),
    short: (d) => `${Math.round(d)} °${tempUnit}`,
  })

  const verdict = (
    view: EvidenceView,
    variable: string,
    fmt: (v: number) => string,
    tag: string,
  ): Verdict => {
    const confirmed = view.confirmed[variable]
    const level = ([4, 3, 2] as const).find((l) => confirmed?.[l] !== undefined)
    const tol = view.tolerance[variable]?.[2]
    const hasTol = tol !== undefined && tol > negligibleFor(variable)
    const marks = hasTol ? { easy: tol } : {}
    if (level !== undefined) {
      const at = confirmed![level]!
      return {
        glyph: '●',
        cls: 'trigger',
        text: `trigger — ${levelWord(level)} near ${fmt(at)}${tag}${hasTol ? `, fine up to ${fmt(tol)}` : ''}`,
        rank: 4,
        marks: { ...marks, trigger: at },
      }
    }
    // One bad day where this was the lone candidate, but other air was about:
    // a real lead, and not yet a claim the forecast will stand on.
    const oneDay = view.confirmations.find(
      (c) => c.variable === variable && c.strength === 'suspected-strong',
    )
    if (oneDay) {
      return {
        glyph: '◐',
        cls: 'suspect',
        text: `suspect — one day points at it near ${fmt(oneDay.bound)}${tag}`,
        rank: 3,
        marks,
      }
    }
    if (view.constraints.some((c) => c.candidates.includes(variable))) {
      return { glyph: '◐', cls: 'suspect', text: `suspect — never seen it act alone${tag}`, rank: 2, marks }
    }
    if (hasTol) {
      return { glyph: '○', cls: 'fine', text: `fine in everything up to ${fmt(tol)}${tag}`, rank: 1, marks }
    }
    return { glyph: '◌', cls: '', text: 'no evidence yet either way', rank: 0, marks: {} }
  }

  // The verdict the diary can stand behind, from whichever bound set has the
  // most to say. Bounds are source-scoped (specs/27-one-ozone.md): a level
  // learned on the model never predicts against the monitor, and the live
  // model is built on the active source alone. But "what your logs show" is
  // a question about the logs, not a forecast, and twenty model-era days
  // that isolated ozone are still what the logs show after two monitor
  // days. So a source-scoped row reads every era and takes the strongest
  // verdict, tagged with the era it came from when that is not the live one.
  const summarize = (
    variable: string,
    fmt: (v: number) => string,
    axis: EvidenceAxis = plain,
  ): Omit<EvidenceRowData, 'name'> => {
    let best = verdict(model, variable, fmt, '')
    if (SOURCE_SCOPED_VARIABLES.has(variable)) {
      for (const inert of model.inert) {
        const candidate = verdict(inert, variable, fmt, ` (${sourceTag(inert.source)})`)
        if (candidate.rank > best.rank) best = candidate
      }
    }
    return {
      variable,
      glyph: best.glyph,
      cls: best.cls,
      text: best.text,
      axis,
      marks: {
        ...(best.marks.easy !== undefined ? { easy: axis.to(best.marks.easy) } : {}),
        ...(best.marks.trigger !== undefined ? { trigger: axis.to(best.marks.trigger) } : {}),
      },
    }
  }

  const rows: EvidenceRowData[] = [
    { name: variableName('pm25'), ...summarize('pm25', bare) },
    { name: variableName('o3'), ...summarize('o3', bare) },
    // Both bounds are dew points once folded back: dry air is counted down
    // from 11 °C, humid heat up from 18 °C (specs/23-dew-point-air.md).
    {
      name: variableName('dry_air'),
      ...summarize('dry_air', (v) => fmtAt(11 - v), dewpoint((v) => 11 - v)),
    },
    {
      name: variableName('humid_heat'),
      ...summarize('humid_heat', (v) => fmtAt(18 + v), dewpoint((v) => 18 + v)),
    },
  ]
  // Smoke is live but conditional, which is a third case and worth naming
  // (specs/25-smoke-variable.md). The four rows above are standing because the
  // air always has some of each in it: a week of ordinary days gets every one
  // of them past "no evidence yet either way" on its own. Smoke does not work
  // like that. Its floor is 0 and most people's every entry carries a 0, so a
  // standing row would read "no evidence yet either way" on every screen for
  // years, which is the panel promising a verdict it has no way to reach.
  //
  // The test the pollen rows already use says exactly the right thing here
  // without any new machinery: a row appears once the diary holds a verdict.
  // For smoke the two are the same question — a 0 can neither be a suspect
  // (it is at the floor) nor raise a tolerance (same), so the row shows up
  // precisely when some entry was logged under a real plume, good day or bad.
  // The number wears its scale, because "near 2" means nothing and "near 2 of
  // 3" is a thing a person can picture.
  const ofThree = (v: number): string => `${Math.round(v)} ${VARIABLE_LABELS.smoke!.unit}`
  const smoke = summarize('smoke', ofThree)
  if (smoke.cls !== '') rows.push({ name: variableName('smoke'), ...smoke })
  // Being sick appears on the same rule and for the same reason
  // (specs/26-sick-as-signal.md): the flag is absent on nearly every entry, so a
  // standing row would say "no evidence yet either way" for years. It shows up
  // once some day was logged sick, good or bad. The number is bare — a 0/1 flag
  // has no unit, and "near 1" is doing no work in the sentence anyway; the
  // verdict word is the whole content of the row.
  const viral = summarize('viral', bare)
  if (viral.cls !== '') rows.push({ name: variableName('viral'), ...viral })
  // SO₂ on the smoke rule and for a fourth version of the same reason
  // (specs/29-sulfur-dioxide.md). Its floor is 20 µg/m³ and the air here runs
  // between 0.2 and 2.7, so nearly every entry anybody logs sits under it: a
  // standing row would say "no evidence yet either way" for years, which is
  // the panel advertising a verdict that is not coming. It appears the day an
  // entry is logged in air that actually had SO₂ in it — a port, a refinery, a
  // volcanic plume — which is the day the diary has something to say.
  const so2 = summarize('so2', bare)
  if (so2.cls !== '') rows.push({ name: variableName('so2'), ...so2 })
  // Mold and its two genera, on the same rule and for a third version of the
  // same reason (specs/28-mold.md). Most people have no counting station
  // within a hundred miles, and the ones who do have picked one; a standing
  // row would tell everybody else that the app is collecting evidence about
  // spores, which for them it is not. The genus rows are conditional twice
  // over — only four of the five stations split the count at all, and
  // Children's Mercy publishes a rotating top five, so Alternaria is there
  // some mornings and not others.
  //
  // `dry_spore_index` joins them, and it is the one row here that will never
  // say "trigger": the variable is always `estimated`, so the provenance rule
  // caps it at suspect however often a bad day lands on a dry warm week. That
  // is the honest ceiling for a weather pattern standing in for a microscope,
  // and the row says as much by never getting past ◐.
  const conditional: [string, (v: number) => string][] = [
    ['mold', bare],
    ['mold_alternaria', bare],
    ['mold_cladosporium', bare],
    ['dry_spore_index', (v) => `${Math.round(v)} ${VARIABLE_LABELS.dry_spore_index!.unit}`],
  ]
  for (const [variable, fmt] of conditional) {
    const row = summarize(variable, fmt)
    if (row.cls !== '') rows.push({ name: variableName(variable), ...row })
  }
  // Names that have left the vector get no row here at all — the weather
  // stresses of spec 23, PM10 and NO₂ of spec 24, the grains/m³ pollen of
  // spec 18. Nothing logged from now on carries them, so a row would be
  // advertising evidence the app has stopped collecting, and (for the weather
  // three) a verdict on a mechanism the app no longer believes in. Their
  // values still show on the entries that carry them.
  //
  // Pollen earns a line once the diary has a verdict on a plant — named by
  // plant, since that is what the evidence is about. Outside Europe it is
  // usually a calendar estimate, which can reach "suspect" and no further.
  for (const variable of POLLEN_PLANT_VARIABLES) {
    const row = summarize(variable, bare)
    if (row.cls !== '') rows.push({ name: variableName(variable), ...row })
  }
  return rows
}

/**
 * The row's days, as dots. Rings are easy days, filled dots the rest, in the
 * level inks. A dashed tick is the easy level the verdict rests on, a solid
 * one the trigger bound. Under it, the rate of easy days by band — cut at
 * the population breakpoints where the data reaches them, else at the easy
 * level — which is the shape of the evidence even when no single trigger can
 * be isolated from it.
 */
function EvidenceStrip({ row, diary }: { row: EvidenceRowData; diary: DiaryEntry[] }) {
  const points: StripPoint[] = diary
    .filter((e) => e.exposure[row.variable] !== undefined)
    .map((e) => ({
      value: row.axis.to(e.exposure[row.variable]!),
      rating: e.rating,
      source: e.source,
    }))
  if (points.length === 0) {
    return <div className="evidence-detail evidence-note">No day in your logs carries a reading for this.</div>
  }
  const marks = [row.marks.easy, row.marks.trigger].filter((m): m is number => m !== undefined)
  const range = stripRange(points, marks)
  const X0 = 6
  const X1 = 334
  const x = (v: number): number => X0 + ((v - range.lo) / (range.hi - range.lo)) * (X1 - X0)
  const dots = stackDots(points, x, 7)
  const prior = PRIORS[row.variable]
  const edges = bandEdges(
    [prior?.[2], prior?.[3]].map((e) => (e === undefined ? undefined : row.axis.to(e))),
    row.marks.easy,
    range,
  )
  const rates = bandRates(points, edges, row.axis.short)
  // A strip that mixes eras says so: the order of days carries across
  // instruments, the numbers do not (specs/27-one-ozone.md).
  const eras = SOURCE_SCOPED_VARIABLES.has(row.variable)
    ? [...new Set(points.map((p) => sourceWord(p.source)))]
    : []
  const eraNote =
    eras.length > 1
      ? eras
          .map((era) => `${points.filter((p) => sourceWord(p.source) === era).length} on ${era}`)
          .join(', ')
      : null
  const INK: Record<Rating, string> = { 1: 'var(--l1)', 2: 'var(--l2)', 3: 'var(--l3)', 4: 'var(--l4)' }
  return (
    <div className="evidence-detail">
      <svg
        className="evidence-strip"
        viewBox="0 0 340 40"
        role="img"
        aria-label={`${points.length} days along the ${row.name.toLowerCase()} scale.${
          rates.length ? ' ' + rates.map((r) => `${r.label}: ${r.easy} of ${r.total} easy.`).join(' ') : ''
        }`}
      >
        <line x1={X0} y1={32} x2={X1} y2={32} stroke="var(--hairline)" strokeWidth={1} />
        {row.marks.easy !== undefined && (
          <line
            x1={x(row.marks.easy)}
            y1={6}
            x2={x(row.marks.easy)}
            y2={34}
            stroke="var(--l2)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
        {row.marks.trigger !== undefined && (
          <line
            x1={x(row.marks.trigger)}
            y1={6}
            x2={x(row.marks.trigger)}
            y2={34}
            stroke="var(--ink)"
            strokeWidth={1}
          />
        )}
        {dots.map(({ point, x: px, stack }, i) => {
          const cy = 26 - stack * 7
          return point.rating === 1 ? (
            <circle
              key={i}
              cx={px.toFixed(1)}
              cy={cy}
              r={3.2}
              fill="var(--card)"
              stroke="var(--l2)"
              strokeWidth={1.4}
            />
          ) : (
            <circle key={i} cx={px.toFixed(1)} cy={cy} r={3.6} fill={INK[point.rating]} />
          )
        })}
      </svg>
      <div className="evidence-axis" aria-hidden="true">
        <span>{row.axis.short(range.lo)}</span>
        <span>{row.axis.short(range.hi)}</span>
      </div>
      {rates.length > 0 && (
        <span className="evidence-rates">
          {rates.map((r, i) => (
            <Fragment key={r.label}>
              {i > 0 && <span className="evidence-sep"> · </span>}
              <b>{r.label}:</b> {r.easy} of {r.total} easy
            </Fragment>
          ))}
        </span>
      )}
      {eraNote && <span className="evidence-note">{eraNote}.</span>}
    </div>
  )
}

/* --- conflicts --- */

function ConflictCard({
  conflict,
  entry,
  onTag,
  onNote,
  onLeave,
}: {
  conflict: Conflict
  entry: DiaryEntry | undefined
  onTag: (entryId: string, tag: string) => void
  onNote: (entryId: string, note: string) => void
  onLeave: (entryId: string) => void
}) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState(entry?.note ?? '')
  if (!entry) return null
  const when = new Date(entry.time).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  return (
    <section className="conflict-card" id={`conflict-${conflict.entryIndex}`}>
      <span className="conflict-text">
        <strong>
          {when} {conflict.kind === 'sensitivity-shift' ? 'changed what I count as tolerable' : 'does not add up'}.
        </strong>{' '}
        {conflict.kind === 'sensitivity-shift'
          ? `You rated it ${levelWord(entry.rating)} in air you had handled fine before, and that has now happened more than once. Your recent days win: I have lowered what counts as proven-tolerable and re-read your logs.`
          : conflict.kind === 'unmodeled-trigger'
            ? `You rated it ${levelWord(entry.rating)}, but everything I track sat at levels you have handled fine. Was something else going on?`
            : `You rated it ${levelWord(entry.rating)}, but you have since handled more of everything elevated that day. Newer evidence wins — if something else explains it, tag it.`}
      </span>
      <div className="chip-row">
        {CONFLICT_TAGS.map((tag) => (
          <button key={tag} type="button" className="chip" onClick={() => onTag(entry.id, tag)}>
            {tag}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => onLeave(entry.id)}>
          leave it
        </button>
        <button type="button" className="chip" onClick={() => setNoteOpen((v) => !v)}>
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
          onBlur={() => onNote(entry.id, note.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onNote(entry.id, note.trim())
              setNoteOpen(false)
            }
          }}
        />
      )}
    </section>
  )
}

/* --- entries --- */

function groupByDay(diary: DiaryEntry[]): { label: string; entries: DiaryEntry[] }[] {
  const sorted = [...diary].sort((a, b) => b.time.localeCompare(a.time))
  const dayLabel = (iso: string): string => {
    const date = new Date(iso)
    const now = new Date()
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const days = Math.round((startOf(now) - startOf(date)) / 86_400_000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  const groups: { label: string; entries: DiaryEntry[] }[] = []
  for (const entry of sorted) {
    const label = dayLabel(entry.time)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.entries.push(entry)
    else groups.push({ label, entries: [entry] })
  }
  return groups
}

const OBSERVATION_LABELS: Record<string, string> = {
  'worse-outdoors': 'worse outdoors',
  exercising: 'exercising',
  // The traffic mixture — ultrafines and black carbon, which decay within a
  // few hundred metres of a road and which no public network measures — is
  // invisible in the PM2.5 field (Karner 2010; specs/24-vector-diet.md).
  // Recorded and not read, like `exercising`.
  'near-traffic': 'near traffic',
}

/** "PM2.5 38 · ozone 165 — “walk cut short at the park”" */
function exposureLine(entry: DiaryEntry, tempUnit: TemperatureUnit): string {
  if (isPending(entry)) {
    const waiting = 'air readings still to come'
    return entry.note ? `${waiting} — “${entry.note}”` : waiting
  }
  const parts: { ratio: number; text: string }[] = []
  // `pm10` and `no2` are still on this list after spec 24 took them out of the
  // vector, and that is the point: this line reads an entry back to the person
  // who logged it, and an entry logged in August carries its NO₂ whatever the
  // model does with the name now. A new entry simply has neither key and drops
  // through. Each part is ranked by its share of the level-2 prior, which is
  // why the retired rows stay in config too. `smoke` joins them in spec 25 for
  // the live reason rather than the historical one: an entry logged under a
  // plume carries the density, and a line that read back "PM2.5 20" and left
  // the smoke out would be describing the day by its least specific half.
  // `mold` joins on the smoke argument (specs/28-mold.md): an entry logged on
  // a 50,000-spore day carries the count, and a line reading back "PM2.5 12"
  // alone would describe that day by the one number that was fine. The genus
  // variables stay off it — they are inside the total by construction, and
  // three mold parts would crowd out everything else the line has to say. The
  // proxy stays off it too: it is an index of weather conditions, and a
  // read-back line is for the numbers somebody measured. `so2` joins on the
  // live reason as of spec 29, and the ranking is what keeps it honest: a
  // background hour is a fortieth of its level-2 prior and never survives the
  // top three, so the name shows up in the read-back exactly when the day it
  // is reading back had SO₂ in it.
  for (const key of ['pm25', 'o3', 'so2', 'smoke', 'mold', 'pm10', 'no2'] as const) {
    const v = entry.exposure[key] ?? 0
    const prior = PRIORS[key]?.[2] ?? 1
    if (v > 0) {
      const short = VARIABLE_LABELS[key]?.short ?? key
      parts.push({ ratio: v / prior, text: `${short} ${Math.round(v)}` })
    }
  }
  for (const key of POLLEN_VARIABLES) {
    const v = entry.exposure[key] ?? 0
    const prior = PRIORS[key]?.[2] ?? 1
    if (v > 0) {
      parts.push({ ratio: v / prior, text: `${VARIABLE_LABELS[key]!.short} ${Math.round(v)}` })
    }
  }
  // The weather part of the line is one dew point, folded back out of
  // whichever side is active. An entry logged before spec 23 has neither
  // feature and falls through to the temperature it was logged with, off the
  // old 25/10 anchors — the number it showed the day it was saved.
  const dry = entry.exposure.dry_air ?? 0
  const humid = entry.exposure.humid_heat ?? 0
  const heat = entry.exposure.heat_stress ?? 0
  const cold = entry.exposure.cold_dry_stress ?? 0
  const weather: { stress: number; variable: string; celsius: number } | null =
    dry > 0
      ? { stress: dry, variable: 'dry_air', celsius: 11 - dry }
      : humid > 0
        ? { stress: humid, variable: 'humid_heat', celsius: 18 + humid }
        : heat > 0
          ? { stress: heat, variable: 'heat_stress', celsius: 25 + heat }
          : cold > 0
            ? { stress: cold, variable: 'cold_dry_stress', celsius: 10 - cold }
            : null
  if (weather) {
    parts.push({
      ratio: weather.stress / (PRIORS[weather.variable]?.[2] ?? 1),
      text: `${Math.round(displayTemperature(weather.celsius, tempUnit))}°${tempUnit}`,
    })
  }
  const line = parts
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3)
    .map((p) => p.text)
    .join(' · ')
  return entry.note ? `${line}${line ? ' — ' : ''}“${entry.note}”` : line
}

function EntryRow({
  entry,
  tempUnit,
  conflictIndex,
}: {
  entry: DiaryEntry
  tempUnit: TemperatureUnit
  conflictIndex: number | undefined
}) {
  const when = new Date(entry.time).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  // `sick` reads off the exposure vector now rather than the confounder list
  // (specs/26-sick-as-signal.md), and shows in the same place it always did —
  // the chip moved kinds, not position. It is deliberately absent from the
  // exposure line below: "sick 1" is not a reading of anything.
  const tags = [
    ...(entry.observations ?? []).map((o) => OBSERVATION_LABELS[o] ?? o),
    ...(isSick(entry) ? [VARIABLE_LABELS.viral!.short] : []),
    ...(entry.confounders ?? []),
  ]
  return (
    <div className="entry-row">
      <LevelPill level={entry.rating} variant="entry" />
      <div className="entry-body">
        <span className="entry-when">
          {when}
          {tags.map((tag) => (
            <span key={tag} className="entry-tag">
              · {tag}
            </span>
          ))}
          {conflictIndex !== undefined && (
            <button
              type="button"
              className="entry-conflict-link"
              onClick={() =>
                document
                  .getElementById(`conflict-${conflictIndex}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }
            >
              · does not add up ↑
            </button>
          )}
        </span>
        <span className="entry-exposures">{exposureLine(entry, tempUnit)}</span>
      </div>
    </div>
  )
}
