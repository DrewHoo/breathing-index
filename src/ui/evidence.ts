import type { DiaryEntry, Prediction } from '../engine/types'
import { variableName } from './labels'

const list = (variables: string[]): string => variables.map(variableName).join(' + ')

/**
 * The evidence line: explain a prediction by the evidence it matched, phrased
 * as observation, never mechanism. The app never says "because" about anything
 * it hasn't isolated.
 */
export function evidenceLine(prediction: Prediction, diary: DiaryEntry[]): string {
  const floorReason = prediction.reasons.find((r) => r.bound === 'floor')
  if (floorReason?.kind === 'confirmed') {
    return `${list(floorReason.variables)} is above a level that alone has been enough for a ${floorReason.level}.`
  }
  if (floorReason?.kind === 'combo-repeat') {
    const when =
      floorReason.entryIndex !== undefined && diary[floorReason.entryIndex]
        ? new Date(diary[floorReason.entryIndex]!.time).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })
        : 'a previous day'
    return `${list(floorReason.variables)} together match ${when}, which you rated a ${floorReason.level}.`
  }
  const suspect = prediction.reasons.find((r) => r.kind === 'suspect')
  if (suspect) {
    return `${list(suspect.variables)} is at a level from a day you rated ${suspect.level} — still learning which variable matters.`
  }
  const prior = prediction.reasons.find((r) => r.kind === 'prior')
  if (prior) {
    return `${list(prior.variables)} above population guidance for sensitive groups — no personal data on this yet.`
  }
  return "Nothing you've reacted to before is elevated."
}
