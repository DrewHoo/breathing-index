import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { loadDiary } from '../ui/diaryStorage'
import { eaqiCategory, usAqiCategory, usAqiSoundsFine } from '../ui/officialScales'

export const Route = createFileRoute('/scoreboard')({ component: Scoreboard })

function Scoreboard() {
  const diary = useMemo(loadDiary, [])
  const rows = diary.filter((e) => e.official?.usAqi != null || e.official?.eaqi != null)

  const misses = rows.filter(
    (e) => e.rating >= 3 && e.official?.usAqi != null && usAqiSoundsFine(e.official.usAqi),
  ).length

  return (
    <>
      <h1 className="section-title">Official indices vs. your ratings</h1>
      <p className="hint">
        Each logged day beside what the official composite indices (US AQI, EU EAQI, NL LKI)
        reported for it. This is the only screen in the app where those indices appear.
      </p>
      {rows.length === 0 ? (
        <p className="hint">
          No entries with official readings yet — new diary entries capture them automatically.
        </p>
      ) : (
        <>
          {misses > 0 && (
            <p className="scoreboard-verdict">
              {misses} of your {rows.length} logged {rows.length === 1 ? 'entry' : 'entries'} rated
              3+ while officials said "Moderate" or better.
            </p>
          )}
          <table className="scoreboard">
            <thead>
              <tr>
                <th>When</th>
                <th>US AQI</th>
                <th>EAQI</th>
                <th>You</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((e) => (
                <tr key={e.id}>
                  <td>
                    {new Date(e.time).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td>
                    {e.official?.usAqi != null
                      ? `${Math.round(e.official.usAqi)} ${usAqiCategory(e.official.usAqi)}`
                      : '—'}
                  </td>
                  <td>
                    {e.official?.eaqi != null
                      ? `${Math.round(e.official.eaqi)} ${eaqiCategory(e.official.eaqi)}`
                      : '—'}
                  </td>
                  <td>
                    <span className={`entry-chip bi-bg-${e.rating}`}>{e.rating}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}
