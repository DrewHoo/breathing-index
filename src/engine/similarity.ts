import { negligibleFor } from './config'
import type { Exposure, Priors } from './types'

/**
 * One "unit of meaningful difference" for a variable, in that variable's own
 * units: its level-2 prior — the exposure at which the variable starts to
 * matter at all. Falls back to the negligible floor for variables with no
 * level-2 prior, so the scale is always something health-relevant rather than
 * an arbitrary constant.
 */
function scaleFor(variable: string, priors: Priors): number {
  const prior2 = priors[variable]?.[2]
  if (prior2 !== undefined && prior2 > 0) return prior2
  const negligible = negligibleFor(variable)
  return negligible > 0 ? negligible : 1
}

/**
 * How different two exposure vectors are, in units of "one variable moved by
 * its level-2 prior". Chebyshev rather than Euclidean: one variable moving a
 * lot means different air, even if the other eight are identical — averaging
 * would let a smoke spike hide behind eight unchanged dimensions.
 */
export function exposureDistance(a: Exposure, b: Exposure, priors: Priors): number {
  let worst = 0
  for (const variable of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const delta = Math.abs((a[variable] ?? 0) - (b[variable] ?? 0))
    if (delta === 0) continue
    worst = Math.max(worst, delta / scaleFor(variable, priors))
  }
  return worst
}

/**
 * A quarter of a variable's level-2 prior. Below this the air hasn't
 * meaningfully moved — e.g. PM2.5 within ±2.3 µg/m³, ozone within ±25 µg/m³,
 * heat stress within ±1.75 °C — so asking the user to re-rate it would be
 * asking the same question twice.
 */
export const SIMILAR_EXPOSURE_DISTANCE = 0.25

/** True when two exposure vectors are close enough to count as the same air. */
export function isSimilarExposure(
  a: Exposure,
  b: Exposure,
  priors: Priors,
  threshold: number = SIMILAR_EXPOSURE_DISTANCE,
): boolean {
  return exposureDistance(a, b, priors) <= threshold
}
