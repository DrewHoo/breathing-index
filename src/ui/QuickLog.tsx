import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { DiaryEntry, Rating } from '../engine/types'
import { BI_LABELS } from './labels'

export const RATINGS: Rating[] = [1, 2, 3, 4]

/** The 1–4 row. Shared by the home screen's quick log and the diary screen. */
export function RatingButtons({
  selected,
  onSelect,
}: {
  selected: Rating | null
  onSelect: (rating: Rating) => void
}) {
  return (
    <div className="rating-buttons">
      {RATINGS.map((rating) => (
        <button
          key={rating}
          type="button"
          className={`rating-button bi-border-${rating}${selected === rating ? ' selected' : ''}`}
          onClick={() => onSelect(rating)}
        >
          <span className={`rating-digit bi-${rating}`}>{rating}</span>
          <span className="rating-label">{BI_LABELS[rating].label}</span>
        </button>
      ))}
    </div>
  )
}

const time = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * Home-screen quick log. Asks for a rating unless the user already answered
 * for this air today, in which case it shows what they said — good days are
 * the most informative entries, so the ask has to be one tap, but asking twice
 * about the same air is just nagging.
 */
export function QuickLog({
  logged,
  onRate,
}: {
  /** today's most recent entry in air like this, if any */
  logged: DiaryEntry | null
  onRate: (rating: Rating) => void
}) {
  const [reopened, setReopened] = useState(false)

  const rate = (rating: Rating) => {
    setReopened(false)
    onRate(rating)
  }

  if (logged && !reopened) {
    return (
      <section className="log-card quick-log">
        <h2 className="section-title">Today, in air like this</h2>
        <div className="quick-log-answer">
          <span className={`entry-chip bi-bg-${logged.rating}`}>{logged.rating}</span>
          <div className="quick-log-answer-body">
            <div className="quick-log-answer-label">
              You rated it {BI_LABELS[logged.rating].label.toLowerCase()}
            </div>
            <div className="hint">
              logged {time(logged.time)}
              {logged.note ? ` · ${logged.note}` : ''}
            </div>
          </div>
          <button type="button" className="chip" onClick={() => setReopened(true)}>
            log again
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="log-card quick-log">
      <h2 className="section-title">How's breathing right now?</h2>
      <RatingButtons selected={null} onSelect={rate} />
      <p className="hint quick-log-hint">
        One tap logs it against the air right now. Add a note, tags, or a correction in your{' '}
        <Link to="/diary">diary</Link>.
      </p>
    </section>
  )
}
