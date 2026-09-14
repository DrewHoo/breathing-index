import { describe, expect, it } from 'vitest'
import capture from '../../../tests/fixtures/mold/stl.rss?raw'
import { parseStlRss } from './rss'

describe('St. Louis County’s RSS feed', () => {
  it('reads the live capture', () => {
    expect(parseStlRss(capture)).toEqual({
      date: '2026-09-11',
      total: 54862,
      category: 'Very High',
      genera: {},
    })
  })

  it('takes the date from pubDate without a timezone round trip', () => {
    // The feed states no offset. Parsing `Fri, 11 Sep 2026 08:38:09` through
    // Date and formatting in UTC is how a morning post becomes the previous
    // day; the parser reads the calendar fields and leaves the clock alone.
    const feed = (pubDate: string) =>
      `<rss><channel><item><title>Mold Count: 10 (Low)</title><pubDate>${pubDate}</pubDate></item></channel></rss>`
    expect(parseStlRss(feed('Mon, 1 Jan 2024 23:59:00'))?.date).toBe('2024-01-01')
    expect(parseStlRss(feed('Fri, 11 Sep 2026 00:15:00'))?.date).toBe('2026-09-11')
  })

  it('is not a reading without a date', () => {
    expect(
      parseStlRss('<rss><channel><item><title>Mold Count: 54862 (Very High)</title></item></channel></rss>'),
    ).toBeNull()
    expect(parseStlRss('<rss><channel></channel></rss>')).toBeNull()
    expect(parseStlRss('<html>nope</html>')).toBeNull()
  })

  it('reports a dated item with an unreadable title as a null total', () => {
    // A day the feed publishes but the title is reworded: dated, and honestly
    // numberless, rather than a zero nobody measured.
    const parsed = parseStlRss(
      '<rss><channel><item><title>No count today</title><pubDate>Fri, 11 Sep 2026 08:38:09</pubDate></item></channel></rss>',
    )
    expect(parsed).toEqual({ date: '2026-09-11', total: null, category: null, genera: {} })
  })
})
