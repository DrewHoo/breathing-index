/** The two prompts that fight storage loss: install once, back up every ten. */
import { useEffect, useState } from 'react'
import { loadDiary } from './diaryStorage'
import { exportDiary } from './diaryTransfer'
import {
  backupNudgeDue,
  dismissInstallNudge,
  installNudgeDue,
  isIos,
  isStandalone,
  loadDurability,
  snoozeBackupNudge,
  unbackedCount,
} from './durability'

/** Chrome's install hook — not in lib.dom. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Shown once, after the third entry. Installing is the one thing a user can do
 * that changes how the browser treats the diary — on iOS it is the only ITP
 * exemption there is.
 */
export function InstallNudge({ entryCount }: { entryCount: number }) {
  const [gone, setGone] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', capture)
    return () => window.removeEventListener('beforeinstallprompt', capture)
  }, [])

  if (gone || !installNudgeDue(loadDurability(), entryCount, isStandalone())) return null
  // Nothing to offer a desktop browser that never fires the prompt.
  const ios = isIos()
  if (!ios && !installPrompt) return null

  const dismiss = () => {
    dismissInstallNudge()
    setGone(true)
  }

  const install = () => {
    if (!installPrompt) return
    void installPrompt.prompt()
    void installPrompt.userChoice.then(({ outcome }) => {
      if (outcome === 'accepted') dismiss()
    })
  }

  return (
    <section className="card nudge">
      <span className="nudge-title">Keep your logs out of the browser&rsquo;s reach.</span>
      <span className="nudge-text">
        {entryCount} entries in. On the home screen this app is one tap away, and your logs stop
        looking like cache the browser can clear.
      </span>
      <div className="nudge-actions">
        {ios ? (
          <span className="nudge-how">Share&nbsp;↑ → Add to Home Screen</span>
        ) : (
          <button type="button" className="nudge-cta" onClick={install}>
            Install
          </button>
        )}
        <button type="button" className="nudge-dismiss" onClick={dismiss}>
          Not now
        </button>
      </div>
    </section>
  )
}

/**
 * Quiet chip on the Diary screen once ten entries exist nowhere else. Dismissal
 * snoozes it for another ten — the entries are still only on this phone.
 */
export function BackupChip({ entryCount }: { entryCount: number }) {
  const [gone, setGone] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const durability = loadDurability()

  if (note) return <span className="settings-note">{note}</span>
  if (gone || !backupNudgeDue(durability, entryCount)) return null

  const unbacked = unbackedCount(durability, entryCount)

  const backUp = () => {
    void exportDiary(loadDiary()).then((outcome) => {
      if (outcome === 'cancelled') return
      if (outcome === 'failed') {
        setNote('Could not export here — try again from Settings.')
        return
      }
      if (outcome === 'copied') {
        setNote('Copied your logs to the clipboard — paste them somewhere safe.')
        return
      }
      setGone(true)
    })
  }

  return (
    <div className="backup-chip-row">
      <button type="button" className="chip backup-chip" onClick={backUp}>
        {unbacked} entries only live on this phone — back up
      </button>
      <button
        type="button"
        className="row-action"
        onClick={() => {
          snoozeBackupNudge(entryCount)
          setGone(true)
        }}
      >
        later
      </button>
    </div>
  )
}
