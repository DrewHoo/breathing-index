import { describe, expect, it } from 'vitest'
import {
  bandEdges,
  bandRates,
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

describe('bandEdges', () => {
  const range = { lo: 50, hi: 185 }
  it('cuts at the breakpoints that fall inside the data', () => {
    expect(bandEdges([100, 139], undefined, range)).toEqual([100, 139])
  })
  it('drops a breakpoint the data never reaches', () => {
    expect(bandEdges([100, 300], 125, range)).toEqual([100])
  })
  it('falls back to the easy level only when no breakpoint cuts anything', () => {
    expect(bandEdges([300, 400], 125, range)).toEqual([125])
    expect(bandEdges([300], 500, range)).toEqual([])
  })
  it('never keeps more than two', () => {
    expect(bandEdges([60, 90, 120, 150], undefined, range)).toEqual([60, 90])
  })
})

describe('bandRates', () => {
  const points = [pt(60), pt(80), pt(110, 2), pt(120), pt(150, 3), pt(185, 3)]
  it('counts easy days per band and names the band', () => {
    expect(bandRates(points, [100, 130], String)).toEqual([
      { label: 'under 100', easy: 2, total: 2 },
      { label: '100–130', easy: 1, total: 2 },
      { label: '130 and up', easy: 0, total: 2 },
    ])
  })
  it('skips an empty band rather than reporting 0 of 0', () => {
    expect(bandRates(points, [100, 170], String).map((r) => r.label)).toEqual([
      'under 100',
      '100–170',
      '170 and up',
    ])
    expect(bandRates([pt(60)], [100, 170], String).map((r) => r.label)).toEqual(['under 100'])
  })
  it('is empty with no edges', () => {
    expect(bandRates(points, [], String)).toEqual([])
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
