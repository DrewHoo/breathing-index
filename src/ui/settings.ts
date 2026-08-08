export interface SavedLocation {
  label: string
  lat: number
  lon: number
}

/** 'auto' = follow the browser locale's region (see ui/units.ts) */
export type UnitPreference = 'auto' | 'celsius' | 'fahrenheit'

export interface Settings {
  /** 'auto' = follow geolocation (no fallback: see useExposureSeries) */
  activeLocation: 'auto' | number
  locations: SavedLocation[]
  /** show AirNow measured comparison (US only) */
  airnowEnabled: boolean
  /** display unit for temperature — stored data is always metric */
  units: UnitPreference
  /** the first-run intro has been dismissed */
  introSeen: boolean
  /** send content-free usage pings (see ui/analytics.ts) */
  analyticsEnabled: boolean
}

const KEY = 'breathing-index.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  activeLocation: 'auto',
  // Nobody starts out having chosen a place. Seeding one put my town in a
  // stranger's list, one tap from becoming the air their diary is graded on.
  locations: [],
  airnowEnabled: true,
  units: 'auto',
  introSeen: false,
  analyticsEnabled: true,
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
