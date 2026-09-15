import type { Rating } from '../engine/types'

/**
 * The arithmetic behind a row's strip on the Log screen: every usable entry
 * as a dot along the variable's own axis, and the rate of easy days by band.
 * Pure, so the shape a person sees is the shape the numbers make.
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
 * Where to cut the axis into bands. The population breakpoints first — they
 * are the lines a reader already knows from the forecast — and, where none
 * of them falls inside the data, the diary's own easy level. Edges on or
 * outside the data's range cut nothing and are dropped; at most two survive.
 */
export function bandEdges(
  candidates: (number | undefined)[],
  fallback: number | undefined,
  range: { lo: number; hi: number },
): number[] {
  const inside = (e: number | undefined): e is number =>
    e !== undefined && e > range.lo && e < range.hi
  const edges = [...new Set(candidates.filter(inside))].sort((a, b) => a - b).slice(0, 2)
  if (edges.length > 0) return edges
  return inside(fallback) ? [fallback] : []
}

export interface BandRate {
  /** "under 100", "100–130", "above 130" */
  label: string
  easy: number
  total: number
}

/** The rate of easy days in each band the edges cut. */
export function bandRates(
  points: StripPoint[],
  edges: number[],
  short: (value: number) => string,
): BandRate[] {
  if (edges.length === 0) return []
  const bounds = [-Infinity, ...edges, Infinity]
  const rates: BandRate[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const lo = bounds[i]!
    const hi = bounds[i + 1]!
    const inBand = points.filter((p) => p.value >= lo && p.value < hi)
    if (inBand.length === 0) continue
    const label =
      lo === -Infinity ? `under ${short(hi)}` : hi === Infinity ? `${short(lo)} and up` : `${short(lo)}–${short(hi)}`
    rates.push({ label, easy: inBand.filter((p) => p.rating === 1).length, total: inBand.length })
  }
  return rates
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
