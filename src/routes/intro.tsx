import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { Rating } from '../engine/types'
import { track } from '../ui/analytics'
import { LevelPill } from '../ui/bits'
import { BI_LABELS } from '../ui/labels'
import { loadSettings, saveSettings } from '../ui/settings'

export const Route = createFileRoute('/intro')({ component: Intro })

const LEVELS: Rating[] = [1, 2, 3, 4]

function Intro() {
  const navigate = useNavigate()

  const finish = (choice: 'location' | 'manual') => {
    saveSettings({ ...loadSettings(), introSeen: true, activeLocation: 'auto' })
    track('Intro dismissed', { choice })
    if (choice === 'location') {
      // Surface the permission prompt now; useExposureSeries picks the fix up.
      navigator.geolocation?.getCurrentPosition(
        () => undefined,
        () => undefined,
        { timeout: 5000 },
      )
      void navigate({ to: '/' })
    } else {
      void navigate({ to: '/settings' })
    }
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
