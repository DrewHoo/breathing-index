/**
 * St. Louis County Department of Public Health, via its RSS feed.
 *
 * The oldest mold record in the country — daily counts since 1960 — published
 * by an ASP.NET site whose feed is one `<item>` and about a kilobyte:
 *
 *     <title>Mold Count: 54862 (Very High) </title>
 *     <pubDate>Fri, 11 Sep 2026 08:38:09</pubDate>
 *
 * Total only. The public page splits pollen by taxon and never splits the
 * mold, so `genera` is empty here and the station row says `genusLevel: false`
 * rather than leaving the client to infer it from an empty object.
 *
 * The number has no stated unit anywhere on the site, which is why the station
 * row carries `units: 'count'`. 54,862 is plausible as spores/m³ for a Missouri
 * September and this parser is not going to be the thing that decides that.
 */
import { type MoldObservation, decodeEntities, isoDate, parseCount } from './reading'

/** `Mold Count: 54862 (Very High)` — the count, and the band in parentheses. */
const TITLE = /Mold\s+Count:\s*([\d,]+)\s*(?:\(([^)]*)\))?/i

/** `Fri, 11 Sep 2026 08:38:09`. Note what is missing: a timezone. The feed
 * states none, so the instant is unknowable and the date is all that is taken
 * — which is all the reading wants. `new Date()` would happily parse this
 * string against the worker's UTC clock and could hand back the previous day
 * for a feed posted at 08:38 local. */
const PUB_DATE = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const tagText = (xml: string, tag: string): string | null => {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml)
  return match?.[1] === undefined ? null : decodeEntities(match[1]).trim()
}

/**
 * The newest item in the feed, or null when it has no date.
 *
 * Only the first `<item>` is read. The feed has carried exactly one for as
 * long as anyone has looked, and if it ever carries a backlog, the first is
 * still the newest — RSS orders newest-first and this feed's `skipDays` block
 * says the publisher thinks in one-post-per-weekday terms.
 */
export function parseStlRss(xml: string): MoldObservation | null {
  const item = /<item[^>]*>([\s\S]*?)<\/item>/i.exec(xml)?.[1]
  if (item === undefined) return null

  const pubDate = tagText(item, 'pubDate')
  const stamp = pubDate === null ? null : PUB_DATE.exec(pubDate)
  if (!stamp) return null
  const month = MONTHS.indexOf((stamp[2] ?? '').toLowerCase()) + 1
  const date = isoDate(Number(stamp[3]), month, Number(stamp[1]))
  if (date === null) return null

  // A dated item with an unreadable title is still not a reading: the title is
  // the only place the number lives. Total null, and the route answers with it
  // rather than inventing a zero.
  const title = tagText(item, 'title') ?? ''
  const count = TITLE.exec(title)
  return {
    date,
    total: parseCount(count?.[1]),
    category: count?.[2]?.trim() || null,
    genera: {},
  }
}
