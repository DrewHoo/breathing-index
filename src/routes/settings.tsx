import { Link, createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import type { DiaryEntry } from '../engine/types'
import { SectionRule } from '../ui/bits'
import { loadDiary, saveDiary } from '../ui/diaryStorage'
import { loadSettings, saveSettings, type Settings, type UnitPreference } from '../ui/settings'
import { detectTemperatureUnit } from '../ui/units'
import { useExposureSeries } from '../ui/useExposureSeries'

export const Route = createFileRoute('/settings')({ component: SettingsScreen })

function SettingsScreen() {
  const { location } = useExposureSeries()
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const entryCount = loadDiary().length

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
    setAdding(false)
  }

  const removeLocation = (i: number) => {
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
      saveDiary([...existing, ...incoming].sort((a, b) => a.time.localeCompare(b.time)))
      setMessage(`Imported ${incoming.length} new entries (${existing.length} kept).`)
    } catch {
      setMessage('Could not read that file — expected a diary JSON export.')
    }
  }

  const unitOptions: { value: UnitPreference; label: string }[] = [
    { value: 'auto', label: `Match region (°${detectTemperatureUnit()})` },
    { value: 'fahrenheit', label: '°F' },
    { value: 'celsius', label: '°C' },
  ]

  return (
    <>
      <span className="page-title">Settings</span>

      <section className="section">
        <SectionRule label="Location" />
        <div className="row-card">
          <button
            type="button"
            className="settings-row"
            onClick={() => update({ ...settings, activeLocation: 'auto' })}
          >
            <span className={`radio${settings.activeLocation === 'auto' ? ' on' : ''}`} />
            <span className="settings-row-label">Follow my location</span>
            {settings.activeLocation === 'auto' && (
              <span className="settings-row-hint">
                {location.label.replace(' (default)', '')} now
              </span>
            )}
          </button>
          {settings.locations.map((loc, i) => (
            <div key={`${loc.label}-${i}`} className="settings-row">
              <button
                type="button"
                style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minHeight: 42 }}
                onClick={() => update({ ...settings, activeLocation: i })}
              >
                <span className={`radio${settings.activeLocation === i ? ' on' : ''}`} />
                <span className="settings-row-label">{loc.label}</span>
              </button>
              <button type="button" className="row-action" onClick={() => removeLocation(i)}>
                remove
              </button>
            </div>
          ))}
          {adding ? (
            <form
              className="location-form"
              onSubmit={(e) => {
                e.preventDefault()
                addLocation(e.currentTarget)
              }}
            >
              <input name="label" placeholder="name" className="note-input" />
              <input name="lat" placeholder="lat" inputMode="decimal" className="note-input" />
              <input name="lon" placeholder="lon" inputMode="decimal" className="note-input" />
              <button type="submit" className="location-form-add">
                add
              </button>
            </form>
          ) : (
            <button type="button" className="settings-row" onClick={() => setAdding(true)}>
              <span className="radio-plus">+</span>
              <span className="settings-row-label accent">Add a place</span>
            </button>
          )}
        </div>
      </section>

      <section className="section">
        <SectionRule label="Sources" />
        <div className="row-card">
          <div className="settings-row tall">
            <div className="settings-row-sub">
              <span className="settings-row-label">Open-Meteo model</span>
              <span className="settings-row-hint">drives predictions · worldwide, no key</span>
            </div>
            <span className="settings-row-hint">default</span>
          </div>
          <div className="settings-row tall">
            <div className="settings-row-sub">
              <span className="settings-row-label">AirNow station comparison</span>
              <span className="settings-row-hint">
                US only · disagreement often means local smoke
              </span>
            </div>
            <button
              type="button"
              className={`toggle${settings.airnowEnabled ? ' on' : ''}`}
              role="switch"
              aria-checked={settings.airnowEnabled}
              aria-label="AirNow station comparison"
              onClick={() => update({ ...settings, airnowEnabled: !settings.airnowEnabled })}
            >
              <span className="toggle-knob" />
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <SectionRule label="Temperature" />
        <div className="segmented">
          {unitOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`segment${settings.units === opt.value ? ' on' : ''}`}
              onClick={() => update({ ...settings, units: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="settings-note">
          Display only — your diary always stores metric, so switching never rewrites history.
        </span>
      </section>

      <section className="section">
        <SectionRule label="Your diary" />
        <div className="row-card">
          <button type="button" className="settings-row" onClick={exportDiary}>
            <span className="settings-row-label">Export backup</span>
            <span className="settings-row-hint">
              {entryCount} {entryCount === 1 ? 'entry' : 'entries'} · JSON
            </span>
          </button>
          <button type="button" className="settings-row" onClick={() => fileInput.current?.click()}>
            <span className="settings-row-label">Import</span>
            <span className="settings-row-hint">merges by entry, safe to repeat</span>
          </button>
        </div>
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
        {message && <span className="settings-note">{message}</span>}
        <span className="settings-note">
          Everything lives in this browser only. Export a backup now and then.
        </span>
      </section>

      <Link to="/intro" className="settings-footer" style={{ textDecoration: 'none' }}>
        <span className="settings-row-label accent">
          What is this app? — the two-minute version
        </span>
        <span className="settings-footer-chevron">▸</span>
      </Link>
    </>
  )
}
