/**
 * Everything that keeps the diary alive across a browser's own housekeeping.
 *
 * The diary is one script-writable localStorage key, which is exactly the
 * storage Safari's ITP clears after seven days without a visit — the pattern of
 * someone who tries the app and comes back after a good-air month. Nothing here
 * can stop that. It can only ask for an exemption at the moment the diary is
 * worth something, leave a sentinel so a wipe is visible afterwards instead of
 * looking like a fresh install, and keep asking for backups.
 */
import { track } from './analytics'

const KEY = 'breathing-index.durability.v1'
const SENTINEL_KEY = 'breathing-index.sentinel.v1'
const DB_NAME = 'breathing-index'
const STORE = 'sentinel'
const SENTINEL_ID = 'diary'

/** Entries logged before the install card is worth showing. */
export const ENTRIES_BEFORE_INSTALL_NUDGE = 3
/** Unexported entries that earn a backup chip — and the snooze step. */
export const ENTRIES_PER_BACKUP_NUDGE = 10

export interface Durability {
  /** the install card has been dismissed for good */
  installNudgeDismissed: boolean
  /** ISO time of the last export, or null if the diary has never left */
  lastExportAt: string | null
  /** diary length at the last export */
  entriesAtExport: number
  /** diary length when the backup chip was last dismissed */
  entriesAtSnooze: number | null
}

export const DEFAULT_DURABILITY: Durability = {
  installNudgeDismissed: false,
  lastExportAt: null,
  entriesAtExport: 0,
  entriesAtSnooze: null,
}

export function loadDurability(): Durability {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_DURABILITY
    return { ...DEFAULT_DURABILITY, ...(JSON.parse(raw) as Partial<Durability>) }
  } catch {
    return DEFAULT_DURABILITY
  }
}

function updateDurability(patch: Partial<Durability>): void {
  const next = { ...loadDurability(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* a browser that will not take this will not take the diary either */
  }
}

/* --- persistence --- */

/**
 * Ask the browser to stop treating our storage as cache. Called once, on the
 * first diary save: Chrome grants it silently on engagement signals, installed
 * PWAs get it outright, and Safari ignores it — so this is upside only.
 */
export function requestPersistence(): void {
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
  if (!storage?.persist) return
  storage
    .persist()
    .then((granted) => track('Persistence requested', { granted }))
    .catch(() => undefined)
}

/* --- eviction sentinel --- */

function openSentinelDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

let sentinelEnsured = false

/**
 * Leave the mark in both stores. They are cleared together by ITP and by
 * "Clear History and Website Data", but not by every partial wipe or quota
 * eviction — either survivor is enough to tell an emptied diary from a new one.
 */
export function ensureSentinel(): void {
  if (sentinelEnsured) return
  sentinelEnsured = true
  const stamp = new Date().toISOString()
  try {
    localStorage.setItem(SENTINEL_KEY, stamp)
  } catch {
    /* ignore */
  }
  void openSentinelDb().then((db) => {
    if (!db) return
    try {
      db.transaction(STORE, 'readwrite').objectStore(STORE).put(stamp, SENTINEL_ID)
    } catch {
      /* ignore */
    }
  })
}

export function sentinelInLocalStorage(): boolean {
  try {
    return localStorage.getItem(SENTINEL_KEY) !== null
  } catch {
    return false
  }
}

export function sentinelInIndexedDb(): Promise<boolean> {
  return new Promise((resolve) => {
    void openSentinelDb().then((db) => {
      if (!db) return resolve(false)
      try {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(SENTINEL_ID)
        request.onsuccess = () => resolve(request.result !== undefined)
        request.onerror = () => resolve(false)
      } catch {
        resolve(false)
      }
    })
  })
}

/** Forget the diary ever existed — after a restore is declined. */
export function clearSentinel(): void {
  sentinelEnsured = false
  try {
    localStorage.removeItem(SENTINEL_KEY)
  } catch {
    /* ignore */
  }
  void openSentinelDb().then((db) => {
    if (!db) return
    try {
      db.transaction(STORE, 'readwrite').objectStore(STORE).delete(SENTINEL_ID)
    } catch {
      /* ignore */
    }
  })
}

/* --- nudges --- */

export function installNudgeDue(
  state: Durability,
  entryCount: number,
  standalone: boolean,
): boolean {
  if (standalone || state.installNudgeDismissed) return false
  return entryCount >= ENTRIES_BEFORE_INSTALL_NUDGE
}

export function dismissInstallNudge(): void {
  updateDurability({ installNudgeDismissed: true })
}

/** Entries that exist nowhere but this browser. */
export function unbackedCount(state: Durability, entryCount: number): number {
  return Math.max(0, entryCount - state.entriesAtExport)
}

export function backupNudgeDue(state: Durability, entryCount: number): boolean {
  if (unbackedCount(state, entryCount) < ENTRIES_PER_BACKUP_NUDGE) return false
  if (state.entriesAtSnooze === null) return true
  return entryCount - state.entriesAtSnooze >= ENTRIES_PER_BACKUP_NUDGE
}

/** Dismissing is not "never" — it is "ask me again in ten entries". */
export function snoozeBackupNudge(entryCount: number): void {
  updateDurability({ entriesAtSnooze: entryCount })
}

export function markExported(entryCount: number): void {
  updateDurability({
    lastExportAt: new Date().toISOString(),
    entriesAtExport: entryCount,
    entriesAtSnooze: null,
  })
}

/* --- environment --- */

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS predates display-mode and reports installs on navigator.standalone.
  const ios = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios || window.matchMedia?.('(display-mode: standalone)').matches === true
}

/** iOS has no beforeinstallprompt — installing is a Share-sheet errand. */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 13+ claims to be a Mac; touch points give it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}
