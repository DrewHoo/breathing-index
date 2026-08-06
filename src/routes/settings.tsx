import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import type { DiaryEntry } from '../engine/types'
import { loadDiary, saveDiary } from '../ui/diaryStorage'
import { loadSettings, saveSettings, type Settings } from '../ui/settings'

export const Route = createFileRoute('/settings')({ component: SettingsScreen })

function SettingsScreen() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [message, setMessage] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const update = (next: Settings) => {
    setSettings(next)
    saveSettings(next)
  }

  const addLocation = (form: HTMLFormElement) => {
    const data = new FormData(form)
    const label = String(data.get('label') ?? '').trim()
    const lat = Number(data.get('lat'))
    const lon = Number(data.get('lon'))
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lon)) return
    update({ ...settings, locations: [...settings.locations, { label, lat, lon }] })
    form.reset()
  }

  const exportDiary = () => {
    const blob = new Blob([JSON.stringify(loadDiary(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `breathing-index-diary-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importDiary = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      if (!Array.isArray(parsed)) throw new Error('not an array')
      const existing = loadDiary()
      const known = new Set(existing.map((e) => e.id))
      const incoming = (parsed as DiaryEntry[]).filter((e) => e.id && !known.has(e.id))
      saveDiary(
        [...existing, ...incoming].sort((a, b) => a.time.localeCompare(b.time)),
      )
      setMessage(`Imported ${incoming.length} new entries (${existing.length} kept).`)
    } catch {
      setMessage("Couldn't read that file — expected a diary JSON export.")
    }
  }

  return (
    <>
      <section className="settings-section">
        <h2 className="section-title">Location</h2>
        <label className="settings-row">
          <input
            type="radio"
            name="location"
            checked={settings.activeLocation === 'auto'}
            onChange={() => update({ ...settings, activeLocation: 'auto' })}
          />
          Follow my location
        </label>
        {settings.locations.map((loc, i) => (
          <label key={`${loc.label}-${i}`} className="settings-row">
            <input
              type="radio"
              name="location"
              checked={settings.activeLocation === i}
              onChange={() => update({ ...settings, activeLocation: i })}
            />
            {loc.label}{' '}
            <span className="hint">
              ({loc.lat}, {loc.lon})
            </span>
            <button
              type="button"
              className="entry-delete"
              aria-label={`remove ${loc.label}`}
              onClick={(e) => {
                e.preventDefault()
                const locations = settings.locations.filter((_, j) => j !== i)
                update({
                  ...settings,
                  locations,
                  activeLocation:
                    settings.activeLocation === i
                      ? 'auto'
                      : typeof settings.activeLocation === 'number' && settings.activeLocation > i
                        ? settings.activeLocation - 1
                        : settings.activeLocation,
                })
              }}
            >
              ×
            </button>
          </label>
        ))}
        <form
          className="location-form"
          onSubmit={(e) => {
            e.preventDefault()
            addLocation(e.currentTarget)
          }}
        >
          <input name="label" placeholder="label" className="note-input" />
          <input name="lat" placeholder="lat" inputMode="decimal" className="note-input" />
          <input name="lon" placeholder="lon" inputMode="decimal" className="note-input" />
          <button type="submit" className="chip">
            add
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h2 className="section-title">Sources</h2>
        <label className="settings-row">
          <input
            type="checkbox"
            checked={settings.airnowEnabled}
            onChange={(e) => update({ ...settings, airnowEnabled: e.target.checked })}
          />
          AirNow measured comparison (US only)
        </label>
        <p className="hint">
          Model data (Open-Meteo) drives predictions; AirNow shows what nearby stations actually
          measured. Disagreement often means hyper-local smoke. PurpleAir sensor support is
          planned.
        </p>
      </section>

      <section className="settings-section">
        <h2 className="section-title">Diary data</h2>
        <div className="chips">
          <button type="button" className="chip" onClick={exportDiary}>
            export JSON
          </button>
          <button type="button" className="chip" onClick={() => fileInput.current?.click()}>
            import JSON
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importDiary(file)
              e.target.value = ''
            }}
          />
        </div>
        {message && <p className="hint">{message}</p>}
        <p className="hint">
          Your diary is stored only in this browser. Export a backup periodically. Import merges
          by entry id, so re-importing the same file is safe.
        </p>
      </section>
    </>
  )
}
