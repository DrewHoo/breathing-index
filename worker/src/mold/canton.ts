/**
 * Canton City Public Health — three taxa and a date, in a table somebody types
 * into a CivicPlus rich-text editor every weekday morning.
 *
 *     Reporting date:  2026-09-11
 *     Grass - 0 | Tree - 0 | Weed - 41 | Mold - 9070
 *     ...
 *     Species Present:  Cladosporium (4310)
 *                       Alternaria (360)
 *                       Unidentified Molds (4400)
 *     Category: Moderate
 *
 * The date is the easy one on this page: ISO already, and stated as the
 * reporting date rather than as a publication date.
 *
 * The layout is four columns — grass, tree, weed, mold, in that order — and
 * every column has its own `Species Present:` cell and its own `Category:`
 * cell. Mold is last, so this parser takes the last of each. That is one
 * assumption, stated once, and it is the load-bearing one: if the column order
 * ever changes, the genera go wrong along with the category, and they go wrong
 * visibly (Ragweed is not a spore) rather than quietly.
 *
 * The total is the sum of the taxa rather than the `Mold - 9070` header,
 * because the sum is the number the per-genus rows actually commit to. On the
 * captured day the two agree exactly, which is the reassurance and not the
 * rule.
 *
 * Counts are rounded to the nearest 10 by the lab, and the station is
 * seasonal: out of season the page keeps rendering with a fresh date and no
 * species, which is a dated reading with a null total and not a failure.
 */
import { type MoldObservation, genusSlug, parseCount, stripTags } from './reading'

/** `<strong>Reporting date: &nbsp;</strong><strong>2026-09-11</strong>` — the
 * label and the value are separate elements, so this one runs on stripped
 * text. */
const REPORTING_DATE = /Reporting date:?\s*(\d{4})-(\d{2})-(\d{2})/i

/** `Cladosporium (4310)`, `Unidentified Molds (4400)` — a taxon name and a
 * parenthesised count, matched only inside the mold column's cell. */
const SPECIES = /([A-Za-z][A-Za-z./' -]*?)\s*\((\d[\d,]*)\)/g

/** `Category: Moderate`, up to the end of the text node. Run against raw
 * markup on purpose: the cell's closing tag is the delimiter, and on stripped
 * text the band would run on into the bullet list that follows the table. */
const CATEGORY = /Category:\s*([^<&]+)/g

export function parseCanton(html: string): MoldObservation | null {
  const stamp = REPORTING_DATE.exec(stripTags(html))
  if (!stamp) return null
  const date = `${stamp[1]}-${stamp[2]}-${stamp[3]}`

  // The mold column's species cell: the last `Species Present:` in the
  // document, up to the end of the cell holding it.
  const genera: Record<string, number> = {}
  let total: number | null = null
  const lastSpecies = html.lastIndexOf('Species Present:')
  if (lastSpecies !== -1) {
    const rest = html.slice(lastSpecies)
    const end = rest.search(/<\/td>/i)
    for (const match of stripTags(end === -1 ? rest : rest.slice(0, end)).matchAll(SPECIES)) {
      const count = parseCount(match[2])
      const name = match[1]?.trim()
      if (name === undefined || name === '' || count === null) continue
      genera[genusSlug(name)] = count
      total = (total ?? 0) + count
    }
  }

  const bands = [...html.matchAll(CATEGORY)]
  const category = bands[bands.length - 1]?.[1]?.trim() ?? ''

  return { date, total, category: category || null, genera }
}
