import { describe, expect, it, vi } from 'vitest'
import { buildModel } from '../engine/infer'
import { PRIORS } from '../engine/config'
import type { DiaryEntry } from '../engine/types'
import type { ExposureSeries, Hour } from '../sources/openMeteo'
import { backfillPending, isPending, resolvePending, settled } from './pendingExposure'
import { todaysSimilarEntries } from './recentEntry'

const HAMDEN = { lat: 41.396, lon: -72.897 }
const CHICAGO = { lat: 41.878, lon: -87.63 }

const hour = (time: string, pm25: number): Hour => ({
  time,
  exposure: { pm25, o3: 40, humidity: 60 },
  raw: { pm25 },
  official: { usAqi: pm25 * 2, eaqi: pm25 },
})

/** UTC-4: local 09:00 is 13:00Z. */
const series = (): ExposureSeries => ({
  hours: [hour('2026-08-07T08:00', 5), hour('2026-08-07T09:00', 31), hour('2026-08-07T10:00', 12)],
  currentIndex: 2,
  fetchedAt: '2026-08-07T14:05:00.000Z',
  source: 'cams',
  utcOffsetSeconds: -4 * 3600,
})

const pendingEntry = (over: Partial<DiaryEntry> = {}): DiaryEntry => ({
  id: 'p1',
  // 09:40 local, inside the 09:00 hour.
  time: '2026-08-07T13:40:00.000Z',
  rating: 3,
  exposure: {},
  pendingExposure: HAMDEN,
  ...over,
})

describe('resolvePending', () => {
  it('attaches the air of the hour the entry was logged in', () => {
    const [resolved] = resolvePending([pendingEntry()], series(), HAMDEN)
    expect(resolved!.exposure).toEqual({ pm25: 31, o3: 40, humidity: 60 })
    expect(resolved!.official).toEqual({ usAqi: 62, eaqi: 31 })
    expect(resolved!.exposureAgeMinutes).toBe(40)
    expect(isPending(resolved!)).toBe(false)
    expect('pendingExposure' in resolved!).toBe(false)
  })

  it('carries the provenance of the air it attached', () => {
    // A vector that arrives late is still evidence, and the engine has to know
    // which source taught it and which of its numbers were never measured.
    const late = series()
    late.hours[1] = { ...late.hours[1]!, estimated: ['ragweed_pollen'] }
    const [resolved] = resolvePending([pendingEntry()], late, HAMDEN)
    expect(resolved!.source).toBe('cams')
    expect(resolved!.estimated).toEqual(['ragweed_pollen'])
  })

  it('keeps the rating, the time and the tags', () => {
    const entry = pendingEntry({ note: 'stairs', confounders: ['allergies'] })
    const [resolved] = resolvePending([entry], series(), HAMDEN)
    expect(resolved).toMatchObject({ id: 'p1', time: entry.time, rating: 3, note: 'stairs' })
    expect(resolved!.confounders).toEqual(['allergies'])
  })

  it('keeps the one variable the feed cannot supply', () => {
    // "sick" is a tap on the entry, not a number in the series
    // (specs/26-sick-as-signal.md), and the air arriving late must not delete
    // it — the user can tap it the moment they log, hours before the hour's
    // vector shows up.
    const entry = pendingEntry({ exposure: { viral: 1 } })
    const [resolved] = resolvePending([entry], series(), HAMDEN)
    expect(resolved!.exposure).toEqual({ pm25: 31, o3: 40, humidity: 60, viral: 1 })
  })

  it('does not invent one for an entry that never claimed it', () => {
    const [resolved] = resolvePending([pendingEntry()], series(), HAMDEN)
    expect('viral' in resolved!.exposure).toBe(false)
  })

  it('refuses air measured somewhere else', () => {
    const diary = [pendingEntry()]
    expect(resolvePending(diary, series(), CHICAGO)).toBe(diary)
  })

  it('waits rather than guess when the series does not reach the hour', () => {
    const diary = [pendingEntry({ time: '2026-08-05T13:40:00.000Z' })]
    expect(resolvePending(diary, series(), HAMDEN)).toBe(diary)
  })

  it('leaves settled entries untouched, and the array identical', () => {
    const diary = [{ id: 'a', time: '2026-08-07T13:40:00.000Z', rating: 1, exposure: { pm25: 4 } }]
    expect(resolvePending(diary as DiaryEntry[], series(), HAMDEN)).toBe(diary)
  })
})

