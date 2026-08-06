import type { DiaryEntry } from '../engine/types'

const KEY = 'breathing-index.diary.v1'

export function loadDiary(): DiaryEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as DiaryEntry[]) : []
  } catch {
    return []
  }
}

export function saveDiary(entries: DiaryEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries))
}
