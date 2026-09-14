/**
 * What every mold source is reduced to, and the text-wrangling that reduction
 * needs.
 *
 * Five publishers, five shapes, one reading. A hospital's ASP.NET table, a
 * city's Drupal page, a CivicPlus editor blob and a GraphQL API have nothing
 * in common except that each of them, once a weekday morning, states a date
 * and a number of spores. This module holds the shared vocabulary — the
 * reading, the genus slug, the date and number parsing — so that each parser
 * under `src/mold/` is only the part that is actually specific to its site.
 *
 * Nothing here imports a Cloudflare type or touches `fetch`, for the reason
 * `geo.ts` gives: the interesting logic should be testable in plain node off
 * the root vitest config, and it is (`*.test.ts` beside each module).
 *
 * No HTML parser. The shapes are small and the pages are stable enough that a
 * regex over tag-stripped text is honest about what it is: a scraper. A DOM
 * library would make it look sturdier than it is without making it sturdier.
 */

/**
 * One station's answer for one day, as the page states it.
 *
 * `date` is not optional and never inferred. A parser that cannot find the
 * date the page claims returns `null` instead of a reading, because the one
 * failure this route cannot afford is a stale page read as today's air:
 * Waterbury Hospital has rendered a normal-looking count page every day for
 * four years past its last real reading (2022-08-19). A number with no date is
 * indistinguishable from that.
 */
export interface MoldObservation {
  /** `YYYY-MM-DD`, exactly as the page states it — the station's own local
   * day, never shifted into UTC. A count is a 24-hour integration over a day
   * the station names; re-timezoning it would move it. */
  date: string
  /** Total spores. Null when the source states a date but no number — Canton
   * goes quiet out of season — which is a real state and not a parse failure. */
  total: number | null
  /** The publisher's own band ("LOW", "Very High", "Moderate"), verbatim.
   * Decoration for a `count` station; the number is the reading. */
  category: string | null
  /** Genus slug → count. Empty when the source publishes a total only. */
  genera: Record<string, number>
}

/** The normalised reading `/v1/mold` answers with: an observation plus who
 * measured it and in what. */
export interface MoldReading extends MoldObservation {
  stationId: string
  name: string
  /** `count` is a measured number of spores; `category` is a band with no
   * published mapping. Spec 28 §3: never fake a number from a category. Every
   * station in v1 is `count`; the field exists because half of what is out
   * there is not. */
  precision: 'count' | 'category'
  /** `spores/m3` where the publisher says so. St. Louis prints a number and
   * never names its unit, so it gets `count` — the client may compare it with
   * itself over time and must not compare it with Houston. */
  units: 'spores/m3' | 'count'
  /** When the relay fetched, which after six hours of KV is not when it
   * served. Debug metadata, never a freshness claim — `date` is the freshness
   * claim. */
  fetchedAt: string
}

/** The entities these five pages actually contain. `&nbsp;` is the one that
 * matters: Houston separates a genus from its count with it about half the
 * time and with a plain space the rest. */
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    const named = ENTITIES[body.toLowerCase()]
    if (named !== undefined) return named
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isNaN(code) ? whole : String.fromCodePoint(code)
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isNaN(code) ? whole : String.fromCodePoint(code)
    }
    return whole
  })
}

/**
 * Markup to the text a reader sees: scripts and styles dropped whole, every
 * other tag replaced by a space, entities decoded, whitespace collapsed.
 *
 * The space matters. `<td>Cladosporium</td><td>8719</td>` has to become
 * `Cladosporium 8719` and not `Cladosporium8719`, and Canton's entire page
 * body is one line, so there is no newline to fall back on.
 */
export function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    // NBSP survives the decode as U+00A0 and is not matched by \s in every
    // engine's mood; flatten it with the rest.
    .replace(/[\s ​]+/g, ' ')
    .trim()
}

/** `"5,116"` → 5116. Null for anything that is not a plain non-negative
 * integer with optional thousands commas — a count with a decimal point or a
 * sign is not a shape any of these pages publishes, and guessing at one would
 * be inventing data. */
export function parseCount(text: string | undefined | null): number | null {
  if (typeof text !== 'string') return null
  const digits = text.trim().replace(/,/g, '')
  if (!/^\d+$/.test(digits)) return null
  const value = Number(digits)
  return Number.isSafeInteger(value) ? value : null
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** `2026, 9, 11` → `"2026-09-11"`, or null if that is not a date. Built by
 * hand rather than through `Date`, which would drag the worker's UTC offset
 * into a day the station named in its own local time. */
export function isoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  if (!Number.isInteger(day) || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * The first `Month D, YYYY` in some text, as `YYYY-MM-DD`.
 *
 * Deliberately loose about the punctuation between the pieces, because the
 * publishers are: Houston writes `September 11,2026` one day and
 * `September 9, 2026` the next, in both the link text and the page title, and
 * Children's Mercy writes `Friday, September 11, 2026`.
 *
 * Deliberately *not* loose about where it is pointed. "The first date in the
 * page" is the wrong rule — Children's Mercy renders a regional air-quality
 * forecast for a later day a few lines below its own reporting date — so each
 * caller narrows the text to the element that carries the observation date
 * before asking.
 */
export function monthNameDate(text: string): string | null {
  const match =
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\s*(?:,\s*|,|\s+)(\d{4})\b/i.exec(
      text,
    )
  if (!match) return null
  const month = MONTHS[(match[1] ?? '').toLowerCase()]
  if (month === undefined) return null
  return isoDate(Number(match[3]), month, Number(match[2]))
}

/**
 * A publisher's name for a spore taxon, as a key.
 *
 * Lowercase ASCII, every run of anything else collapsed to an underscore:
 * `Penicillium / Aspergillus` and `Penicillium/Aspergillus` both become
 * `penicillium_aspergillus`, which is the point — two stations writing the
 * same combined bucket differently should agree on the key.
 *
 * What it deliberately does not do is canonicalise taxonomy. Houston writes
 * `Dreshslera/Helminthosporium`, the NAB writes `Drechslera`, and this
 * function slugs both faithfully rather than deciding which spelling is
 * right. The keys are a station's own vocabulary; a client that wants
 * cross-station genus comparison needs a mapping table it owns, and the honest
 * version of that is not a regex.
 */
export function genusSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
