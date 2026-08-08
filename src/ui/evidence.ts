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

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

/** "one day" / "three separate days" — how much of the diary stands behind a claim. */
const days = (n: number): string =>
  n === 1 ? 'one day' : `${NUMBER_WORDS[n] ?? 'several'} separate days`

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
    // How many days stand behind the claim is part of the claim.
    const behind = model.confirmations.find(
      (c) => c.variable === v && c.level === floorReason.level && c.strength === 'confirmed',
    )
    const backing = days(behind?.entryIndices.length ?? 1)
    return {
      main: `${variableName(v)} is past a level ${backing} ${backing === 'one day' ? 'showed' : 'show'} is enough on its own for ${levelWord(floorReason.level)}${bound !== undefined ? ` (${withUnit(v, bound)})` : ''}.`,
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
    const fromCombination = model.constraints.find(
      (c) => c.level === suspect.level && c.candidates.some((v) => suspect.variables.includes(v)),
    )
    // A ceiling with no ambiguous day behind it comes from a single-variable
    // claim the evidence won't yet promise: one day's attribution, or a
    // confirmation whose co-exposure today's air doesn't match.
    if (!fromCombination) {
      const v = suspect.variables[0]!
      const behind = model.confirmations.find(
        (c) => c.variable === v && c.level === suspect.level,
      )
      const counted = days(behind?.entryIndices.length ?? 1)
      const lead =
        counted === 'one day'
          ? 'One day suggests'
          : `${counted[0]!.toUpperCase()}${counted.slice(1)} show`
      return {
        main: `${lead} ${variableName(v).toLowerCase()} alone can be enough for ${levelWord(suspect.level)}, and it is at that level now.`,
        // Where the number was a calendar figure, that outranks the n=1
        // caveat: the day was real, the exposure behind it was not measured.
        aside: guessed([v])
          ? ESTIMATE_ASIDE
          : suspect.grade === 'confirmed'
            ? 'The rest of the air is milder than it was on those days, so this is a ceiling, not a promise.'
            : 'One day is a hint, not a pattern — another like it would settle this.',
      }
    }
    const [first, ...rest] = suspect.variables
    const tolerated = model.tolerance[first!]?.[2]
    const past =
      tolerated !== undefined
        ? `${variableName(first!)} is past what you have handled well (${withUnit(first!, tolerated)})`
        : `${variableName(first!)} is at a level your diary has not cleared`
    const also = rest.length
      ? `, and ${rest.map((v) => variableName(v).toLowerCase()).join(' and ')} ${rest.length > 1 ? 'are' : 'is'} high too`
      : ''
    const day = entryDate(diary, fromCombination.entryIndex)
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
