import { describe, expect, it } from 'vitest'
import index from '../../../tests/fixtures/mold/houston.html?raw'
import day from '../../../tests/fixtures/mold/houston-day.html?raw'
import { houstonDate, newestHoustonDay, parseHoustonDay } from './houston'

describe('the Houston index', () => {
  it('finds the newest daily page in the live capture', () => {
    expect(newestHoustonDay(index)).toEqual({
      href: '/services/pollen-mold/houston-pollen-mold-count-friday-september-112026',
      date: '2026-09-11',
    })
  })

  it('sorts by the parsed date rather than by document order', () => {
    // The index is a Drupal view, and a view's sort is a setting.
    const link = (href: string, text: string) => `<li><a href="${href}" hreflang="en">${text}</a></li>`
    const shuffled = [
      link('/services/pollen-mold/houston-pollen-mold-count-tuesday-september-8-2026', 'Count - Tuesday, September 8, 2026'),
      link('/Services/pollen-mold/houston-pollen-mold-count-friday-september-112026', 'Count-Friday, September 11,2026'),
      link('/services/pollen-mold/houston-pollen-mold-count-wednesday-september-9-2026', 'Count - Wednesday, September 9, 2026'),
    ].join('')
    expect(newestHoustonDay(shuffled)?.date).toBe('2026-09-11')
  })

  it('drops a link whose date will not parse rather than ranking it last', () => {
    const usable = '<a href="/x/houston-pollen-mold-count-y">Count - Tuesday, September 8, 2026</a>'
    const useless = '<a href="/x/houston-pollen-mold-count-latest">Latest count</a>'
    expect(newestHoustonDay(useless + usable)?.date).toBe('2026-09-08')
    expect(newestHoustonDay(useless)).toBeNull()
  })

  it('reads either slug shape when the link text cannot answer', () => {
    expect(houstonDate('', '/a/houston-pollen-mold-count-friday-september-112026')).toBe('2026-09-11')
    expect(houstonDate('', '/a/houston-pollen-mold-count-wednesday-september-9-2026')).toBe('2026-09-09')
    expect(houstonDate('', '/a/houston-pollen-mold-count-thursday-october-12026')).toBe('2026-10-01')
    expect(houstonDate('', '/a/nothing-here')).toBeNull()
  })
})

describe('one Houston daily page', () => {
  const parsed = parseHoustonDay(day)

  it('reads the summary box', () => {
    expect(parsed?.date).toBe('2026-09-11')
    expect(parsed?.total).toBe(5116)
    expect(parsed?.category).toBe('LOW')
  })

  it('reads all twenty named spore rows', () => {
    expect(Object.keys(parsed?.genera ?? {})).toHaveLength(20)
    expect(parsed?.genera).toMatchObject({
      alternaria: 4,
      ascospores: 3547,
      basidiospores: 469,
      cladosporium: 591,
      dreshslera_helminthosporium: 10,
      penicillium_aspergillus: 210,
      smuts_myxomycetes: 78,
      torula: 0,
    })
    // The genus rows sum to the total the page states independently.
    const sum = Object.values(parsed?.genera ?? {}).reduce((a, b) => a + b, 0)
    expect(sum).toBe(parsed?.total)
  })

  it('scopes past the tree, grass and weed lists above it', () => {
    // Same markup, same page, a few hundred bytes earlier.
    expect(parsed?.genera).not.toHaveProperty('acer_maple')
    expect(parsed?.genera).not.toHaveProperty('ambrosia_ragweed')
  })

  it('does not read "Major mold spores counted" as the summary box', () => {
    // The summary match is case-sensitive for exactly this reason: the heading
    // and the box differ only in case.
    const reordered = '<title>Count - Friday, September 11, 2026</title><h3>Major mold spores counted</h3><ul><li>Alternaria: 4</li></ul><p>MOLD SPORES LOW 5,116</p>'
    expect(parseHoustonDay(reordered)?.total).toBe(5116)
  })

  it('falls back to the slug when the page title has no date', () => {
    const titleless = day.replace(/<title>[\s\S]*?<\/title>/i, '<title>Houston Health</title>')
    expect(parseHoustonDay(titleless, '/a/houston-pollen-mold-count-friday-september-112026')?.date).toBe('2026-09-11')
    expect(parseHoustonDay(titleless)).toBeNull()
  })
})
