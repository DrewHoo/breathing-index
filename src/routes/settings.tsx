import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { searchPlaces, type PlaceResult } from '../sources/geocodeSearch'
import { setAnalyticsEnabled } from '../ui/analytics'
import { SectionRule } from '../ui/bits'
import { DISCLAIMER } from '../ui/labels'
import { loadDiary, saveDiary } from '../ui/diaryStorage'
import { exportDiary, mergeDiary, parseDiaryImport } from '../ui/diaryTransfer'
import {
  loadSettings,
  saveSettings,
  type SavedLocation,
  type Settings,
  type UnitPreference,
} from '../ui/settings'
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

  // One tap adds the place and starts reading its air — nobody searches for
  // somewhere they did not want to look at.
  const addLocation = (place: SavedLocation) => {
    update({
      ...settings,
      locations: [...settings.locations, { label: place.label, lat: place.lat, lon: place.lon }],
      activeLocation: settings.locations.length,
    })
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

  const backUp = async () => {
    const outcome = await exportDiary(loadDiary())
    if (outcome === 'copied') {
      setMessage('Copied your diary to the clipboard — paste it somewhere safe.')
    } else if (outcome === 'failed') {
      setMessage('This browser would not hand the file over. Try again from a browser tab.')
    } else if (outcome !== 'cancelled') {
      setMessage(null)
    }
  }

  const importDiary = async (file: File) => {
    const parsed = parseDiaryImport(await file.text())
    if (!parsed.ok) {
      setMessage(parsed.reason)
      return
    }
    const existing = loadDiary()
    const { merged, added } = mergeDiary(existing, parsed.entries)
    if (!saveDiary(merged)) {
      setMessage('Could not save the import — this browser is out of room.')
      return
    }
    setMessage(`Imported ${added.length} new entries (${existing.length} kept).`)
  }

  const unitOptions: { value: UnitPreference; label: string }[] = [
    { value: 'auto', label: `Match region (°${detectTemperatureUnit()})` },
    { value: 'fahrenheit', label: '°F' },
    { value: 'celsius', label: '°C' },
  ]

  return (
    <>
      <h1 className="page-title">Settings</h1>

      <section className="section">
        <SectionRule label="Location" />
        {/* Buttons with a drawn dot, so the chosen-ness has to be said out
            loud: without role and aria-checked a screen reader hears three
            plain buttons and no answer to "which place am I on?". */}
        <div className="row-card" role="radiogroup" aria-label="Location">
          <button
            type="button"
            className="settings-row"
            role="radio"
            aria-checked={settings.activeLocation === 'auto'}
            onClick={() => update({ ...settings, activeLocation: 'auto' })}
          >
            <span className={`radio${settings.activeLocation === 'auto' ? ' on' : ''}`} aria-hidden />
            <span className="settings-row-label">Follow my location</span>
            {settings.activeLocation === 'auto' && (
              <span className="settings-row-hint">
                {location ? `${location.label} now` : 'no fix yet'}
              </span>
            )}
          </button>
          {settings.locations.map((loc, i) => (
            <div key={`${loc.label}-${i}`} className="settings-row">
              <button
                type="button"
                role="radio"
                aria-checked={settings.activeLocation === i}
                style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minHeight: 44 }}
                onClick={() => update({ ...settings, activeLocation: i })}
              >
                <span className={`radio${settings.activeLocation === i ? ' on' : ''}`} aria-hidden />
                <span className="settings-row-label">{loc.label}</span>
              </button>
              <button
                type="button"
                className="row-action"
                aria-label={`Remove ${loc.label}`}
                onClick={() => removeLocation(i)}
              >
                remove
              </button>
            </div>
          ))}
          {adding ? (
            <PlaceSearch onPick={addLocation} onCancel={() => setAdding(false)} />
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
                US only · station AQI, converted for comparison
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
              // The lit segment is a background colour and nothing else; pressed
              // state is the only way it reaches anyone not looking at it.
              aria-pressed={settings.units === opt.value}
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
          <button type="button" className="settings-row" onClick={() => void backUp()}>
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
        <div className="row-card">
          <div className="settings-row tall">
            <div className="settings-row-sub">
              <span className="settings-row-label">Usage pings</span>
              <span className="settings-row-hint">screen views and taps · no diary content</span>
            </div>
            <button
              type="button"
              className={`toggle${settings.analyticsEnabled ? ' on' : ''}`}
              role="switch"
              aria-checked={settings.analyticsEnabled}
              aria-label="Usage pings"
              onClick={() => {
                const enabled = !settings.analyticsEnabled
                setAnalyticsEnabled(enabled)
                update({ ...settings, analyticsEnabled: enabled })
              }}
            >
              <span className="toggle-knob" />
            </button>
          </div>
        </div>
        <span className="settings-note">
          Anonymous usage pings (screen views, taps — never ratings, notes, or your precise
          location; they do carry the rough city read off your network address) help me see
          what&rsquo;s broken and whether anyone is out there.
        </span>
      </section>

      <Link to="/intro" className="settings-footer" style={{ textDecoration: 'none' }}>
        <span className="settings-row-label accent">
          What is this app? — the two-minute version
        </span>
        <span className="settings-footer-chevron">▸</span>
      </Link>

      <span className="settings-note">{DISCLAIMER}</span>
      {/* Plain anchors: these are prerendered documents, not app routes. */}
      <span className="legal-links">
        <a href="/privacy">Privacy</a>
        <span>·</span>
        <a href="/terms">Terms</a>
      </span>
    </>
  )
}

