import type { DiaryEntry, Prediction, TriggerModel } from '../engine/types'
import { VARIABLE_LABELS, levelWord, variableName } from './labels'

export interface Evidence {
  /** the Why sentence — diary evidence, never mechanism */
  main: string
  /** optional second line, italic faint */
  aside?: string
}

/** What the Why line owes anyone whose pollen number came off a calendar. */
const ESTIMATE_ASIDE =
  'That pollen figure is a calendar estimate for your region, not a measurement.'

const entryDate = (diary: DiaryEntry[], index: number | undefined): string =>
  index !== undefined && diary[index]
    ? new Date(diary[index].time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : 'a previous'

const withUnit = (variable: string, value: number): string => {
  const unit = VARIABLE_LABELS[variable]?.unit
  return `${Math.round(value)}${unit === '%' ? '%' : ` ${unit ?? ''}`}`.trim()
}

/**
 * Explain a prediction by the evidence it matched, in the diary's voice:
 * what you have handled, what days this resembles. The app never says
 * "because" about anything it hasn't isolated.
 */
export function evidence(
  prediction: Prediction,
  model: TriggerModel,
  diary: DiaryEntry[],
  /** variables in today's vector that were estimated rather than read */
  estimated: string[] = [],
): Evidence {
  // Anything the Why line blames that was a calendar figure has to say so here
  // too: the air table's sub-label does not travel up to this sentence.
  const guessed = (variables: string[]): boolean => variables.some((v) => estimated.includes(v))

  const floorReason = prediction.reasons.find((r) => r.bound === 'floor')
  if (floorReason?.kind === 'confirmed') {
    const v = floorReason.variables[0]!
    const bound = model.confirmed[v]?.[floorReason.level]
    return {
      main: `${variableName(v)} is past a level that alone has been enough for ${levelWord(floorReason.level)}${bound !== undefined ? ` (${withUnit(v, bound)})` : ''}.`,
    }
  }
  if (floorReason?.kind === 'combo-repeat') {
    const names = floorReason.variables.map((v) => variableName(v).toLowerCase())
    return {
      main: `${names.join(' and ')} together match your ${entryDate(diary, floorReason.entryIndex)} day — you rated that one ${levelWord(floorReason.level)}.`,
    }
  }

  const suspect = prediction.reasons.find((r) => r.kind === 'suspect')
  if (suspect) {
    const [first, ...rest] = suspect.variables
    const tolerated = model.tolerance[first!]?.[2]
    const past =
      tolerated !== undefined
        ? `${variableName(first!)} is past what you have handled well (${withUnit(first!, tolerated)})`
        : `${variableName(first!)} is at a level your diary has not cleared`
    const also = rest.length
      ? `, and ${rest.map((v) => variableName(v).toLowerCase()).join(' and ')} ${rest.length > 1 ? 'are' : 'is'} high too`
      : ''
    const source = model.constraints.find(
      (c) => c.level === suspect.level && c.candidates.some((v) => suspect.variables.includes(v)),
    )
    const day = entryDate(diary, source?.entryIndex)
    return {
      main: `${past}${also}. Together this sits near your ${day} day — you rated that one ${levelWord(suspect.level)}.`,
      aside: guessed(suspect.variables)
        ? ESTIMATE_ASIDE
        : `Still untangling whether ${variableName((rest[0] ?? first)!).toLowerCase()} alone affects you.`,
    }
  }

  const prior = prediction.reasons.find((r) => r.kind === 'prior')
  if (prior) {
    const names = prior.variables.map((v, i) =>
      i === 0 ? variableName(v) : variableName(v).toLowerCase(),
    )
    return {
      main: `${names.join(' and ')} ${prior.variables.length > 1 ? 'are' : 'is'} past guidance for sensitive groups — your diary has no verdict on ${prior.variables.length > 1 ? 'them' : 'it'} yet.`,
      ...(guessed(prior.variables) ? { aside: ESTIMATE_ASIDE } : {}),
    }
  }

  return { main: 'Nothing you have reacted to before is elevated.' }
}
