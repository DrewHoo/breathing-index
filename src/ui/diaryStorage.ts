import type { DiaryEntry } from '../engine/types'
import { ensureSentinel, requestPersistence } from './durability'
import { VIRAL } from './viralTag'

const KEY = 'breathing-index.diary.v1'

/**
 * Tags that have been written two ways. The chip row is the form the user
 * sees, so it wins, and older spellings are rewritten on the way in — a
 * confounder only has to match itself for the engine to exclude the entry,
 * but two spellings of one tag read as two different reasons in the diary.
 */
const TAG_ALIASES: Record<string, string> = { 'indoors-all-day': 'indoors all day' }

const migrateTags = (tags: string[] | undefined): string[] | undefined =>
  tags?.map((tag) => TAG_ALIASES[tag] ?? tag)

/** The confounder `sick` used to be, before it became an exposure variable. */
const SICK_CONFOUNDER = 'sick'

/**
 * `sick` stops being a reason to distrust a day and becomes a variable on it
 * (specs/26-sick-as-signal.md). An old entry carrying the confounder gets
 * `viral: 1` instead, and the tag comes off — dropping the array outright when
 * it held nothing else.
 *
 * That last part is the point rather than tidiness: an entry with an empty
 * `confounders` array is still excluded from inference by `buildModel`, and
 * these are exactly the days worth reading. The migration deliberately admits
 * entries the app had decided to ignore, which will change what the model says
 * about somebody's old diary. That was the whole argument — a sick day with
 * pollen up is the most informative day about allergen triggers there is, and
 * the old rule threw it away.
 *
 * Pure and idempotent: running it twice finds no confounder to move the second
 * time, and an entry that already carries the flag keeps the one it has.
 */
function migrateSick(entry: DiaryEntry): DiaryEntry {
  if (!entry.confounders?.includes(SICK_CONFOUNDER)) return entry
  const confounders = entry.confounders.filter((tag) => tag !== SICK_CONFOUNDER)
  const { confounders: _dropped, ...rest } = entry
  return {
    ...rest,
    ...(confounders.length ? { confounders } : {}),
    exposure: { ...entry.exposure, [VIRAL]: 1 },
  }
}

export function migrateEntries(entries: DiaryEntry[]): DiaryEntry[] {
  return entries.map((entry) => {
    const renamed = entry.confounders?.some((tag) => tag in TAG_ALIASES)
      ? { ...entry, confounders: migrateTags(entry.confounders) }
      : entry
    return migrateSick(renamed)
  })
}

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
    return Array.isArray(parsed) ? migrateEntries(parsed as DiaryEntry[]) : []
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
