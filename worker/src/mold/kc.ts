/**
 * Children's Mercy Kansas City — one stable URL, a summary table and a
 * top-five table, every weekday.
 *
 *     Location | Pollen per m3 of air | Mold per m3 of air
 *     KC Metro | 59 (Moderate)        | 12685 (Moderate)
 *
 * Two things about this page are worth stating out loud, because both are
 * traps a "grab the first number" parser walks straight into.
 *
 * The first is that pollen and mold are adjacent cells of one row and both are
 * `N (Band)`. Reading forward from the mold *header* does not help — the
 * header is the last cell of its row, so the next `N (Band)` after it is the
 * pollen value from the row below. The mold number is found by locating the
 * mold column's index among the headers and reading that index of the data
 * row, which also survives the hospital adding or dropping a column.
 *
 * The second is the date. The page states its reporting date in an
 * `<h2 class="internal-heading">` above the table, and then, a few lines
 * below, renders a regional air-quality forecast image for a *different and
 * later* day ("SkyCast for September 14, 2026" on a page reporting
 * 2026-09-11). "The first date on the page" would be right and "the obvious
 * date near the numbers" would be three days wrong, so this parser reads the
 * heading element and nothing else.
 *
 * The genus split is a *top five*, so its membership rotates daily and one of
 * its rows is a combined bucket (`Alternaria & Aspergillus/Penicillium`). The
 * slug keeps that bucket combined rather than crediting Alternaria with a
 * number that is not Alternaria's.
 */
import { type MoldObservation, genusSlug, monthNameDate, parseCount, stripTags } from './reading'

/** The reporting date's own element. Matched on the class rather than on the
 * text so that the SkyCast line below cannot answer for it. */
const HEADING = /<h2\b[^>]*class="[^"]*internal-heading[^"]*"[^>]*>([\s\S]*?)<\/h2>/i

/** `Mold per m3 of air` as a column header. `<span class="super">3</span>`
 * makes the superscript a tag, so on stripped text this reads
 * `Mold per m 3 of air`. */
const MOLD_COLUMN = /Mold per m\s*3?\s*of air/i

/** `12685 (Moderate)` */
const COUNT_AND_BAND = /^(\d[\d,]*)\s*\(([^)]*)\)/

const TABLE = /<table\b[^>]*>([\s\S]*?)<\/table>/gi
const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
const CELL = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi

/** A table as rows of stripped cell text. The page nests no tables, so the
 * lazy match to the first `</table>` is the whole of one. */
const tableRows = (table: string): string[][] =>
  [...table.matchAll(ROW)].map((row) =>
    [...(row[1] ?? '').matchAll(CELL)].map((cell) => stripTags(cell[1] ?? '')),
  )

export function parseKansasCity(html: string): MoldObservation | null {
  const heading = HEADING.exec(html)?.[1]
  const date = heading === undefined ? null : monthNameDate(stripTags(heading))
  if (date === null) return null

  let total: number | null = null
  let category: string | null = null
  const genera: Record<string, number> = {}

  for (const table of html.matchAll(TABLE)) {
    const rows = tableRows(table[1] ?? '')
    const header = rows[0]
    if (header === undefined) continue

    const moldColumn = header.findIndex((cell) => MOLD_COLUMN.test(cell))
    if (moldColumn !== -1) {
      // The summary table. The first data row is the KC Metro row; if the
      // hospital ever lists more than one location, the first is the metro
      // figure the page leads with.
      const summary = COUNT_AND_BAND.exec(rows[1]?.[moldColumn] ?? '')
      total = parseCount(summary?.[1])
      category = summary?.[2]?.trim() || null
      continue
    }

    // The top-five table: `Mold | Count per m3 of air | Percent`. Recognised
    // by its own header rather than by position, and its rows are taken only
    // when the second cell is a plain count — which drops the header row and
    // any footer added later.
    if (!/^Mold$/i.test(header[0] ?? '') || !/Count per m/i.test(header[1] ?? '')) continue
    for (const row of rows.slice(1)) {
      const name = row[0]?.trim()
      const count = parseCount(row[1])
      if (name === undefined || name === '' || count === null) continue
      genera[genusSlug(name)] = count
    }
  }

  return { date, total, category, genera }
}
