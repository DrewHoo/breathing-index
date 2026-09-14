import { describe, expect, it } from 'vitest'
import capture from '../../../tests/fixtures/mold/canton.html?raw'
import { parseCanton } from './canton'

describe('Canton City Public Health', () => {
  const parsed = parseCanton(capture)

  it('reads the reporting date and the three taxa', () => {
    expect(parsed?.date).toBe('2026-09-11')
    expect(parsed?.genera).toEqual({
      cladosporium: 4310,
      alternaria: 360,
      unidentified_molds: 4400,
    })
  })

  it('totals the taxa, and agrees with the page’s own header', () => {
    expect(parsed?.total).toBe(9070)
    expect(capture).toContain('Mold - 9070')
  })

  it('takes the last column’s band, not grass’s', () => {
    expect(parsed?.category).toBe('Moderate')
    expect(capture).toContain('Category: None Observed')
  })

  it('stays out of the pollen columns', () => {
    // The weed cell lists Ragweed, Plantain, Artemisia, Chenopod and Nettle
    // in identical markup, three cells to the left.
    expect(parsed?.genera).not.toHaveProperty('ragweed')
    expect(parsed?.genera).not.toHaveProperty('plantain')
  })

  it('reports a quiet out-of-season day as dated with no total', () => {
    const quiet = capture.replace(/Cladosporium \(4310\)<br>Alternaria \(360\)<br>Unidentified Molds \(4400\)<br>/, 'None Observed')
    expect(parseCanton(quiet)).toEqual({
      date: '2026-09-11',
      total: null,
      category: 'Moderate',
      genera: {},
    })
  })

  it('is not a reading without the reporting date', () => {
    expect(parseCanton(capture.replace('Reporting date:', 'Printed'))).toBeNull()
  })
})
