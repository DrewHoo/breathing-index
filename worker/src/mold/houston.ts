/**
 * Houston Health Department — the best single-city mold source in the world
 * that anyone may read: 20 named spore taxa plus a total, every weekday.
 *
 * It costs two fetches because the city publishes one page per day and has no
 * canonical "today" URL. The slugs are hand-typed and inconsistent —
 * `...-friday-september-112026` on the 11th, `...-wednesday-september-9-2026`
 * on the 9th, and the path is `/Services/` about a quarter of the time — so
 * the newest day is found by crawling the index's links and reading the date
 * out of each, never by building a URL from today's calendar. A constructed
 * URL is a 404 on most days and, worse, could be a 200 on the wrong day.
 *
 * Step one is `newestHoustonDay` over the index; step two is
 * `parseHoustonDay` over the page it names. Both are pure; the fetching lives
 * in `index.ts` where the relay's cache is.
 */
import {
  type MoldObservation,
  genusSlug,
  monthNameDate,
  parseCount,
  stripTags,
} from './reading'

/** Every link on the index that looks like a daily count page, with its text.
 * Case-insensitive on the path because the city's is. */
const DAY_LINK = /<a\b[^>]*href="([^"]*pollen-mold-count[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi

/** `...-september-112026` and `...-september-9-2026` in one pattern: a month
 * name, one or two digits of day, an optional hyphen nobody is consistent
 * about, four digits of year. */
const SLUG_DATE =
  /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*-(\d{1,2})-?(\d{4})(?!\d)/i

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** The date a daily-count URL or link text names, as `YYYY-MM-DD`.
 *
 * The link text (`Houston Pollen and Mold Count-Friday, September 11,2026`) is
 * tried first because it is the human-readable statement of the date and the
 * slug is its typo-prone shadow; the slug is the fallback for a link whose
 * text is an image or a truncation. */
export function houstonDate(text: string, href: string): string | null {
  const fromText = monthNameDate(stripTags(text))
  if (fromText !== null) return fromText
  const slug = SLUG_DATE.exec(href)
  if (!slug) return null
  const month = MONTHS.indexOf((slug[1] ?? '').slice(0, 3).toLowerCase()) + 1
  if (month === 0) return null
  const day = Number(slug[2])
  const year = Number(slug[3])
  if (day < 1 || day > 31 || year < 1900 || year > 2200) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export interface HoustonDay {
  /** Href exactly as the index wrote it, to be resolved against the index URL.
   * Never rebuilt — see the module header. */
  href: string
  date: string
}

/**
 * The newest daily page the index links to.
 *
 * Sorted by the date parsed out of each link rather than trusted in document
 * order: the index is a Drupal view and a view's sort is a setting somebody
 * can change. A link whose date will not parse is dropped rather than ranked
 * last, because an unreadable date is exactly the case this whole route
 * refuses to guess at.
 */
export function newestHoustonDay(indexHtml: string): HoustonDay | null {
  const days: HoustonDay[] = []
  for (const match of indexHtml.matchAll(DAY_LINK)) {
    const href = match[1]
    if (href === undefined) continue
    const date = houstonDate(match[2] ?? '', href)
    if (date !== null) days.push({ href, date })
  }
  days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return days[0] ?? null
}

/** `MOLD SPORES` / band / total, as three stacked `<strong>`s in one centred
 * paragraph. Deliberately case-*sensitive*: the same page says "Major mold
 * spores counted" a few hundred bytes later, and a case-insensitive match
 * would happily read the genus heading as the summary box the day Drupal
 * reorders the components. */
const SUMMARY = /MOLD SPORES\s+(?:([A-Z][A-Z ]*?)\s+)?([\d,]+)/

/** The genus list's heading, and the list that follows it. Scoping to the one
 * `<ul>` after this heading is what keeps the tree, grass and weed lists —
 * same markup, same page — out of `genera`. */
const GENERA_BLOCK = /Major mold spores counted([\s\S]*?)<\/ul>/i
const LIST_ITEM = /<li\b[^>]*>([\s\S]*?)<\/li>/gi
/** `Alternaria:&nbsp;4`, `Cladosporium: 591`, `Penicillium/Aspergillus: 210` */
const GENUS_ROW = /^(.*?):\s*([\d,]+)$/

/**
 * One daily page.
 *
 * `href` is the URL the page came from, used only as a fallback source of the
 * date — the page's own `<title>` is asked first, because the reading should
 * be dated by the document that states the number and not by the link that
 * led to it.
 */
export function parseHoustonDay(html: string, href = ''): MoldObservation | null {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ''
  const date = houstonDate(title, href)
  if (date === null) return null

  const summary = SUMMARY.exec(stripTags(html))

  const genera: Record<string, number> = {}
  const block = GENERA_BLOCK.exec(html)?.[1]
  if (block !== undefined) {
    for (const item of block.matchAll(LIST_ITEM)) {
      const row = GENUS_ROW.exec(stripTags(item[1] ?? ''))
      const count = parseCount(row?.[2])
      const name = row?.[1]?.trim()
      if (name === undefined || name === '' || count === null) continue
      genera[genusSlug(name)] = count
    }
  }

  return {
    date,
    total: parseCount(summary?.[2]),
    category: summary?.[1]?.trim() || null,
    genera,
  }
}
