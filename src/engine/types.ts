export type Rating = 1 | 2 | 3 | 4
export type Level = 2 | 3 | 4
export const LEVELS: readonly Level[] = [2, 3, 4]
export const LEVELS_DESC: readonly Level[] = [4, 3, 2]

/** variable name -> scalar exposure feature x_p (see docs/trigger-model.md window table) */
export type Exposure = Record<string, number>

export interface DiaryEntry {
  id: string
  time: string
  rating: Rating
  note?: string
  /** reasons to distrust the entry — inference excludes it (e.g. "sick") */
  confounders?: string[]
  /** things the user noticed that sharpen attribution (e.g. "worse-outdoors") */
  observations?: string[]
  exposure: Exposure
  /**
   * Variables in `exposure` whose values are estimates rather than readings —
   * today, calendar-region pollen where no measured source covers the place.
   * Inference lets them join candidate sets but never confirm a bound: a guess
   * may raise a ceiling, never guarantee a floor.
   */
  estimated?: string[]
  /** official composite indices at log time — scoreboard receipts, never used by inference */
  official?: { usAqi: number | null; eaqi: number | null }
  /** minutes between the log and the newest hour of air attached to it */
  exposureAgeMinutes?: number
  /**
   * The air was hours old when this was logged, so the vector is an estimate of
   * that hour rather than a reading of it. Recorded for the engine's future
   * estimated-evidence tier; today it is metadata the UI can show.
   */
  exposureEstimated?: boolean
  /**
   * Logged with no air to attach — the coordinates it was logged at, so the
   * vector can be backfilled from that place's hourly history. Callers must
   * keep these entries out of inference: an empty vector is unknown air, not
   * clean air, and would read as tolerance for everything.
   */
  pendingExposure?: { lat: number; lon: number }
}

/** The subset of DiaryEntry that inference reads. */
export type InferenceEntry = Pick<
  DiaryEntry,
  'rating' | 'exposure' | 'confounders' | 'observations' | 'estimated'
>

/** variable -> level -> exposure at which that level is *potentially* reached (ceiling-only) */
export type Priors = Record<string, Partial<Record<Level, number>>>

export type Bounds = Record<string, Partial<Record<Level, number>>>

export interface AmbiguousConstraint {
  entryIndex: number
  level: Level
  /** variables not exonerated at this entry's exposures — one or more of these suffices */
  candidates: string[]
  exposure: Exposure
  /**
   * A candidate's exposure here was estimated, not measured, so repeating this
   * combination suggests the level without guaranteeing it: ceiling, no floor.
   */
  estimated?: boolean
}

export type ConflictKind = 'superseded' | 'unmodeled-trigger'

export interface Conflict {
  entryIndex: number
  kind: ConflictKind
}

export interface TriggerModel {
  /** tolerance[p][L]: highest exposure of p proven tolerable below level L */
  tolerance: Bounds
  /** confirmed[p][L]: lowest exposure of p that alone was enough for level L */
  confirmed: Bounds
  constraints: AmbiguousConstraint[]
  conflicts: Conflict[]
}

export type ReasonKind = 'confirmed' | 'combo-repeat' | 'suspect' | 'prior'

export interface Reason {
  bound: 'floor' | 'ceiling'
  level: Level
  kind: ReasonKind
  variables: string[]
  entryIndex?: number
}

export interface Prediction {
  floor: Rating
  ceiling: Rating
  reasons: Reason[]
}

export type VariableStatus =
  | 'confirmed'
  | 'suspected'
  | 'tolerated'
  | 'prior-elevated'
  | 'unknown'
