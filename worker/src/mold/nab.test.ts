import { describe, expect, it } from 'vitest'
import { NAB_LOOKBACK_DAYS, nabQuery, parseNabSets } from './nab'

const HOUSTON = '9eec5ce0-6c54-4f8e-bd16-2c9e85ae9820'

const mold = (name: string, value: number) => ({
  value,
  allergen: { name, commonName: name, category: 'MOLD', type: 'SPORE' },
})
const pollen = (name: string, value: number) => ({
  value,
  allergen: { name, commonName: name, category: 'WEED', type: 'POLLEN' },
})
const payload = (...sets: unknown[]) => ({ data: { allergenCollectionSets: sets } })

describe('the NAB query', () => {
  const query = nabQuery(HOUSTON, new Date(Date.UTC(2026, 7, 15)))

  it('writes the dynamic-LINQ filter the endpoint actually accepts', () => {
    // Escaped quotes around the Guid, and a bare DateTime literal — a quoted
    // ISO date breaks the LINQ parser rather than returning nothing.
    expect(query).toContain(`stationId == Guid(\\"${HOUSTON}\\")`)
    expect(query).toContain('date >= DateTime(2026,8,15)')
    expect(query).toContain('order: "date desc"')
    expect(query).not.toContain('2026-08-15')
  })

  it('refuses a station id that is not a guid', () => {
    // The filter is a string this code concatenates, so the one thing that
    // must never be true is that an arbitrary id can reach it.
    expect(() => nabQuery('houston-hhd', new Date())).toThrow()
    expect(() => nabQuery(`${HOUSTON}") || true || Guid("`, new Date())).toThrow()
  })

  it('looks back far enough for a long weekend', () => {
    expect(NAB_LOOKBACK_DAYS).toBeGreaterThanOrEqual(7)
  })
})

describe('reading a collection set', () => {
  it('keeps the mold rows, sums them, and slugs the genus', () => {
    expect(
      parseNabSets(
        payload({
          date: '2026-09-11',
          station: { name: 'City of Houston' },
          allergenCollections: [
            mold('Cladosporium', 591),
            pollen('Ambrosia', 40),
            mold('Penicillium / Aspergillus', 210),
            mold('Alternaria', 4),
          ],
        }),
      ),
    ).toEqual({
      date: '2026-09-11',
      total: 805,
      category: null,
      genera: { cladosporium: 591, penicillium_aspergillus: 210, alternaria: 4 },
    })
  })

  it('skips a pollen-only day and takes the newest set that has mold', () => {
    // A station that counts pollen daily and mold most days would otherwise
    // read as "no mold" on exactly the days a reader was quick about it.
    const parsed = parseNabSets(
      payload(
        { date: '2026-09-12', allergenCollections: [pollen('Ambrosia', 40)] },
        { date: '2026-09-11', allergenCollections: [mold('Cladosporium', 591)] },
      ),
    )
    expect(parsed?.date).toBe('2026-09-11')
    expect(parsed?.total).toBe(591)
  })

  it('skips the record dated 0202-11-05', () => {
    // It is really in there.
    const parsed = parseNabSets(
      payload(
        { date: '0202-11-05T00:00:00', allergenCollections: [mold('Cladosporium', 9)] },
        { date: '2026-09-11T00:00:00', allergenCollections: [mold('Cladosporium', 591)] },
      ),
    )
    expect(parsed?.date).toBe('2026-09-11')
  })

  it('is nothing at all rather than an undated number', () => {
    expect(parseNabSets(payload())).toBeNull()
    expect(parseNabSets(payload({ allergenCollections: [mold('Cladosporium', 591)] }))).toBeNull()
    expect(parseNabSets({ errors: [{ message: 'nope' }] })).toBeNull()
    expect(parseNabSets(null)).toBeNull()
    expect(parseNabSets('<html>')).toBeNull()
  })

  it('ignores a row with no usable value', () => {
    const parsed = parseNabSets(
      payload({
        date: '2026-09-11',
        allergenCollections: [
          mold('Cladosporium', 591),
          { value: null, allergen: { name: 'Alternaria', category: 'MOLD' } },
          { value: 12, allergen: null },
        ],
      }),
    )
    expect(parsed?.genera).toEqual({ cladosporium: 591 })
    expect(parsed?.total).toBe(591)
  })
})
