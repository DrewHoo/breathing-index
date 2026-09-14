/**
 * The one case where the app is allowed to name a source.
 *
 * "Smoke" as a row name asserted a cause the data does not carry — most metro
 * PM2.5 is traffic and industry. The fine fraction is the exception: when
 * almost all of the particulate mass is fine-mode, dust and road grit are ruled
 * out, and smoke or secondary aerosol is what is left. The M1 Hamden reading
 * was the case that motivated it (model PM2.5/PM10 ≈ 0.93 — docs/m1-findings.md).
 *
 * Both halves have to hold. A ratio near 1 on a clean day is two small numbers
 * dividing into each other, so the fine mass also has to be past the level the
 * population prior calls noticeable before the label is worth anything.
 *
 * It reads the hour's *raw* readings, not the window features the rows are
 * graded on. The two questions are different: the engine asks what dose this
 * person has been carrying, which is a 24-hour mean for particles, while the
 * label asks what the particulate outside is made of right now. A plume that
 * arrived at 3 pm is fine-mode at 3 pm and is still a tenth of the day's mean
 * at 4 pm, so a day-averaged ratio is the wrong instrument for it — it would
 * both miss the arrival and keep asserting smoke long after the air cleared.
 */
import { PRIORS } from '../engine/config'

/** PM2.5 / PM10 at or above this is fine-mode dominated. */
export const SMOKE_FINE_FRACTION = 0.85

/** Below this the ratio is noise: too little mass for the split to mean anything. */
export const SMOKE_MIN_PM25 = PRIORS.pm25?.[2] ?? 9.1

/**
 * Does this hour's air look like smoke rather than dust? Takes the hour's raw
 * readings — `Hour.raw` — and never a forecast hour's.
 */
export function smokeFingerprint(raw: Record<string, number | undefined>): boolean {
  const pm25 = raw.pm25 ?? 0
  const pm10 = raw.pm10 ?? 0
  if (pm25 < SMOKE_MIN_PM25) return false
  if (pm10 <= 0) return false
  return pm25 / pm10 >= SMOKE_FINE_FRACTION
}
