import { describe, expect, it } from 'vitest'
import { latestValues, pickStations, type OaqStation } from './openaq'

const NOW = Date.parse('2026-09-18T12:00:00Z')
const FRESH = '2026-09-18T11:00:00Z'

const location = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: 100,
  name: 'PARIS 18eme',
  isMonitor: true,
  isMobile: false,
  distance: 2400,
  datetimeLast: { utc: FRESH, local: 'x' },
  provider: { id: 1, name: 'EEA France' },
  licenses: [
    { id: 30, name: 'CC BY-SA 4.0', attribution: { name: 'Ineris', url: null } },
  ],
  sensors: [
    { id: 7001, parameter: { id: 2, name: 'pm25', units: 'µg/m³' } },
    { id: 7002, parameter: { id: 3, name: 'o3', units: 'µg/m³' } },
    { id: 7003, parameter: { id: 98, name: 'relativehumidity', units: '%' } },
  ],
  ...over,
})

describe('pickStations', () => {
  it('keeps a live reference monitor and precomputes the sensor join', () => {
    const picked = pickStations({ results: [location({})] }, NOW)
    expect(picked).toHaveLength(1)
    const s = picked[0]!
    expect(s.km).toBe(2.4)
    expect(s.attribution).toBe('Ineris')
    expect(s.license).toBe('CC BY-SA 4.0')
    // relativehumidity isn't a monitor variable the app tracks.
    expect(s.sensors.map((x) => x.variable).sort()).toEqual(['o3', 'pm25'])
  })

  it('drops mobile units, dead stations, restricted licenses, and non-monitors', () => {
    const results = [
      location({ id: 1, isMobile: true }),
      location({ id: 2, datetimeLast: { utc: '2019-06-01T00:00:00Z' } }),
      location({ id: 3, licenses: [{ id: 37, name: 'ACT Government Copyright', attribution: { name: 'ACT', url: null } }] }),
      location({ id: 4, isMonitor: false }),
      location({ id: 5, distance: null }),
    ]
    expect(pickStations({ results }, NOW)).toEqual([])
  })

  it('sorts by distance and caps at three', () => {
    const results = [
      location({ id: 1, distance: 9000 }),
      location({ id: 2, distance: 1000 }),
      location({ id: 3, distance: 24000 }),
      location({ id: 4, distance: 4000 }),
    ]
    expect(pickStations({ results }, NOW).map((s) => s.id)).toEqual([2, 4, 1])
  })

  it('answers empty on shapes the API never promised', () => {
    expect(pickStations(null, NOW)).toEqual([])
    expect(pickStations({ detail: 'error' }, NOW)).toEqual([])
    expect(pickStations({ results: ['x', 5] }, NOW)).toEqual([])
  })
})

describe('latestValues', () => {
  const station: OaqStation = {
    id: 100,
    name: 'PARIS 18eme',
    provider: 'EEA France',
    attribution: 'Ineris',
    attributionUrl: null,
    license: 'CC BY-SA 4.0',
    km: 2.4,
    sensors: [
      { id: 7001, variable: 'pm25', units: 'µg/m³' },
      { id: 7002, variable: 'o3', units: 'µg/m³' },
    ],
  }

  it('joins sensorsId to the directory and keeps the newest fresh value per variable', () => {
    const values = latestValues(
      {
        results: [
          { sensorsId: 7001, value: 12.5, datetime: { utc: '2026-09-18T10:00:00Z' } },
          { sensorsId: 7001, value: 14.1, datetime: { utc: FRESH } },
          { sensorsId: 7002, value: 61, datetime: { utc: FRESH } },
          // A sensor the directory doesn't carry (co, humidity…) falls out.
          { sensorsId: 9999, value: 3, datetime: { utc: FRESH } },
        ],
      },
      station,
      NOW,
    )
    expect(values).toHaveLength(2)
    expect(values.find((v) => v.variable === 'pm25')).toEqual({
      variable: 'pm25',
      value: 14.1,
      units: 'µg/m³',
      utc: FRESH,
    })
  })

  it('drops stale and negative values', () => {
    const values = latestValues(
      {
        results: [
          { sensorsId: 7001, value: 12.5, datetime: { utc: '2026-09-16T11:00:00Z' } },
          { sensorsId: 7002, value: -1, datetime: { utc: FRESH } },
        ],
      },
      station,
      NOW,
    )
    expect(values).toEqual([])
  })
})
