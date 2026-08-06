import {
  LEVELS,
  LEVELS_DESC,
  type AmbiguousConstraint,
  type Bounds,
  type Conflict,
  type Exposure,
  type InferenceEntry,
  type Level,
  type Prediction,
  type Priors,
  type Rating,
  type Reason,
  type TriggerModel,
  type VariableStatus,
} from './types'
import { negligibleFor } from './config'

function setBound(
  bounds: Bounds,
  variable: string,
  level: Level,
  value: number,
  keep: 'min' | 'max',
): void {
  const forVar = (bounds[variable] ??= {})
  const cur = forVar[level]
  if (cur === undefined || (keep === 'max' ? value > cur : value < cur)) {
    forVar[level] = value
  }
}

function toleranceFrom(entries: { entry: InferenceEntry }[]): Bounds {
  const tolerance: Bounds = {}
  for (const { entry } of entries) {
    for (const level of LEVELS) {
      if (entry.rating >= level) continue
      for (const [variable, x] of Object.entries(entry.exposure)) {
        setBound(tolerance, variable, level, x, 'max')
      }
    }
  }
  return tolerance
}

function candidatesFor(exposure: Exposure, level: Level, tolerance: Bounds): string[] {
  return Object.entries(exposure)
    .filter(([variable, x]) => x > Math.max(tolerance[variable]?.[level] ?? 0, negligibleFor(variable)))
    .map(([variable]) => variable)
}

/**
 * Pure function of the diary: recomputed from scratch, order-independent.
 * See docs/trigger-model.md.
 */
export function buildModel(diary: InferenceEntry[]): TriggerModel {
  const usable = diary
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !entry.confounders?.length)

  const tolerance = toleranceFrom(usable)
  const confirmed: Bounds = {}
  const constraints: AmbiguousConstraint[] = []
  const conflicts: Conflict[] = []

  for (const { entry, index } of usable) {
    if (entry.rating < 2) continue
    let conflict: Conflict | null = null
    for (const level of LEVELS) {
      if (level > entry.rating) break
      const candidates = candidatesFor(entry.exposure, level, tolerance)
      if (candidates.length === 0) {
        if (!conflict) {
          // Would tolerance evidence available *before* this entry have explained it?
          const priorTolerance = toleranceFrom(usable.filter((u) => u.index < index))
          const priorCandidates = candidatesFor(entry.exposure, level, priorTolerance)
          conflict = {
            entryIndex: index,
            kind: priorCandidates.length > 0 ? 'superseded' : 'unmodeled-trigger',
          }
        }
        continue
      }
      if (candidates.length === 1) {
        setBound(confirmed, candidates[0]!, level, entry.exposure[candidates[0]!]!, 'min')
      } else {
        constraints.push({ entryIndex: index, level, candidates, exposure: entry.exposure })
      }
    }
    if (conflict) conflicts.push(conflict)
  }

  return { tolerance, confirmed, constraints, conflicts }
}

const value = (exposure: Exposure, variable: string): number => exposure[variable] ?? 0

/**
 * Predict [floor, ceiling] on the 1–4 Breathing Index for a forecast exposure.
 * Floor: evidence guarantees it. Ceiling: evidence or priors make it possible.
 */
export function predict(model: TriggerModel, exposure: Exposure, priors: Priors = {}): Prediction {
  const reasons: Reason[] = []

  let floor: Rating = 1
  for (const level of LEVELS_DESC) {
    const confirmedHit = Object.entries(model.confirmed).find(([variable, byLevel]) => {
      const bound = byLevel[level]
      return bound !== undefined && value(exposure, variable) >= bound
    })
    if (confirmedHit) {
      floor = level
      reasons.push({ bound: 'floor', level, kind: 'confirmed', variables: [confirmedHit[0]] })
      break
    }
    const comboHit = model.constraints.find(
      (c) => c.level === level && c.candidates.every((v) => value(exposure, v) >= c.exposure[v]!),
    )
    if (comboHit) {
      floor = level
      reasons.push({
        bound: 'floor',
        level,
        kind: 'combo-repeat',
        variables: comboHit.candidates,
        entryIndex: comboHit.entryIndex,
      })
      break
    }
  }

  let ceiling: Rating = floor
  for (const level of LEVELS_DESC) {
    if (level <= floor) break
    const suspects = [
      ...new Set(
        model.constraints
          .filter((c) => c.level === level)
          .flatMap((c) => c.candidates.filter((v) => value(exposure, v) >= c.exposure[v]!)),
      ),
    ]
    const priorHits = Object.entries(priors)
      .filter(([variable, byLevel]) => {
        const bound = byLevel[level]
        if (bound === undefined || value(exposure, variable) < bound) return false
        // Personal tolerance overrides priors: if this exposure of this variable
        // has been personally tolerated below this level, the prior is refuted.
        const tolerated = model.tolerance[variable]?.[level]
        return tolerated === undefined || value(exposure, variable) > tolerated
      })
      .map(([variable]) => variable)
    if (suspects.length > 0 || priorHits.length > 0) {
      ceiling = level
      if (suspects.length > 0) {
        reasons.push({ bound: 'ceiling', level, kind: 'suspect', variables: suspects })
      }
      if (priorHits.length > 0) {
        reasons.push({ bound: 'ceiling', level, kind: 'prior', variables: priorHits })
      }
      break
    }
  }

  return { floor, ceiling, reasons }
}

/** Evidence status of one variable at its current exposure, for the constituent strip. */
export function variableStatus(
  model: TriggerModel,
  priors: Priors,
  variable: string,
  current: number,
): VariableStatus {
  const confirmedAt = model.confirmed[variable]
  if (confirmedAt && LEVELS.some((l) => confirmedAt[l] !== undefined && current >= confirmedAt[l]!)) {
    return 'confirmed'
  }
  const suspected = model.constraints.some(
    (c) => c.candidates.includes(variable) && current >= c.exposure[variable]!,
  )
  if (suspected) return 'suspected'
  const tol = model.tolerance[variable]?.[2]
  if (tol !== undefined && current <= tol) return 'tolerated'
  const prior2 = priors[variable]?.[2]
  if (prior2 !== undefined && current >= prior2) return 'prior-elevated'
  return 'unknown'
}
