import { describe, expect, it } from 'vitest'
import {
  cellReading,
  correctedPm25,
  parseSensorsPayload,
  pickSensors,
  type SensorsPayload,
} from './purpleair'

const payload = (
  fields: string[],
  data: (number | string | null)[][],
  stamp?: number,
): SensorsPayload => ({ fields, data, data_time_stamp: stamp })

describe('parseSensorsPayload', () => {
  it('accepts the columnar shape', () => {
    const p = parseSensorsPayload({ fields: ['sensor_index'], data: [[1]], data_time_stamp: 5 })
    expect(p).toEqual({ fields: ['sensor_index'], data: [[1]], data_time_stamp: 5 })
  })

  it('rejects everything else', () => {
    expect(parseSensorsPayload(null)).toBeNull()
    expect(parseSensorsPayload('[]')).toBeNull()
    expect(parseSensorsPayload({ fields: 'sensor_index', data: [] })).toBeNull()
    expect(parseSensorsPayload({ fields: ['a'], data: [1] })).toBeNull()
    // An error body ({"api_version":..., "error": ...}) has neither key.
    expect(parseSensorsPayload({ error: 'ApiKeyInvalidError' })).toBeNull()
  })
})

describe('correctedPm25', () => {
  it('applies the linear branch at and below 343', () => {
    // 0.52·100 − 0.086·50 + 5.75 = 53.45
    expect(correctedPm25(100, 50)).toBeCloseTo(53.45)
    expect(correctedPm25(343, 50)).toBeCloseTo(0.52 * 343 - 0.086 * 50 + 5.75)
  })

  it('applies the quadratic branch above 343', () => {
    // RH drops out above the knee — smoke this thick swamps the humidity term.
    expect(correctedPm25(400, 50)).toBeCloseTo(0.46 * 400 + 3.93e-4 * 400 * 400 + 2.97)
    expect(correctedPm25(400, 10)).toBeCloseTo(correctedPm25(400, 90))
  })

  it('clamps the clean-and-humid artifact at zero', () => {
    // 0.52·1 − 0.086·99 + 5.75 < 0: the fit line dips below zero, air does not.
    expect(correctedPm25(1, 99)).toBe(0)
  })
})

describe('pickSensors', () => {
  const fields = ['sensor_index', 'latitude', 'longitude', 'confidence']

  it('filters low confidence and broken rows, sorts by distance, caps at five', () => {
    const rows: (number | null)[][] = [
      [1, 41.4, -72.9, 100], // ~0.5 km — nearest
      [2, 41.3, -72.9, 100], // ~11 km
      [3, 41.39, -72.89, 100], // ~0.9 km
      [4, 41.4, -72.9, 30], // low confidence, out
      [5, null, -72.9, 100], // no latitude, out
      [6, 41.41, -72.9, 90],
      [7, 41.42, -72.9, 90],
      [8, 41.43, -72.9, 90],
    ]
    const picked = pickSensors(payload(fields, rows), 41.396, -72.897)
    expect(picked).toHaveLength(5)
    expect(picked[0]!.i).toBe(1)
    expect(picked.map((s) => s.i)).not.toContain(4)
    expect(picked.map((s) => s.i)).not.toContain(5)
    // Sorted: every distance no smaller than the one before it.
    for (let i = 1; i < picked.length; i++) expect(picked[i]!.km).toBeGreaterThanOrEqual(picked[i - 1]!.km)
  })

  it('answers empty when the columns are missing', () => {
    expect(pickSensors(payload(['sensor_index'], [[1]]), 41, -72)).toEqual([])
  })
})

describe('cellReading', () => {
  const fields = ['sensor_index', 'pm2.5_cf_1', 'humidity']

  it('takes the median of corrected values, odd count', () => {
    const r = cellReading(
      payload(
        fields,
        [
          [1, 10, 50],
          [2, 20, 50],
          [3, 30, 50],
        ],
        1_758_000_000,
      ),
      0.8,
    )
    expect(r.pm25).toBeCloseTo(correctedPm25(20, 50), 1)
    expect(r.sensors).toBe(3)
    expect(r.nearestKm).toBe(0.8)
    expect(r.time).toBe(new Date(1_758_000_000_000).toISOString())
  })

  it('averages the middle two on an even count', () => {
    const r = cellReading(
      payload(fields, [
        [1, 10, 50],
        [2, 20, 50],
        [3, 30, 50],
        [4, 40, 50],
      ]),
      null,
    )
    const expected = (correctedPm25(20, 50) + correctedPm25(30, 50)) / 2
    expect(r.pm25).toBeCloseTo(expected, 1)
    expect(r.sensors).toBe(4)
  })

  it('skips a sensor missing cf_1 or humidity rather than defaulting it', () => {
    const r = cellReading(
      payload(fields, [
        [1, 10, 50],
        [2, null, 50],
        [3, 30, null],
      ]),
      null,
    )
    expect(r.sensors).toBe(1)
    expect(r.pm25).toBeCloseTo(correctedPm25(10, 50), 1)
  })

  it('answers absence, not zero, when nothing is usable', () => {
    const r = cellReading(payload(fields, [[1, null, null]]), null)
    expect(r).toEqual({ pm25: null, sensors: 0, nearestKm: null, time: null })
  })
})
