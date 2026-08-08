/**
 * Getting the diary out of the browser and back in.
 *
 * Out: a blob-anchor download is silently dropped in an installed PWA on iOS,
 * which is the one place the backup matters most, so the share sheet comes
 * first and the clipboard is the last resort. In: the file is a stranger —
 * anything that is not a diary entry is refused before it can reach the model.
 */
import type { DiaryEntry } from '../engine/types'
import { markExported } from './durability'

const RATINGS: readonly number[] = [1, 2, 3, 4]

export const UNREADABLE_FILE = 'Could not read that file — expected a diary JSON export.'
export const MALFORMED_ENTRIES =
  'That file has entries without a rating, a time, or the air — nothing imported.'

export type ImportResult =
  | { ok: true; entries: DiaryEntry[] }
  | { ok: false; reason: string }

function isStringList(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((v) => typeof v === 'string'))
}

function isExposure(value: unknown, allowEmpty: boolean): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const values = Object.values(value as Record<string, unknown>)
  if (values.length === 0) return allowEmpty
  return values.every((v) => typeof v === 'number' && Number.isFinite(v))
}

/** An entry logged offline carries coordinates instead of air, and no vector yet. */
function isPendingExposure(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const place = value as Record<string, unknown>
  return Number.isFinite(place.lat) && Number.isFinite(place.lon)
}

function isDiaryEntry(value: unknown): value is DiaryEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  if (typeof entry.id !== 'string' || entry.id === '') return false
  if (typeof entry.time !== 'string' || Number.isNaN(Date.parse(entry.time))) return false
  if (typeof entry.rating !== 'number' || !RATINGS.includes(entry.rating)) return false
  // An entry still waiting on its air is allowed an empty vector, and only then.
  if (!isExposure(entry.exposure, isPendingExposure(entry.pendingExposure))) return false
  if (entry.note !== undefined && typeof entry.note !== 'string') return false
  return isStringList(entry.confounders) && isStringList(entry.observations)
}

/**
 * All or nothing: a file with one unreadable entry is a file we do not
 * understand, and half-importing it would put junk in the diary for good.
 */
export function parseDiaryImport(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: UNREADABLE_FILE }
  }
  if (!Array.isArray(parsed)) return { ok: false, reason: UNREADABLE_FILE }
  const entries = parsed.filter(isDiaryEntry)
  if (entries.length !== parsed.length) return { ok: false, reason: MALFORMED_ENTRIES }
  return { ok: true, entries }
}

/** Merge by id, oldest first. Safe to repeat, and safe to run twice on one file. */
export function mergeDiary(
  existing: DiaryEntry[],
  incoming: DiaryEntry[],
): { merged: DiaryEntry[]; added: DiaryEntry[] } {
  const known = new Set(existing.map((e) => e.id))
  const added: DiaryEntry[] = []
  for (const entry of incoming) {
    if (known.has(entry.id)) continue
    known.add(entry.id)
    added.push(entry)
  }
  return {
    merged: [...existing, ...added].sort((a, b) => a.time.localeCompare(b.time)),
    added,
  }
}

export type ExportOutcome = 'shared' | 'downloaded' | 'copied' | 'cancelled' | 'failed'

export function exportFilename(now: Date = new Date()): string {
  return `breathing-index-diary-${now.toISOString().slice(0, 10)}.json`
}

async function shareFile(json: string, name: string): Promise<ExportOutcome | null> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return null
  if (typeof File === 'undefined') return null
  const file = new File([json], name, { type: 'application/json' })
  if (navigator.canShare && !navigator.canShare({ files: [file] })) return null
  try {
    await navigator.share({ files: [file], title: name })
    return 'shared'
  } catch (error) {
    // Backing out of the share sheet is a choice, not a failure.
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    return null
  }
}

function downloadFile(json: string, name: string): boolean {
  try {
    const blob = new Blob([json], { type: 'application/json' })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = name
    anchor.click()
    URL.revokeObjectURL(anchor.href)
    return true
  } catch {
    return false
  }
}

async function copyToClipboard(json: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(json)
    return true
  } catch {
    return false
  }
}

/** Share sheet, then download, then clipboard. Records the backup on success. */
export async function exportDiary(entries: DiaryEntry[]): Promise<ExportOutcome> {
  const json = JSON.stringify(entries, null, 2)
  const name = exportFilename()

  const shared = await shareFile(json, name)
  if (shared === 'cancelled') return 'cancelled'

  let outcome: ExportOutcome = shared ?? 'failed'
  if (outcome === 'failed' && downloadFile(json, name)) outcome = 'downloaded'
  if (outcome === 'failed' && (await copyToClipboard(json))) outcome = 'copied'

  if (outcome !== 'failed') markExported(entries.length)
  return outcome
}
