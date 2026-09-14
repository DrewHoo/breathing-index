import { describe, expect, it } from 'vitest'
import capture from '../../../tests/fixtures/mold/kc.html?raw'
import { parseKansasCity } from './kc'

describe('Children’s Mercy Kansas City', () => {
  const parsed = parseKansasCity(capture)

  it('reads the mold cell and not the pollen cell beside it', () => {
    expect(parsed?.total).toBe(12685)
    expect(parsed?.category).toBe('Moderate')
    // 59 (Moderate) is the pollen count in the previous column, and it is the
    // first `N (Band)` in the data row.
    expect(parsed?.total).not.toBe(59)
  })

  it('takes the reporting date, not the SkyCast forecast three days later', () => {
    expect(parsed?.date).toBe('2026-09-11')
    expect(capture).toContain('SkyCast for September 14, 2026')
  })

  it('reads the top-five table', () => {
    expect(parsed?.genera).toEqual({
      cladosporium: 8719,
      ascospores: 1489,
      botrytis: 1329,
      rusts: 770,
      alternaria_aspergillus_penicillium: 378,
    })
  })

  it('keeps the combined bucket combined', () => {
    // `Alternaria & Aspergillus/Penicillium` is three taxa in one number, and
    // crediting Alternaria with 378 would be inventing a genus reading.
    expect(parsed?.genera).not.toHaveProperty('alternaria')
  })

  it('is not a reading without the heading that carries the date', () => {
    expect(parseKansasCity(capture.replace(/internal-heading/g, 'x'))).toBeNull()
  })
})
