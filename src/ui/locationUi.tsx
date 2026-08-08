/** The card that stands in for air the app has no honest way to show. */
import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { track } from './analytics'
import type { LocationGap } from './useExposureSeries'

const WHY: Record<LocationGap, string> = {
  denied: 'This site is blocked from seeing where you are.',
  'no-answer': 'Your device has not answered yet.',
  unsupported: 'This browser will not share a location.',
}

/**
 * Shown instead of a forecast — and instead of the quick-log card — whenever the
 * air on screen would not be the air the user is breathing. A rating logged
 * against someone else's town is worse than no rating at all: it goes into the
 * model as evidence and stays there.
 */
export function LocationNeededCard({
  gap,
  asking,
  onRetry,
}: {
  gap: LocationGap
  asking?: boolean
  onRetry: () => void
}) {
  // A denial the browser remembers answers a retry instantly, with no prompt —
  // the tap changes nothing on screen unless we say we heard it.
  const retried = useRef(false)

  useEffect(() => {
    // The reason, never a place — there is no place to report.
    track('Location needed', { reason: gap })
  }, [gap])

  const blocked = gap === 'denied'
  return (
    <section className="card nudge">
      <span className="nudge-title">I can&rsquo;t see your air without a place.</span>
      <span className="nudge-text">
        {WHY[gap]} Guessing one would put readings in front of you from air you never breathed, so
        there is nothing here until you say where.
      </span>
      {blocked && (
        <span className="nudge-text">
          Asking again can&rsquo;t help while the block stands — your browser remembers it and
          won&rsquo;t re-ask. Unblock location for this site (the controls live by the address bar,
          or in Settings on iPhone), then tap below.
        </span>
      )}
      {!asking && retried.current && blocked && (
        <span className="nudge-text">
          Asked again just now — same answer. The block has to be lifted first.
        </span>
      )}
      <div className="nudge-actions">
        <button
          type="button"
          className="nudge-cta"
          disabled={asking}
          onClick={() => {
            retried.current = true
            onRetry()
          }}
        >
          {asking ? 'Asking your browser…' : 'Use my location'}
        </button>
        <Link to="/settings" className="locneed-link">
          Search for a place →
        </Link>
      </div>
    </section>
  )
}
