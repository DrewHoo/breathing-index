import { Link, createFileRoute } from '@tanstack/react-router'
import { Fragment, useMemo, useState } from 'react'
import { PRIORS, negligibleFor } from '../engine/config'
import { buildModel } from '../engine/infer'
import type { Conflict, DiaryEntry, TriggerModel } from '../engine/types'
import { POLLEN_TYPES } from '../sources/googlePollen'
import { track } from '../ui/analytics'
import { LevelPill, SectionRule } from '../ui/bits'
import { loadDiary, saveDiary } from '../ui/diaryStorage'
import { conflictKey, dismissConflict, dismissedConflicts } from '../ui/dismissed'
import { BackupChip } from '../ui/durabilityUi'
import { VARIABLE_LABELS, levelWord, variableName } from '../ui/labels'
import { isPending, settled } from '../ui/pendingExposure'
import { calendarPollenPatch } from '../ui/pollenTag'
import { displayTemperature, useTemperatureUnit, type TemperatureUnit } from '../ui/units'
import { lastKnownCoords } from '../ui/useExposureSeries'

export const Route = createFileRoute('/diary')({ component: Diary })

const CONFLICT_TAGS = ['pollen', 'sick', 'indoors all day']

/**
 * Both generations of pollen variable: entries logged before spec 18 carry
 * the grains-scale species, everything since carries the index-scale types.
 * Each is judged against its own prior; they never mix scales.
 */
const POLLEN_VARIABLES = [
  ...POLLEN_TYPES,
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

      <section className="section">
        <SectionRule label="What your logs show" />
        <div className="row-card">
          {evidenceRows(model, tempUnit).map((row) => (
            <div key={row.name} className="evidence-row">
              <span className={`evidence-glyph ${row.cls}`}>{row.glyph}</span>
              <span className="evidence-name">{row.name}</span>
              <span className="evidence-text">{row.text}</span>
            </div>
          ))}
        </div>
      </section>

      {conflicts.map((conflict) => (
        <ConflictCard
          key={conflict.entryIndex}
          conflict={conflict}
          entry={modelDiary[conflict.entryIndex]}
          onTag={(id, tag) => {
            const entry = diary.find((e) => e.id === id)
            // "pollen" is the one tag the app can answer instead of filing: it
            // names a variable, and where a calendar season covers that day the
            // entry gets it as an estimate and re-enters inference. Everywhere
            // else — and every other tag — it stays a reason to distrust the day.
            const patch = entry ? calendarPollenPatch(entry, lastKnownCoords()) : null
            if (tag === 'pollen' && patch) amend(id, patch)
            else amend(id, { confounders: [...(entry?.confounders ?? []), tag] })
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

interface EvidenceRowData {
  name: string
  glyph: string
  cls: string
  text: string
}

function evidenceRows(model: TriggerModel, tempUnit: TemperatureUnit): EvidenceRowData[] {
  const fmtTempStress = (side: 'heat_stress' | 'cold_dry_stress', stress: number): string => {
    const celsius = side === 'heat_stress' ? 25 + stress : 10 - stress
    return `${Math.round(displayTemperature(celsius, tempUnit))} °${tempUnit}`
  }
  const summarize = (variable: string, fmt: (v: number) => string): Omit<EvidenceRowData, 'name'> => {
    const confirmed = model.confirmed[variable]
    const level = ([4, 3, 2] as const).find((l) => confirmed?.[l] !== undefined)
    const tol = model.tolerance[variable]?.[2]
    const hasTol = tol !== undefined && tol > negligibleFor(variable)
    if (level !== undefined) {
      return {
        glyph: '●',
        cls: 'trigger',
        text: `trigger — ${levelWord(level)} near ${fmt(confirmed![level]!)}${hasTol ? `, fine up to ${fmt(tol)}` : ''}`,
      }
    }
    // One bad day where this was the lone candidate, but other air was about:
    // a real lead, and not yet a claim the forecast will stand on.
    const oneDay = model.confirmations.find(
      (c) => c.variable === variable && c.strength === 'suspected-strong',
    )
    if (oneDay) {
      return {
        glyph: '◐',
        cls: 'suspect',
        text: `suspect — one day points at it near ${fmt(oneDay.bound)}`,
      }
    }
    if (model.constraints.some((c) => c.candidates.includes(variable))) {
      return { glyph: '◐', cls: 'suspect', text: 'suspect — never seen it act alone' }
    }
    if (hasTol) {
      return { glyph: '○', cls: 'fine', text: `fine in everything up to ${fmt(tol)}` }
    }
    return { glyph: '◌', cls: '', text: 'no evidence yet either way' }
  }

  const bare = (v: number) => `${Math.round(v)}`
  const rows: EvidenceRowData[] = [
    { name: variableName('pm25'), ...summarize('pm25', bare) },
    { name: variableName('o3'), ...summarize('o3', bare) },
    { name: variableName('pm10'), ...summarize('pm10', bare) },
    { name: variableName('no2'), ...summarize('no2', bare) },
    { name: 'Heat', ...summarize('heat_stress', (v) => fmtTempStress('heat_stress', v)) },
    { name: 'Humidity', ...summarize('humidity', (v) => `${Math.round(v)}%`) },
  ]
  const cold = summarize('cold_dry_stress', (v) => fmtTempStress('cold_dry_stress', v))
  if (cold.cls !== '') rows.splice(5, 0, { name: 'Cold, dry', ...cold })
  // Pollen earns a line once the diary has a verdict on a species — named by
  // species, since that is what the evidence is about. Outside Europe it is
  // usually a calendar estimate, which can reach "suspect" and no further.
  for (const variable of POLLEN_VARIABLES) {
    const row = summarize(variable, bare)
    if (row.cls !== '') rows.push({ name: variableName(variable), ...row })
  }
  return rows
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

const OBSERVATION_LABELS: Record<string, string> = { 'worse-outdoors': 'worse outdoors' }

/** "PM2.5 38 · ozone 165 — “walk cut short at the park”" */
function exposureLine(entry: DiaryEntry, tempUnit: TemperatureUnit): string {
  if (isPending(entry)) {
    const waiting = 'air readings still to come'
    return entry.note ? `${waiting} — “${entry.note}”` : waiting
  }
  const parts: { ratio: number; text: string }[] = []
  for (const key of ['pm25', 'o3', 'pm10', 'no2'] as const) {
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
  const heat = entry.exposure.heat_stress ?? 0
  const cold = entry.exposure.cold_dry_stress ?? 0
  if (heat > 0 || cold > 0) {
    const celsius = heat > 0 ? 25 + heat : 10 - cold
    parts.push({
      ratio: (heat > 0 ? heat : cold) / 7,
      text: `${Math.round(displayTemperature(celsius, tempUnit))}°${tempUnit}`,
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
  const tags = [
    ...(entry.observations ?? []).map((o) => OBSERVATION_LABELS[o] ?? o),
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
