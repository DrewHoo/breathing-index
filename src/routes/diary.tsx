import { Link, createFileRoute } from '@tanstack/react-router'
import { Fragment, useMemo, useState } from 'react'
import { glossaryKeyFor } from '../content/glossary'
import { PRIORS, negligibleFor } from '../engine/config'
import { buildModel } from '../engine/infer'
import type { Conflict, DiaryEntry, TriggerModel } from '../engine/types'
import { POLLEN_PLANT_VARIABLES } from '../sources/pollenPlants'
import { track } from '../ui/analytics'
import { LevelPill, SectionRule } from '../ui/bits'
import { loadDiary, saveDiary } from '../ui/diaryStorage'
import { conflictKey, dismissConflict, dismissedConflicts } from '../ui/dismissed'
import { BackupChip } from '../ui/durabilityUi'
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

      <section className="section">
        <SectionRule label="What your logs show" />
        <div className="row-card">
          {evidenceRows(model, tempUnit).map((row) => {
            // Retired variables have no entry and get no `?`: the name is kept
            // so an old entry renders as words, and there is nothing left to
            // explain about a measurement the app stopped taking.
            const entry = glossaryKeyFor(row.variable)
            return (
              <div key={row.name} className="evidence-row">
                <span className={`evidence-glyph ${row.cls}`}>{row.glyph}</span>
                <span className="evidence-name">{row.name}</span>
                {entry ? help(entry, row.name) : null}
                <span className="evidence-text">{row.text}</span>
              </div>
            )
          })}
        </div>
        {sheet}
      </section>

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

interface EvidenceRowData {
  name: string
  /**
   * The exposure variable the row is about, so the `?` beside its name can
   * find the entry that explains it (specs/30-glossary.md §6). The name alone
   * would not do: "Alternaria" and "Mold" are two rows and one entry, and the
   * retired names have none at all. `summarize` carries it out, since it is
   * the one thing every caller already had to pass in.
   */
  variable: string
  glyph: string
  cls: string
  text: string
}

function evidenceRows(model: TriggerModel, tempUnit: TemperatureUnit): EvidenceRowData[] {
  // Every weather feature is a distance from a threshold, and nobody can
  // picture a distance. Fold it back through the threshold it was measured
  // from and the row reads as air a person could stand outside in.
  const fmtAt = (celsius: number): string =>
    `${Math.round(displayTemperature(celsius, tempUnit))} °${tempUnit}`
  const summarize = (variable: string, fmt: (v: number) => string): Omit<EvidenceRowData, 'name'> => {
    const confirmed = model.confirmed[variable]
    const level = ([4, 3, 2] as const).find((l) => confirmed?.[l] !== undefined)
    const tol = model.tolerance[variable]?.[2]
    const hasTol = tol !== undefined && tol > negligibleFor(variable)
    if (level !== undefined) {
      return {
        variable,
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
        variable,
        glyph: '◐',
        cls: 'suspect',
        text: `suspect — one day points at it near ${fmt(oneDay.bound)}`,
      }
    }
    if (model.constraints.some((c) => c.candidates.includes(variable))) {
      return { variable, glyph: '◐', cls: 'suspect', text: 'suspect — never seen it act alone' }
    }
    if (hasTol) {
      return { variable, glyph: '○', cls: 'fine', text: `fine in everything up to ${fmt(tol)}` }
    }
    return { variable, glyph: '◌', cls: '', text: 'no evidence yet either way' }
  }

  const bare = (v: number) => `${Math.round(v)}`
  const rows: EvidenceRowData[] = [
    { name: variableName('pm25'), ...summarize('pm25', bare) },
    { name: variableName('o3'), ...summarize('o3', bare) },
    // Both bounds are dew points once folded back: dry air is counted down
    // from 11 °C, humid heat up from 18 °C (specs/23-dew-point-air.md).
    { name: variableName('dry_air'), ...summarize('dry_air', (v) => fmtAt(11 - v)) },
    { name: variableName('humid_heat'), ...summarize('humid_heat', (v) => fmtAt(18 + v)) },
  ]
  // Smoke is live but conditional, which is a third case and worth naming
  // (specs/25-smoke-variable.md). The four rows above are standing because the
  // air always has some of each in it: a week of ordinary days gets every one
  // of them past "no evidence yet either way" on its own. Smoke does not work
  // like that. Its floor is 0 and most people's every entry carries a 0, so a
  // standing row would read "no evidence yet either way" on every screen for
  // years, which is the panel promising a verdict it has no way to reach.
  //
  // The test the retired names and pollen already use says exactly the right
  // thing here without any new machinery: a row appears once the diary holds a
  // verdict. For smoke the two are the same question — a 0 can neither be a
  // suspect (it is at the floor) nor raise a tolerance (same), so the row shows
  // up precisely when some entry was logged under a real plume, good day or
  // bad. The number wears its scale, because "near 2" means nothing and
  // "near 2 of 3" is a thing a person can picture.
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
  // Variables that have left the vector: the weather stresses in spec 23, PM10
  // and NO₂ in spec 24. They earn a row only while an old entry still has
  // something to say about one — the same rule pollen follows, and the reason
  // the names survive in config and labels at all. A standing row for any of
  // them would promise a verdict that is never coming: nothing logged from now
  // on carries the name, so the panel would be advertising evidence the app
  // has stopped collecting.
  const retired: [string, (v: number) => string][] = [
    ['pm10', bare],
    ['no2', bare],
    ['heat_stress', (v) => fmtAt(25 + v)],
    ['cold_dry_stress', (v) => fmtAt(10 - v)],
    ['humidity', (v) => `${Math.round(v)}%`],
  ]
  for (const [variable, fmt] of retired) {
    const row = summarize(variable, fmt)
    if (row.cls !== '') rows.push({ name: variableName(variable), ...row })
  }
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
