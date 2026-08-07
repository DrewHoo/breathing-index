import type { DiaryEntry } from '../engine/types'
import { ensureSentinel, requestPersistence } from './durability'

const KEY = 'breathing-index.diary.v1'

/** Whether this browser holds a diary at all — `[]` counts, a wiped key does not. */
export function hasStoredDiary(): boolean {
  try {
    return localStorage.getItem(KEY) !== null
  } catch {
    return false
  }
}

export function loadDiary(): DiaryEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    // Diaries that predate the sentinel get one on the first read, or the
    // eviction they are already exposed to would still look like a new install.
    ensureSentinel()
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as DiaryEntry[]) : []
  } catch {
    return []
  }
}

/**
 * Returns false when the browser refused the write — quota, private mode, a
 * disabled storage setting. Callers must say so: a tap that shows "Saved" and
 * then evaporates on reload is worse than an error.
 */
export function saveDiary(entries: DiaryEntry[]): boolean {
  const first = !hasStoredDiary()
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    return false
  }
  // Persistence is worth asking for the moment there is something to lose.
  if (first) requestPersistence()
  ensureSentinel()
  return true
}
