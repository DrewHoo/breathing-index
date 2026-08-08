import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { Rating } from '../engine/types'
import { track } from '../ui/analytics'
import { LevelPill } from '../ui/bits'
import { hasStoredDiary, loadDiary, saveDiary } from '../ui/diaryStorage'
import { mergeDiary, parseDiaryImport } from '../ui/diaryTransfer'
import { clearSentinel, sentinelInIndexedDb, sentinelInLocalStorage } from '../ui/durability'
import { BI_LABELS, DISCLAIMER } from '../ui/labels'
import { loadSettings, saveSettings } from '../ui/settings'

export const Route = createFileRoute('/intro')({ component: Intro })

const LEVELS: Rating[] = [1, 2, 3, 4]

function Intro() {
  const navigate = useNavigate()
  // A sentinel outliving the diary means this browser cleared it. Showing the
  // welcome then would tell someone who lost four months that they are new here.
  const [evicted, setEvicted] = useState(() => !hasStoredDiary() && sentinelInLocalStorage())

  useEffect(() => {
    if (evicted || hasStoredDiary()) return
    void sentinelInIndexedDb().then((found) => {
      if (found && !hasStoredDiary()) setEvicted(true)
    })
  }, [evicted])

  const finish = (choice: 'location' | 'manual') => {
    saveSettings({ ...loadSettings(), introSeen: true, activeLocation: 'auto' })
    track('Intro dismissed', { choice })
    if (choice === 'location') {
      // Surface the permission prompt now; useExposureSeries picks the fix up.
      // 30 s because the dialog is user-paced: 5 s expired while it was still on
      // screen, and the expiry read as a refusal the user never made. Nothing to
      // do with either outcome here — the home screen asks again and says what
      // happened.
      navigator.geolocation?.getCurrentPosition(
        () => undefined,
        () => undefined,
        { timeout: 30_000 },
      )
      void navigate({ to: '/' })
    } else {
      void navigate({ to: '/settings' })
    }
  }

  if (evicted) {
    return (
      <Restore
        onRestored={() => {
          saveSettings({ ...loadSettings(), introSeen: true })
          void navigate({ to: '/diary' })
        }}
        onStartOver={() => {
          clearSentinel()
          setEvicted(false)
        }}
      />
    )
  }

  return (
    <div className="intro">
      <span className="wordmark">Breathing Index 🫁</span>
      <div className="intro-headline">The AQI isn&rsquo;t calibrated for your lungs.</div>
      <p className="intro-body">
        It&rsquo;s an average of averages, tuned to an average person — it can&rsquo;t know that
        smoke gets you and ozone doesn&rsquo;t, or the other way round. Your lungs know; they just
        don&rsquo;t publish.
      </p>
      <p className="intro-body">
        This app takes their side of the story. Rate your breathing when you think of it, 1 to 4,
        and it learns your triggers from what you tap — then starts telling you what tomorrow will
        feel like:
      </p>
      <div className="intro-levels">
        {LEVELS.map((level) => (
          <div key={level} className="intro-level-row">
            <LevelPill level={level} variant="wide" numbered />
            <span className="intro-level-meaning">{BI_LABELS[level].meaning}</span>
          </div>
        ))}
      </div>
      <p className="intro-privacy">Your diary never leaves this phone. No account, no cloud.</p>
      <p className="intro-privacy disclaimer">{DISCLAIMER}</p>
      <p className="intro-privacy">
        <a href="/why-aqi-lies-to-your-lungs">Read the long version of that first line &rarr;</a>
      </p>
      <p className="intro-privacy">
        <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
      </p>
      <div className="intro-cta-block">
        <button type="button" className="intro-cta" onClick={() => finish('location')}>
          Use my location
        </button>
        <button type="button" className="intro-alt" onClick={() => finish('manual')}>
          or pick a place by hand →
        </button>
      </div>
    </div>
  )
}

/** Shown in place of the intro when the diary was cleared out from under us. */
function Restore({
  onRestored,
  onStartOver,
}: {
  onRestored: () => void
  onStartOver: () => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    track('Diary eviction seen')
  }, [])

  const restore = async (file: File) => {
    const parsed = parseDiaryImport(await file.text())
    if (!parsed.ok) {
      setMessage(parsed.reason)
      return
    }
    const { merged, added } = mergeDiary(loadDiary(), parsed.entries)
    if (!saveDiary(merged)) {
      setMessage('This browser refused the write. Free some space and try again.')
      return
    }
    track('Diary restored', { entries: added.length })
    onRestored()
  }

  return (
    <div className="intro">
      <span className="wordmark">Breathing Index 🫁</span>
      <div className="intro-headline">
        Your diary is gone from this browser — restore from a backup?
      </div>
      <p className="intro-body">
        You logged entries here before; this browser cleared them. Safari wipes stored data for
        sites you haven&rsquo;t opened in a week, and &ldquo;Clear History and Website Data&rdquo;
        takes everything. Nothing was ever sent anywhere, so there is nothing to fetch back.
      </p>
      <p className="intro-body">
        If you exported a backup, load the JSON file and your history returns intact.
      </p>
      <p className="intro-privacy">
        Adding the app to your home screen is what stops this happening again.
      </p>
      {message && <p className="intro-privacy">{message}</p>}
      <input
        ref={fileInput}
        type="file"
        accept="application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void restore(file)
          e.target.value = ''
        }}
      />
      <div className="intro-cta-block">
        <button type="button" className="intro-cta" onClick={() => fileInput.current?.click()}>
          Restore from a backup
        </button>
        <button type="button" className="intro-alt" onClick={onStartOver}>
          or start over with an empty diary →
        </button>
      </div>
    </div>
  )
}
