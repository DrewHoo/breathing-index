import { describe, expect, it } from 'vitest'
import { parsePurpleAir } from './purpleair'

describe('parsePurpleAir', () => {
  it('accepts the relay shape', () => {
    expect(
      parsePurpleAir({ pm25: 12.4, sensors: 5, nearestKm: 0.8, time: '2026-09-17T22:00:00.000Z' }),
    ).toEqual({ pm25: 12.4, sensors: 5, nearestKm: 0.8, time: '2026-09-17T22:00:00.000Z' })
  })

  it('treats a sensorless cell as absence, not a reading', () => {
    expect(parsePurpleAir({ pm25: null, sensors: 0, nearestKm: null, time: null })).toBeNull()
  })

  it('rejects shapes the relay never sends', () => {
    expect(parsePurpleAir(null)).toBeNull()
    expect(parsePurpleAir([])).toBeNull()
    expect(parsePurpleAir({ pm25: '12', sensors: 5 })).toBeNull()
    expect(parsePurpleAir({ pm25: Number.NaN, sensors: 5 })).toBeNull()
    expect(parsePurpleAir({ error: 'purpleair disabled' })).toBeNull()
  })

  it('carries missing metadata as null rather than failing the reading', () => {
    expect(parsePurpleAir({ pm25: 8, sensors: 2 })).toEqual({
      pm25: 8,
      sensors: 2,
      nearestKm: null,
      time: null,
    })
  })
})
