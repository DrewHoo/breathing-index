import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { buildModel } from '../engine/infer'
import type { Conflict, DiaryEntry, Rating } from '../engine/types'
import { loadDiary, saveDiary } from '../ui/diaryStorage'
import { BI_LABELS, variableName } from '../ui/labels'
import { useExposureSeries } from '../ui/useExposureSeries'

export const Route = createFileRoute('/diary')({ component: Diary })

const RATINGS: Rating[] = [1, 2, 3, 4]
const CONFOUNDERS = ['sick', 'allergies', 'exercised hard', 'mostly indoors', 'traveling']

function Diary() {
  const { location, series, error } = useExposureSeries()
  const [diary, setDiary] = useState<DiaryEntry[]>(loadDiary)
  const [pending, setPending] = useState<Rating | null>(null)
  const [confounders, setConfounders] = useState<string[]>([])
  const [note, setNote] = useState('')

  const model = useMemo(() => buildModel(diary), [diary])

  const update = (next: DiaryEntry[]) => {
    setDiary(next)
    saveDiary(next)
  }

  const save = () => {
    if (pending === null || !series) return
    const hour = series.hours[series.currentIndex]
    if (!hour) return
    const entry: DiaryEntry = {
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
      rating: pending,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(confounders.length ? { confounders } : {}),
      exposure: hour.exposure,
      official: hour.official,
    }
    update([...diary, entry])
    setPending(null)
    setConfounders([])
    setNote('')
  }

  const addConfounder = (entryId: string, tag: string) => {
    update(
      diary.map((e) =>
        e.id === entryId ? { ...e, confounders: [...(e.confounders ?? []), tag] } : e,
      ),
    )
  }

  const remove = (entryId: string) => {
    update(diary.filter((e) => e.id !== entryId))
  }

  return (
    <>
      <section className="log-card">
        <h1 className="section-title">How's breathing right now?</h1>
        <div className="rating-buttons">
          {RATINGS.map((r) => (
            <button
              key={r}
              type="button"
              className={`rating-button bi-border-${r}${pending === r ? ' selected' : ''}`}
              onClick={() => setPending(pending === r ? null : r)}
            >
              <span className={`rating-digit bi-${r}`}>{r}</span>
              <span className="rating-label">{BI_LABELS[r].label}</span>
            </button>
          ))}
        </div>
        {pending !== null && (
          <div className="log-details">
            <p className="bi-meaning">{BI_LABELS[pending].meaning}</p>
            <div className="chips">
              {CONFOUNDERS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`chip${confounders.includes(tag) ? ' chip-on' : ''}`}
                  onClick={() =>
                    setConfounders((cur) =>
                      cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag],
                    )
                  }
                >
                  {tag}
                </button>
              ))}
            </div>
            {confounders.length > 0 && (
              <p className="hint">
                Tagged entries stay in your diary but aren't used to learn your triggers.
              </p>
            )}
            <input
              className="note-input"
              placeholder="note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="button" className="save-button" disabled={!series} onClick={save}>
              {series
                ? `Save with current air (${location.label})`
                : error
                  ? 'No exposure data — try again'
                  : 'Fetching current air…'}
            </button>
          </div>
        )}
      </section>

      {model.conflicts.length > 0 && (
        <section>
          <h2 className="section-title">Conflicts</h2>
          {model.conflicts.map((conflict) => (
            <ConflictCard
              key={conflict.entryIndex}
              conflict={conflict}
              entry={diary[conflict.entryIndex]}
              onTag={addConfounder}
            />
          ))}
        </section>
      )}

      <section>
        <h2 className="section-title">Entries ({diary.length})</h2>
        {diary.length === 0 && (
          <p className="hint">
            No entries yet. Log good days too: a rating of 1 records that you tolerated everything
            in today's air.
          </p>
        )}
        {[...diary].reverse().map((entry) => (
          <EntryRow key={entry.id} entry={entry} onDelete={remove} />
        ))}
      </section>
    </>
  )
}

function ConflictCard({
  conflict,
  entry,
  onTag,
}: {
  conflict: Conflict
  entry: DiaryEntry | undefined
  onTag: (entryId: string, tag: string) => void
}) {
  if (!entry) return null
  const when = new Date(entry.time).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  return (
    <div className="conflict-card">
      {conflict.kind === 'unmodeled-trigger' ? (
        <p>
          Nothing I track explains your {when} rating of {entry.rating} — every measured variable
          was at a level you've tolerated before. Was something else going on?
        </p>
      ) : (
        <p>
          Your {when} rating of {entry.rating} clashes with newer evidence — you've since tolerated
          higher levels of everything elevated that day. Newer evidence wins; this entry isn't used
          for learning. If something else explains it, tag it:
        </p>
      )}
      <div className="chips">
        {CONFOUNDERS.map((tag) => (
          <button key={tag} type="button" className="chip" onClick={() => onTag(entry.id, tag)}>
            {tag}
          </button>
        ))}
      </div>
    </div>
  )
}

function EntryRow({
  entry,
  onDelete,
}: {
  entry: DiaryEntry
  onDelete: (id: string) => void
}) {
  const when = new Date(entry.time).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const highlights = Object.entries(entry.exposure)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([variable, v]) => `${variableName(variable)} ${Math.round(v)}`)
    .join(' · ')
  return (
    <div className="entry-row">
      <span className={`entry-chip bi-bg-${entry.rating}`}>{entry.rating}</span>
      <div className="entry-body">
        <div className="entry-when">
          {when}
          {entry.confounders?.map((tag) => (
            <span key={tag} className="entry-tag">
              {tag}
            </span>
          ))}
        </div>
        <div className="entry-exposures">{highlights}</div>
        {entry.note && <div className="entry-note">{entry.note}</div>}
      </div>
      <button
        type="button"
        className="entry-delete"
        aria-label="delete entry"
        onClick={() => onDelete(entry.id)}
      >
        ×
      </button>
    </div>
  )
}
