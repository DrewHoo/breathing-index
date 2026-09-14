import { describe, expect, it } from 'vitest'
import { ALL_STATIONS, availableStations, findStation, nabEnabled, publicStation } from './stations'

describe('the station directory', () => {
  it('has one row per id', () => {
    const ids = ALL_STATIONS.map((station) => station.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('names a shape and a plausible place for every row', () => {
    for (const station of ALL_STATIONS) {
      expect(station.url).toMatch(/^https:\/\//)
      expect(Math.abs(station.lat)).toBeLessThanOrEqual(90)
      expect(Math.abs(station.lon)).toBeLessThanOrEqual(180)
      // Nothing in v1 is at Null Island, and the NAB's own station list has
      // bogus coordinates in it (Alto Valle, Argentina, at 35.2, -91.8).
      expect(station.lat === 0 && station.lon === 0).toBe(false)
      if (!station.genusLevel) expect(station.genera).toHaveLength(0)
    }
  })

  it('gates every NAB row and no other', () => {
    for (const station of ALL_STATIONS) {
      expect(station.gated === true).toBe(station.shape === 'nab')
      if (station.shape === 'nab') expect(station.id).toMatch(/^nab:[0-9a-f-]{36}$/)
    }
  })
})

describe('the NAB flag', () => {
  it('is on for "1" and for nothing else', () => {
    // It is a licence term, not a preference. A flag that also accepts "true",
    // "yes" and "on" is a flag that turns itself on by accident.
    expect(nabEnabled('1')).toBe(true)
    for (const off of ['0', '', 'true', 'yes', 'on', ' 1', undefined]) expect(nabEnabled(off)).toBe(false)
  })

  it('keeps the gated stations out of the directory until it is on', () => {
    const off = availableStations('0')
    expect(off.every((station) => station.shape !== 'nab')).toBe(true)
    expect(off).toHaveLength(4)
    expect(availableStations('1').length).toBeGreaterThan(off.length)
  })
})

describe('looking a station up', () => {
  it('finds the ones the client will ask for', () => {
    expect(findStation('stl-county')?.shape).toBe('rss')
    expect(findStation('houston-hhd')?.shape).toBe('houston')
    expect(findStation('kc-childrens-mercy')?.shape).toBe('kc')
    expect(findStation('canton-oh')?.shape).toBe('canton')
    expect(findStation('nab:9eec5ce0-6c54-4f8e-bd16-2c9e85ae9820')?.shape).toBe('nab')
  })

  it('answers nothing for an id it does not have', () => {
    // Which the route turns into a 404, never an empty reading.
    expect(findStation('')).toBeNull()
    expect(findStation('waterbury')).toBeNull()
    expect(findStation('nab:not-a-guid')).toBeNull()
  })
})

describe('what the client is told', () => {
  it('never carries a URL or a parser shape', () => {
    for (const station of ALL_STATIONS) {
      const shown = publicStation(station) as Record<string, unknown>
      expect(shown).not.toHaveProperty('url')
      expect(shown).not.toHaveProperty('shape')
      expect(shown).not.toHaveProperty('gated')
      expect(JSON.stringify(shown)).not.toContain('https://')
      expect(shown.id).toBe(station.id)
    }
  })
})
