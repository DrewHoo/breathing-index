import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchMold,
  fetchMoldStations,
  genusExposure,
  genusVariable,
  milesOf,
  nearestStations,
  recallMoldReadings,
  rememberMoldReading,
  type MoldReading,
  type MoldStation,
} from './mold'

/** The tests run in node; this is the whole storage surface the module uses. */
const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
})
afterEach(() => vi.unstubAllGlobals())

const station = (over: Partial<MoldStation> = {}): MoldStation => ({
  id: 'houston-hhd',
  name: 'Houston Health Department',
  city: 'Houston',
  state: 'TX',
  lat: 29.71,
  lon: -95.39,
  cadence: 'weekdays',
  precision: 'count',
  units: 'spores/m3',
  genusLevel: true,
  genera: ['alternaria', 'cladosporium'],
  ...over,
})

/** Houston's 2026-09-11 page, trimmed to the keys that matter here. */
const houston = {
  stationId: 'houston-hhd',
  name: 'Houston Health Department',
  date: '2026-09-11',
  total: 5116,
  category: 'LOW',
  genera: {
    alternaria: 4,
    ascospores: 3547,
    cladosporium: 591,
    penicillium_aspergillus: 210,
  },
  precision: 'count',
  units: 'spores/m3',
  fetchedAt: '2026-09-14T06:00:52.959Z',
}

const reading = (over: Partial<MoldReading> = {}): MoldReading => ({
  stationId: 'houston-hhd',
  name: 'Houston Health Department',
  date: '2026-09-11',
  total: 5116,
  category: 'LOW',
  genera: {},
  precision: 'count',
  units: 'spores/m3',
  ...over,
})

const stubFetch = (handler: (url: string) => unknown): void => {
  vi.stubGlobal('fetch', (url: string) => Promise.resolve(handler(url)))
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) })
const failed = (status: number) => ({ ok: false, status, json: () => Promise.resolve({}) })

describe('the genus map', () => {
  it('maps the two genera with an asthma literature behind them', () => {
    expect(genusVariable('alternaria')).toBe('mold_alternaria')
    expect(genusVariable('cladosporium')).toBe('mold_cladosporium')
  })

  it('ignores a combined bucket that happens to start with a name it knows', () => {
    // Children's Mercy publishes this as one number: 378 spores of three
    // genera, with no way to know how many were Alternaria. A prefix match
    // would have filed all 378 as Alternaria — a count nobody took.
    expect(genusVariable('alternaria_aspergillus_penicillium')).toBeNull()
    expect(genusVariable('penicillium_aspergillus')).toBeNull()
  })

  it('ignores every taxon this app has no evidence about', () => {
    // Counted, published, and unclaimed as an acute asthma trigger. They ride
    // in the total and get no variable of their own.
    expect(genusVariable('ascospores')).toBeNull()
    expect(genusVariable('ascospores_undifferentiated')).toBeNull()
    expect(genusVariable('basidiospores')).toBeNull()
  })

  it('takes only the exact keys out of a reading', () => {
    expect(genusExposure(reading({ genera: houston.genera }))).toEqual({
      mold_alternaria: 4,
      mold_cladosporium: 591,
    })
  })

  it('is empty for a station that publishes a total alone', () => {
    expect(genusExposure(reading({ genera: {} }))).toEqual({})
  })
})

describe('fetchMold', () => {
  it('parses a station reading', async () => {
    stubFetch(() => ok(houston))
    await expect(fetchMold('houston-hhd')).resolves.toEqual({
      ...houston,
      precision: 'count',
      units: 'spores/m3',
    })
  })

  it('keeps a null total, which is a reading and not a failure', async () => {
    // Canton out of season states its date and no number: "nothing counted
    // today" is a different claim from "the scraper broke".
    stubFetch(() => ok({ ...houston, stationId: 'canton-oh', total: null, genera: {} }))
    const answer = await fetchMold('canton-oh')
    expect(answer?.total).toBeNull()
    expect(answer?.date).toBe('2026-09-11')
  })

  it('answers null for every way the relay can refuse', async () => {
    for (const status of [403, 404, 502]) {
      stubFetch(() => failed(status))
      await expect(fetchMold('nab:whoever')).resolves.toBeNull()
    }
  })

  it('answers null when the network does not answer at all', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    await expect(fetchMold('houston-hhd')).resolves.toBeNull()
  })

  it('refuses a body with no date on it', async () => {
    // The one failure this route cannot afford: Waterbury Hospital has
    // rendered a normal-looking count page for four years past its last
    // reading. A number with no date is indistinguishable from that.
    stubFetch(() => ok({ ...houston, date: undefined }))
    await expect(fetchMold('houston-hhd')).resolves.toBeNull()
  })

  it('drops a genus value that is not a number', async () => {
    stubFetch(() => ok({ ...houston, genera: { alternaria: 4, cladosporium: 'lots' } }))
    const answer = await fetchMold('houston-hhd')
    expect(answer?.genera).toEqual({ alternaria: 4 })
  })
})

