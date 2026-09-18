import { describe, expect, it } from 'vitest'
import { parseOpenAq, toUgM3 } from './openaq'

describe('toUgM3', () => {
  it('passes µg/m³ through, either spelling', () => {
    expect(toUgM3('pm25', 12.5, 'µg/m³')).toBe(12.5)
    expect(toUgM3('o3', 61, 'ug/m3')).toBe(61)
  })

  it('converts gas ppb and ppm with the shared constants', () => {
    expect(toUgM3('o3', 50, 'ppb')).toBeCloseTo(98)
    expect(toUgM3('o3', 0.05, 'ppm')).toBeCloseTo(98)
    expect(toUgM3('so2', 10, 'ppb')).toBeCloseTo(26.2)
  })

  it('refuses units that make no sense for the variable', () => {
    expect(toUgM3('pm25', 0.01, 'ppm')).toBeNull()
    expect(toUgM3('o3', 50, 'mg/m³')).toBeNull()
  })
})

describe('parseOpenAq', () => {
  const paris = {
    name: 'PARIS 18eme',
    provider: 'EEA France',
    attribution: 'Ineris',
    license: 'CC BY-SA 4.0',
    km: 2.4,
    values: [
      { variable: 'pm25', value: 14.1, units: 'µg/m³', utc: '2026-09-18T11:00:00Z' },
      { variable: 'o3', value: 0.031, units: 'ppm', utc: '2026-09-18T10:00:00Z' },
    ],
  }

  it('takes the fullest station and converts everything to µg/m³', () => {
    const r = parseOpenAq({ stations: [paris], fetched: 'x' })
    expect(r).not.toBeNull()
    expect(r!.station).toBe('PARIS 18eme')
    expect(r!.values.pm25).toBe(14.1)
    expect(r!.values.o3).toBeCloseTo(0.031 * 1000 * 1.96)
    expect(r!.time).toBe('2026-09-18T11:00:00Z')
  })

  it('skips a nearer station with nothing convertible', () => {
    const broken = { ...paris, name: 'BROKEN', values: [{ variable: 'pm25', value: 3, units: 'ppm', utc: 'x' }] }
    const r = parseOpenAq({ stations: [broken, paris] })
    expect(r!.station).toBe('PARIS 18eme')
  })

  it('prefers a fuller station over a nearer one with fewer variables, nearest on ties', () => {
    // The live Paris cell: nearest station carries only o3, the next one both
    // particle sizes. One instrument is still the rule; pick the fuller one.
    const o3Only = { ...paris, name: 'NEUILLY', values: [paris.values[1]] }
    const r = parseOpenAq({ stations: [o3Only, paris] })
    expect(r!.station).toBe('PARIS 18eme')
    const tie = parseOpenAq({ stations: [o3Only, { ...paris, name: 'FARTHER', values: [paris.values[1]] }] })
    expect(tie!.station).toBe('NEUILLY')
  })

  it("treats OpenAQ's placeholder attribution as no attribution", () => {
    const r = parseOpenAq({
      stations: [{ ...paris, attribution: 'Unknown Governmental Organization' }],
    })
    expect(r!.attribution).toBe('EEA France')
  })

  it('answers null for an empty cell and for shapes the relay never sends', () => {
    expect(parseOpenAq({ stations: [], fetched: 'x' })).toBeNull()
    expect(parseOpenAq(null)).toBeNull()
    expect(parseOpenAq({ error: 'openaq disabled' })).toBeNull()
  })

  it('falls back to the provider when the license names no attribution', () => {
    const r = parseOpenAq({ stations: [{ ...paris, attribution: null }] })
    expect(r!.attribution).toBe('EEA France')
  })
})
