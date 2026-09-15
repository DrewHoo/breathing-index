import { describe, expect, it } from 'vitest'
import {
  sourceTag,
  sourceWord,
  stackDots,
  stripRange,
  type StripPoint,
} from './evidenceStrip'

const pt = (value: number, rating: 1 | 2 | 3 | 4 = 1): StripPoint => ({ value, rating })

describe('stripRange', () => {
  it('spans the dots and every mark it must contain', () => {
    expect(stripRange([pt(50), pt(120)], [125])).toEqual({ lo: 50, hi: 125 })
  })
  it('gives a flat strip a width to sit on', () => {
    expect(stripRange([pt(4), pt(4)], [])).toEqual({ lo: 3, hi: 5 })
  })
})

describe('stackDots', () => {
  it('stacks dots that share a column and sorts by value', () => {
    const x = (v: number) => v
    const out = stackDots([pt(20), pt(2), pt(3)], x, 7)
    expect(out.map((d) => [d.point.value, d.stack])).toEqual([
      [2, 0],
      [3, 1],
      [20, 0],
    ])
  })
})

describe('sourceWord', () => {
  it('names sources the way the rows do', () => {
    expect(sourceWord('cams')).toBe('the model')
    expect(sourceWord('cams-w2')).toBe('the model')
    expect(sourceWord('airnow')).toBe('the monitor')
    expect(sourceWord(undefined)).toBe('earlier logs')
    expect(sourceTag('cams-w2')).toBe('model')
    expect(sourceTag('airnow')).toBe('monitor')
  })
})