/**
 * Type a name, tap a result. Latitude and longitude are still reachable, one
 * disclosure down, because a trailhead has coordinates and no name — but nobody
 * should have to prove they know where Denver is to three decimal places.
 */
function PlaceSearch({
  onPick,
  onCancel,
}: {
  onPick: (place: SavedLocation) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [coordinates, setCoordinates] = useState(false)

  useEffect(() => {
    const name = query.trim()
    if (name.length < 2) {
      setResults([])
      setNote(null)
      return
    }
    let cancelled = false
    // Typing is a stream of half-written names; only the pause is a question.
    const timer = setTimeout(() => {
      void searchPlaces(name).then((found) => {
        if (cancelled) return
        if (!found) {
          setResults([])
          setNote('Could not reach the place index. Try again, or enter coordinates.')
          return
        }
        setResults(found)
        setNote(found.length ? null : `Nothing called “${name}”.`)
      })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const addCoordinates = (form: HTMLFormElement) => {
    const data = new FormData(form)
    const label = String(data.get('label') ?? '').trim()
    const lat = Number(data.get('lat'))
    const lon = Number(data.get('lon'))
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lon)) return
    onPick({ label, lat, lon })
  }

  return (
    <div className="place-search">
      <input
        className="note-input"
        placeholder="search for a place"
        autoFocus
        autoComplete="off"
        enterKeyHint="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results.map((place) => (
        <button
          key={`${place.label}-${place.lat},${place.lon}`}
          type="button"
          className="settings-row"
          onClick={() => onPick(place)}
        >
          <span className="settings-row-label">{place.label}</span>
          {place.detail && <span className="settings-row-hint">{place.detail}</span>}
        </button>
      ))}
      {note && <span className="settings-note">{note}</span>}
      <div className="place-search-actions">
        <button type="button" className="row-action" onClick={() => setCoordinates((v) => !v)}>
          enter coordinates
        </button>
        <button type="button" className="row-action" onClick={onCancel}>
          cancel
        </button>
      </div>
      {coordinates && (
        <form
          className="location-form"
          onSubmit={(e) => {
            e.preventDefault()
            addCoordinates(e.currentTarget)
          }}
        >
          <input name="label" placeholder="name" className="note-input" />
          <input name="lat" placeholder="lat" inputMode="decimal" className="note-input" />
          <input name="lon" placeholder="lon" inputMode="decimal" className="note-input" />
          <button type="submit" className="location-form-add">
            add
          </button>
        </form>
      )}
    </div>
  )
}