describe('backfillPending', () => {
  it('reports nothing to do when no entry is waiting', async () => {
    const settledDiary = [pendingEntry({ exposure: { pm25: 3 }, pendingExposure: undefined })]
    const fetchSeries = vi.fn()
    const next = await backfillPending(settledDiary, series(), HAMDEN, new Date(), fetchSeries)
    expect(next).toBeNull()
    expect(fetchSeries).not.toHaveBeenCalled()
  })

  it('uses the series already on screen without asking for another', async () => {
    const fetchSeries = vi.fn()
    const now = new Date('2026-08-07T14:05:00Z')
    const next = await backfillPending([pendingEntry()], series(), HAMDEN, now, fetchSeries)
    expect(next![0]!.exposure.pm25).toBe(31)
    expect(fetchSeries).not.toHaveBeenCalled()
  })

  it('fetches the history of the place the entry was logged at', async () => {
    const fetchSeries = vi.fn().mockResolvedValue(series())
    const now = new Date('2026-08-07T14:05:00Z')
    const next = await backfillPending([pendingEntry()], null, null, now, fetchSeries)
    expect(fetchSeries).toHaveBeenCalledWith(HAMDEN.lat, HAMDEN.lon, { airnow: true })
    expect(next![0]!.exposure.pm25).toBe(31)
  })

  it('asks the history for the same sources the live screen reads', async () => {
    // The active source is whatever the newest entry recorded, so a backfill
    // that came back on the model could be the entry that tips an `airnow`
    // diary over to `cams` and makes every station bound inert.
    const fetchSeries = vi.fn().mockResolvedValue(series())
    const now = new Date('2026-08-07T14:05:00Z')
    const stored = { airnow: true }
    vi.stubGlobal('localStorage', {
      getItem: () =>
        stored.airnow ? null : JSON.stringify({ airnowEnabled: false }),
    })
    await backfillPending([pendingEntry()], null, null, now, fetchSeries)
    expect(fetchSeries).toHaveBeenLastCalledWith(HAMDEN.lat, HAMDEN.lon, { airnow: true })

    stored.airnow = false
    await backfillPending([pendingEntry()], null, null, now, fetchSeries)
    expect(fetchSeries).toHaveBeenLastCalledWith(HAMDEN.lat, HAMDEN.lon, { airnow: false })
    vi.unstubAllGlobals()
  })

  it('leaves the entry pending when the network is still gone', async () => {
    const fetchSeries = vi.fn().mockRejectedValue(new Error('offline'))
    const now = new Date('2026-08-07T14:05:00Z')
    expect(await backfillPending([pendingEntry()], null, null, now, fetchSeries)).toBeNull()
  })

  it('does not chase an hour older than the API window', async () => {
    const fetchSeries = vi.fn()
    const old = pendingEntry({ time: '2026-08-01T13:40:00.000Z' })
    expect(await backfillPending([old], series(), HAMDEN, new Date(), fetchSeries)).toBeNull()
    expect(fetchSeries).not.toHaveBeenCalled()
  })
})

describe('a pending entry stays out of the model until it is filled in', () => {
  const now = new Date('2026-08-07T13:50:00.000Z')
  const air = { pm25: 31, o3: 40, humidity: 60 }

  it('is excluded from inference — an empty vector is unknown air, not clean air', () => {
    const pending = pendingEntry({ rating: 4 })
    expect(settled([pending])).toEqual([])
    // Left in, a rating of 4 with no exposures would land as a conflict.
    expect(buildModel(settled([pending])).conflicts).toEqual([])
    expect(buildModel([pending]).conflicts).toHaveLength(1)
  })

  it('is excluded from the similar-air hold-out, then counts once resolved', () => {
    const pending = pendingEntry()
    expect(todaysSimilarEntries([pending], air, PRIORS, now)).toEqual([])
    const resolved = resolvePending([pending], series(), HAMDEN)
    expect(todaysSimilarEntries(resolved, air, PRIORS, now).map((e) => e.id)).toEqual(['p1'])
    expect(buildModel(settled(resolved))).toBeTruthy()
    expect(settled(resolved)).toHaveLength(1)
  })
})
