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
  confounders?: string[]
  exposure: Exposure
}

/** The subset of DiaryEntry that inference reads. */
export type InferenceEntry = Pick<DiaryEntry, 'rating' | 'exposure' | 'confounders'>

/** variable -> level -> exposure at which that level is *potentially* reached (ceiling-only) */
export type Priors = Record<string, Partial<Record<Level, number>>>

export type Bounds = Record<string, Partial<Record<Level, number>>>

export interface AmbiguousConstraint {
  entryIndex: number
  level: Level
  /** variables not exonerated at this entry's exposures — one or more of these suffices */
  candidates: string[]
  exposure: Exposure
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
