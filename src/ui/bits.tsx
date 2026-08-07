import type { ReactNode } from 'react'
import type { Rating } from '../engine/types'
import { BI_LABELS } from './labels'

/** Section label + hairline rule + optional right-aligned annotation. */
export function SectionRule({
  label,
  note,
  faint,
  italic,
}: {
  label: string
  note?: ReactNode
  faint?: boolean
  italic?: boolean
}) {
  return (
    <div className="rule-row">
      <span className="rule-label">{label}</span>
      <span className="rule-line" />
      {note !== undefined && (
        <span className={`rule-note${faint ? ' faint' : ''}${italic ? ' italic' : ''}`}>
          {note}
        </span>
      )}
    </div>
  )
}

/** Severity word pill in the ink system ("Noticeable"). */
export function LevelPill({
  level,
  variant = 'entry',
  numbered,
}: {
  level: Rating
  /** wide = 82px intro rows, entry = 78px diary rows, inline = hug content */
  variant?: 'wide' | 'entry' | 'inline'
  /** prefix the numeral: "1 · Easy" */
  numbered?: boolean
}) {
  return (
    <span className={`level-pill level-pill-${level} ${variant}`}>
      {numbered ? `${level} · ` : ''}
      {BI_LABELS[level].label}
    </span>
  )
}
