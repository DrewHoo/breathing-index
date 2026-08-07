import { useMemo } from 'react'
import { loadSettings, type Settings } from './settings'

export type TemperatureUnit = 'C' | 'F'

/**
 * Regions whose everyday temperatures are quoted in Fahrenheit: the US and its
 * territories, plus the handful of other countries that never switched
 * (CLDR's `us` measurement-system list).
 */
const FAHRENHEIT_REGIONS: ReadonlySet<string> = new Set([
  'US',
  'AS',
  'GU',
  'MP',
  'PR',
  'UM',
  'VI',
  'BS',
  'BZ',
  'KY',
  'FM',
  'LR',
  'MH',
  'PW',
])

/**
 * Exposure variables that are temperature *distances* from a reference
 * temperature. Feature extraction stores them in °C (see
 * docs/trigger-model.md); only display converts, so the diary, the priors and
 * every inference bound stay metric forever and never need migrating.
 */
export const TEMPERATURE_FEATURES: Record<
  string,
  { direction: 'over' | 'under'; referenceC: number }
> = {
  heat_stress: { direction: 'over', referenceC: 25 },
  cold_dry_stress: { direction: 'under', referenceC: 10 },
}

function parseLocale(tag: string): Intl.Locale | null {
  try {
    return new Intl.Locale(tag)
  } catch {
    return null // malformed tag from a stale browser or a bad OS setting
  }
}

/**
 * The user's region, from a list of BCP-47 tags in preference order. A tag
 * that states its region ("en-GB") always wins over one inferred from the
 * language alone, because likely-subtags resolves a bare "en" to the US — a
 * guess we only want to make when nothing better was offered.
 *
 * Exported for tests: everything else here reads the ambient environment.
 */
export function regionFromTags(tags: readonly string[]): string | undefined {
  const locales = tags.map(parseLocale).filter((l): l is Intl.Locale => l !== null)
  const stated = locales.find((l) => l.region)
  if (stated) return stated.region
  for (const locale of locales) {
    const region = locale.maximize().region
    if (region) return region
  }
  return undefined
}

/** BCP-47 tags this browser reports, most specific preference first. */
function ambientLocaleTags(): string[] {
  const tags: string[] = []
  if (typeof navigator !== 'undefined') {
    tags.push(...(navigator.languages ?? []))
    if (navigator.language) tags.push(navigator.language)
  }
  try {
    tags.push(new Intl.DateTimeFormat().resolvedOptions().locale)
  } catch {
    /* no Intl locale data — navigator's tags are all we get */
  }
  return tags.filter(Boolean)
}

export function temperatureUnitForRegion(region: string | undefined): TemperatureUnit {
  return region !== undefined && FAHRENHEIT_REGIONS.has(region) ? 'F' : 'C'
}

/** What the browser's locale implies, before any explicit user preference. */
export function detectTemperatureUnit(): TemperatureUnit {
  return temperatureUnitForRegion(regionFromTags(ambientLocaleTags()))
}

/** The unit to display in: the saved preference, or the locale's default. */
export function temperatureUnit(settings: Settings = loadSettings()): TemperatureUnit {
  if (settings.units === 'celsius') return 'C'
  if (settings.units === 'fahrenheit') return 'F'
  return detectTemperatureUnit()
}

/** Read the display unit once per mount, like the other localStorage settings. */
export function useTemperatureUnit(): TemperatureUnit {
  return useMemo(() => temperatureUnit(), [])
}

/** An absolute temperature in °C, converted for display. */
export function displayTemperature(celsius: number, unit: TemperatureUnit): number {
  return unit === 'F' ? celsius * 1.8 + 32 : celsius
}

/** A temperature *difference* in °C, converted for display — no 32° offset. */
export function displayTemperatureDelta(celsiusDelta: number, unit: TemperatureUnit): number {
  return unit === 'F' ? celsiusDelta * 1.8 : celsiusDelta
}

/** A stored (always metric) exposure value, converted for display. */
export function displayExposure(
  variable: string,
  value: number,
  unit: TemperatureUnit,
): number {
  return variable in TEMPERATURE_FEATURES ? displayTemperatureDelta(value, unit) : value
}
