import { describe, expect, it } from 'vitest'
import { decodeEntities, genusSlug, isoDate, monthNameDate, parseCount, stripTags } from './reading'

describe('the genus slug', () => {
  it('agrees on a combined bucket however the publisher punctuates it', () => {
    // The NAB writes `Penicillium / Aspergillus`, Houston writes it closed up.
    expect(genusSlug('Penicillium / Aspergillus')).toBe('penicillium_aspergillus')
    expect(genusSlug('Penicillium/Aspergillus')).toBe('penicillium_aspergillus')
    expect(genusSlug('Smuts/Myxomycetes')).toBe('smuts_myxomycetes')
    expect(genusSlug('Unidentified Molds')).toBe('unidentified_molds')
    // Children's Mercy's top-five row really is three taxa in one bucket, and
    // it stays one key rather than being credited to Alternaria.
    expect(genusSlug('Alternaria & Aspergillus/Penicillium')).toBe(
      'alternaria_aspergillus_penicillium',
    )
  })

  it('slugs what the publisher wrote, misspellings included', () => {
    // Houston's own spelling. Canonicalising taxonomy is a mapping table the
    // client owns, not something a slug function should quietly decide.
    expect(genusSlug('Dreshslera/Helminthosporium')).toBe('dreshslera_helminthosporium')
    expect(genusSlug('Drechslera')).toBe('drechslera')
  })

  it('flattens accents and trims the edges', () => {
    expect(genusSlug('  Ustilágo  ')).toBe('ustilago')
  })
})

describe('stripping markup', () => {
  it('puts a space where the tag was', () => {
    // `<td>Cladosporium</td><td>8719</td>` must not become one token.
    expect(stripTags('<td>Cladosporium</td><td>8719</td>')).toBe('Cladosporium 8719')
  })

  it('decodes the entities these pages actually use', () => {
    expect(stripTags('<li>Alternaria:&nbsp;4</li>')).toBe('Alternaria: 4')
    expect(stripTags('<td>Alternaria &amp; Aspergillus</td>')).toBe('Alternaria & Aspergillus')
    expect(decodeEntities('&#x41;&#66;&notanentity;')).toBe('AB&notanentity;')
  })

  it('drops scripts and comments whole', () => {
    expect(stripTags('<p>a</p><script>var x = "<b>no</b>"</script><!-- hi --><p>b</p>')).toBe('a b')
  })
})

describe('counts', () => {
  it('reads thousands commas and refuses anything else', () => {
    expect(parseCount('5,116')).toBe(5116)
    expect(parseCount(' 12685 ')).toBe(12685)
    expect(parseCount('0')).toBe(0)
    for (const bad of ['', 'Low', '-4', '4.5', '1,2,3.0', null, undefined])
      expect(parseCount(bad)).toBeNull()
  })
})

describe('dates', () => {
  it('builds an ISO day without going through Date', () => {
    expect(isoDate(2026, 9, 11)).toBe('2026-09-11')
    expect(isoDate(2026, 12, 1)).toBe('2026-12-01')
    for (const [y, m, d] of [
      [2026, 13, 1],
      [2026, 0, 1],
      [2026, 9, 32],
      [202, 9, 11],
      [2026, 9, 1.5],
    ] as const)
      expect(isoDate(y, m, d)).toBeNull()
  })

  it('reads Month D, YYYY however the publisher spaces it', () => {
    // Houston writes both of these in the same week.
    expect(monthNameDate('Houston Pollen and Mold Count-Friday, September 11,2026')).toBe(
      '2026-09-11',
    )
    expect(monthNameDate('Wednesday, September 9, 2026')).toBe('2026-09-09')
    expect(monthNameDate('Sept. 9 2026')).toBe('2026-09-09')
    expect(monthNameDate('Friday, September 11, 2026')).toBe('2026-09-11')
  })

  it('finds no date where there is none', () => {
    expect(monthNameDate('Mold Count: 54862 (Very High)')).toBeNull()
    expect(monthNameDate('september-112026')).toBeNull()
  })
})
