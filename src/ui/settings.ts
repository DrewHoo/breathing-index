export interface SavedLocation {
  label: string
  lat: number
  lon: number
}

export interface Settings {
  /** 'auto' = follow geolocation (Hamden fallback); otherwise index into locations */
  activeLocation: 'auto' | number
  locations: SavedLocation[]
  /** show AirNow measured comparison on the home screen (US only) */
  airnowEnabled: boolean
}

const KEY = 'breathing-index.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  activeLocation: 'auto',
  locations: [{ label: 'Hamden, CT', lat: 41.396, lon: -72.897 }],
  airnowEnabled: true,
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(settings))
}
