import { describe, expect, it } from 'vitest'
import { SMOKE_MIN_PM25, smokeFingerprint } from './smoke'

describe('smokeFingerprint', () => {
  it('fires on the M1 reading that named it', () => {
    // Hamden, that hour's model PM2.5 14.0 / PM10 15.0 — ratio 0.93
    // (docs/m1-findings.md).
    expect(smokeFingerprint({ pm25: 14, pm10: 15 })).toBe(true)
  })

  it('stays quiet when the coarse fraction is there', () => {
    // Same fine mass, twice the coarse mass: road and construction dust.
    expect(smokeFingerprint({ pm25: 14, pm10: 30 })).toBe(false)
  })

  it('needs enough mass for the ratio to mean anything', () => {
    // A clean day divides two small numbers into a big ratio and says nothing.
    expect(smokeFingerprint({ pm25: 2, pm10: 2 })).toBe(false)
    expect(smokeFingerprint({ pm25: SMOKE_MIN_PM25, pm10: SMOKE_MIN_PM25 })).toBe(true)
  })

  it('says nothing without both halves of the measurement', () => {
    expect(smokeFingerprint({ pm25: 40 })).toBe(false)
    expect(smokeFingerprint({ pm10: 40 })).toBe(false)
    expect(smokeFingerprint({})).toBe(false)
  })

  it('answers about the hour it is handed, not the day around it', () => {
    // 3 pm, when the plume arrived: fine-mode and unmistakable.
    expect(smokeFingerprint({ pm25: 40, pm10: 44 })).toBe(true)
    // The same day's 24-hour means — one smoky hour in twenty-four — read as
    // ordinary road dust. Which is why this takes `Hour.raw` and not the
    // window features the rows are graded on.
    expect(smokeFingerprint({ pm25: 3.5, pm10: 12 })).toBe(false)
  })

  it('holds the line exactly at the fine fraction', () => {
    expect(smokeFingerprint({ pm25: 85, pm10: 100 })).toBe(true)
    expect(smokeFingerprint({ pm25: 84, pm10: 100 })).toBe(false)
  })
})