describe('the station directory', () => {
  it('caches the relay’s list and answers the next call from storage', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      calls.push(url)
      return Promise.resolve(ok([station()]))
    })
    await expect(fetchMoldStations()).resolves.toHaveLength(1)
    await expect(fetchMoldStations()).resolves.toHaveLength(1)
    expect(calls).toHaveLength(1)
  })

  it('serves the stale list rather than an empty menu when the relay is down', async () => {
    stubFetch(() => ok([station()]))
    await fetchMoldStations()
    // A day and a bit later, with the relay unreachable. Forgetting the
    // directory would empty the picker under a station already chosen.
    store.set(
      'breathing-index.moldStations.v1',
      JSON.stringify({ at: Date.now() - 26 * 3_600_000, stations: [station()] }),
    )
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    await expect(fetchMoldStations()).resolves.toHaveLength(1)
  })

  it('is honestly empty on a browser that has never seen it', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    await expect(fetchMoldStations()).resolves.toEqual([])
  })
})

describe('nearestStations', () => {
  const HOUSTON = station()
  const CANTON = station({ id: 'canton-oh', name: 'Canton City Public Health', city: 'Canton', state: 'OH', lat: 40.8, lon: -81.38 })
  const STL = station({ id: 'stl-county', name: 'St. Louis County', city: 'St. Louis', state: 'MO', lat: 38.75, lon: -90.34 })

  it('sorts nearest first', () => {
    // Read from Hamden, CT, which is the case this app was built for: the
    // nearest counting station is several states away.
    const ranked = nearestStations([HOUSTON, STL, CANTON], 41.396, -72.897)
    expect(ranked.map((s) => s.id)).toEqual(['canton-oh', 'stl-county', 'houston-hhd'])
    expect(milesOf(ranked[0]!.km)).toBeGreaterThan(400)
  })

  it('collapses two rows for one trap onto the ungated one', () => {
    // With MOLD_NAB_ENABLED on, Houston is both a health department and an NAB
    // station: one microscope, two directory rows, disagreeing about genus
    // spelling. The local row wins because it is the one that survives the
    // flag going off.
    const nab = station({ id: 'nab:9eec5ce0', name: 'City of Houston' })
    const ranked = nearestStations([nab, HOUSTON, CANTON], 29.71, -95.39)
    expect(ranked.map((s) => s.id)).toEqual(['houston-hhd', 'canton-oh'])
  })

  it('keeps two stations a city apart as two stations', () => {
    const other = station({ id: 'houston-other', lat: 29.4, lon: -98.62 })
    expect(nearestStations([HOUSTON, other], 29.71, -95.39)).toHaveLength(2)
  })
})

describe('the mold history store', () => {
  it('reads back what a fetch wrote down, under the station’s own date', () => {
    rememberMoldReading(reading())
    expect(recallMoldReadings('houston-hhd').get('2026-09-11')?.total).toBe(5116)
  })

  it('keeps a day with a null total, because that is a reading too', () => {
    rememberMoldReading(reading({ stationId: 'canton-oh', date: '2026-11-20', total: null }))
    const days = recallMoldReadings('canton-oh')
    expect(days.has('2026-11-20')).toBe(true)
    expect(days.get('2026-11-20')?.total).toBeNull()
  })

  it('keeps stations apart', () => {
    rememberMoldReading(reading())
    rememberMoldReading(reading({ stationId: 'canton-oh', total: 8670 }))
    expect(recallMoldReadings('houston-hhd').get('2026-09-11')?.total).toBe(5116)
    expect(recallMoldReadings('canton-oh').get('2026-09-11')?.total).toBe(8670)
  })

  it('caps at fourteen days per station, keeping the newest', () => {
    for (let d = 1; d <= 20; d++) {
      rememberMoldReading(reading({ date: `2026-09-${String(d).padStart(2, '0')}`, total: d }))
    }
    const days = recallMoldReadings('houston-hhd')
    expect(days.size).toBe(14)
    expect(days.has('2026-09-20')).toBe(true)
    expect(days.has('2026-09-06')).toBe(false)
  })

  it('caps at four stations, dropping the least recently written', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) rememberMoldReading(reading({ stationId: id }))
    expect(recallMoldReadings('a').size).toBe(0)
    expect(recallMoldReadings('e').size).toBe(1)
  })

  it('survives a storage that refuses to answer', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('private mode')
      },
      setItem: () => {
        throw new Error('private mode')
      },
    })
    expect(() => rememberMoldReading(reading())).not.toThrow()
    expect(recallMoldReadings('houston-hhd').size).toBe(0)
  })
})
