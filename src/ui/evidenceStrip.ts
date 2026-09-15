import type { Rating } from '../engine/types'

/**
 * The arithmetic behind a row's strip on the Log screen: every usable entry
 * as a dot along the variable's own axis. Pure, so the shape a person sees is
 * the shape the numbers make.
 */

export interface StripPoint {
  /** the value on the row's display axis (a dew point in °F, a µg/m³, an index) */
  value: number
  rating: Rating
  /** the entry's exposure source, so a mixed strip can say so */
  source?: string
}

/** The axis a strip spans: the dots, plus any reference marks it must contain. */
export function stripRange(points: StripPoint[], marks: number[]): { lo: number; hi: number } {
  const values = [...points.map((p) => p.value), ...marks]
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  // A flat strip (every day the same reading) still needs a width to sit on.
  if (hi - lo < 1e-9) {
    lo -= 1
    hi += 1
  }
  return { lo, hi }
}

/**
 * Dots that would land on top of each other stack upward instead. Returns
 * each point's column index and its height in that column, in plot order.
 */
export function stackDots(
  points: StripPoint[],
  x: (value: number) => number,
  columnWidth: number,
): { point: StripPoint; x: number; stack: number }[] {
  const columns = new Map<number, number>()
  return [...points]
    .sort((a, b) => a.value - b.value)
    .map((point) => {
      const px = x(point.value)
      const column = Math.round(px / columnWidth)
      const stack = columns.get(column) ?? 0
      columns.set(column, stack + 1)
      return { point, x: px, stack }
    })
}

/** What to call a source in a sentence: the model, the monitor. */
export function sourceWord(source: string | undefined): string {
  if (source === undefined || source === 'unspecified') return 'earlier logs'
  if (source.startsWith('cams')) return 'the model'
  if (source === 'airnow') return 'the monitor'
  return source
}

/** The same, as a tag on a number: "near 185 (model)". */
export function sourceTag(source: string): string {
  if (source.startsWith('cams')) return 'model'
  if (source === 'airnow') return 'monitor'
  return source
}
