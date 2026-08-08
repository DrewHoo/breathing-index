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
   * Where the exposure numbers came from. Bounds are source-scoped: a model
   * source and a monitor source disagree by more than the numbers' meaning
   * survives, so a switch starts a fresh bound set (docs/trigger-model.md).
   */
  source?: string
  /** official composite indices at log time — scoreboard receipts, never used by inference */
  official?: { usAqi: number | null; eaqi: number | null }
}

/** The subset of DiaryEntry that inference reads. */
export type InferenceEntry = Pick<
  DiaryEntry,
  'rating' | 'exposure' | 'confounders' | 'observations' | 'source'
>

/** variable -> level -> exposure at which that level is *potentially* reached (ceiling-only) */
export type Priors = Record<string, Partial<Record<Level, number>>>

export type Bounds = Record<string, Partial<Record<Level, number>>>

/** How much evidence stands behind a claim: none of it personal, one day, or repeated. */
export type EvidenceGrade = 'prior' | 'provisional' | 'confirmed'

/**
 * How hard a single-candidate attribution may be pushed.
 *
 * - `confirmed` — repeated on two independent bad days, or seen on one day
 *   where nothing else was even measurably present. May set the floor.
 * - `suspected-strong` — one bad day, with other variables elevated in the
 *   background. Drives the ceiling, never the floor.
 */
export type ConfirmationStrength = 'suspected-strong' | 'confirmed'

/** "x_p alone was enough for level L" — with the company it was observed in. */
export interface Confirmation {
  variable: string
  level: Level
  /** lowest exposure of `variable` that alone sufficed for `level` */
  bound: number
  /**
   * Co-exposure present on the day the bound came from: the claim is really
   * "this much of `variable`, against this background". Empty when the day was
   * genuinely clean, in which case the claim stands on its own.
   */
  context: Exposure
  /** the bad days that put this variable alone in a candidate set */
  entryIndices: number[]
  strength: ConfirmationStrength
  /** the exposure source the bound was learned against */
  source: string
}

export interface AmbiguousConstraint {
  entryIndex: number
  level: Level
  /** variables not exonerated at this entry's exposures — one or more of these suffices */
  candidates: string[]
  exposure: Exposure
}

export type ConflictKind = 'superseded' | 'unmodeled-trigger' | 'sensitivity-shift'

export interface Conflict {
  entryIndex: number
  /**
   * The other half of the clash — the entry whose tolerance emptied this one,
   * or whose tolerance the repeated bad days re-opened. Absent when nothing
   * was tolerated away (an unmodeled trigger with no elevated variable at all).
   */
  againstIndex?: number
  kind: ConflictKind
}

/** A bound set learned against a source the diary has since moved off. */
export interface InertBounds {
  source: string
  tolerance: Bounds
  confirmed: Bounds
}

export interface TriggerModel {
  /** tolerance[p][L]: highest exposure of p proven tolerable below level L */
  tolerance: Bounds
  /** whether a tolerance bound rests on one entry or on a repeat of it */
  toleranceGrade: Record<string, Partial<Record<Level, EvidenceGrade>>>
  /** confirmed[p][L]: lowest exposure of p that alone was enough for level L */
  confirmed: Bounds
  /** every single-candidate attribution, graded and carrying its context */
  confirmations: Confirmation[]
  constraints: AmbiguousConstraint[]
  conflicts: Conflict[]
  /** the exposure source the active bounds were learned against */
  source: string
  /** bound sets from earlier sources: kept for the record, never predicted from */
  inert: InertBounds[]
}

export type ReasonKind = 'confirmed' | 'combo-repeat' | 'suspect' | 'prior'

export interface Reason {
  bound: 'floor' | 'ceiling'
  level: Level
  kind: ReasonKind
  /** how many days stand behind this reason: prior, one day, or a repeat */
  grade: EvidenceGrade
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
