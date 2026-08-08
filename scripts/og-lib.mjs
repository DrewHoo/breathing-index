// Shared drawing kit for the share cards: generate-og.mjs (the app's card) and
// generate-content-og.mjs (one per essay).
//
// Display text is converted to outlines rather than set as <text>. sharp's
// bundled libvips resolves font families through its own fontconfig and will
// not pick up a font directory we hand it, so live text would silently fall
// back to a system face and lose the brand entirely. Outlines render the same
// everywhere and need nothing installed.
//
// The bundled Instrument Sans TTFs have no glyph for "µ" or "³" — anything
// setting a concentration has to spell the unit out in words instead.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'
import sharp from 'sharp'

const face = (weight) =>
  opentype.parse(
    readFileSync(fileURLToPath(new URL(`./fonts/InstrumentSans-${weight}.ttf`, import.meta.url)))
      .buffer,
  )

export const regular = face(400)
export const semibold = face(600)
export const bold = face(700)

// --- design tokens, kept in step with src/styles.css -------------------------
export const PAPER = '#f3f6f7'
export const CARD = '#ffffff'
export const INK = '#22303a'
export const SECONDARY = '#64757f'
export const FAINT = '#93a3ac'
export const HAIRLINE = '#dce4e8'
export const RULE = '#c7d2d8'
export const LEVEL = ['#a7b6be', '#7a8b94', '#3b4a54', '#c13a31'] // --l1 … --l4
export const ALARM = LEVEL[3]
export const WASH = '#e8eef1' // a fill one step off paper, for a band behind type

/**
 * Serialise a glyph outline to SVG path data.
 *
 * opentype's own `toPathData` is not usable here. Its rounding helper does
 * `Math.round(decimalPart + "e+2")`, and when a coordinate lands within a float
 * epsilon of an integer that decimal part stringifies in exponent form
 * ("5.55e-17e+2") and rounds to NaN. The path is still emitted, so the glyph
 * just silently vanishes from the card — which is exactly how the trailing "s"
 * of one headline went missing. Doing our own fixed-point walk avoids it.
 */
function pathData(path) {
  const n = (v) => Number(v.toFixed(2))
  return path.commands
    .map((c) => {
      switch (c.type) {
        case 'M':
          return `M${n(c.x)} ${n(c.y)}`
        case 'L':
          return `L${n(c.x)} ${n(c.y)}`
        case 'Q':
          return `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`
        case 'C':
          return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`
        default:
          return 'Z'
      }
    })
    .join('')
}

/** Advance width of `str` at `size`, kerned — for setting a run after another. */
export function measure(font, str, size) {
  const scale = size / font.unitsPerEm
  const glyphs = [...str].map((ch) => font.charToGlyph(ch))
  return glyphs.reduce(
    (width, glyph, i) =>
      width +
      (i > 0 ? font.getKerningValue(glyphs[i - 1], glyph) * scale : 0) +
      glyph.advanceWidth * scale,
    0,
  )
}

/**
 * Set `str` as outlines. `anchor` mirrors SVG text-anchor.
 *
 * Glyphs are walked one at a time rather than going through getPath/
 * getAdvanceWidth: those run opentype's shaping pass, which throws on this
 * font's ccmp lookup (type 6, format 2 — unimplemented upstream). Going
 * straight through the cmap sidesteps shaping we do not need for Latin text,
 * and lets us measure and kern in the same walk.
 */
export function text(font, str, x, y, size, fill, anchor = 'start') {
  const scale = size / font.unitsPerEm
  const glyphs = [...str].map((ch) => font.charToGlyph(ch))

  let width = 0
  glyphs.forEach((glyph, i) => {
    if (i > 0) width += font.getKerningValue(glyphs[i - 1], glyph) * scale
    width += glyph.advanceWidth * scale
  })

  let pen = x + (anchor === 'middle' ? -width / 2 : anchor === 'end' ? -width : 0)
  const d = glyphs
    .map((glyph, i) => {
      if (i > 0) pen += font.getKerningValue(glyphs[i - 1], glyph) * scale
      const path = pathData(glyph.getPath(pen, y, size))
      pen += glyph.advanceWidth * scale
      return path
    })
    .join(' ')

  return `<path d="${d}" fill="${fill}"/>`
}

/** The paper ground and single white card every share card sits on. */
export const frame = `<rect width="1200" height="630" fill="${PAPER}"/>
  <rect x="40" y="40" width="1120" height="550" rx="22" fill="${CARD}" stroke="${HAIRLINE}" stroke-width="2"/>`

/** The rule and wordmark along the bottom of the card. */
export const footer = `<line x1="104" y1="510" x2="1096" y2="510" stroke="${HAIRLINE}" stroke-width="2"/>
  ${text(semibold, 'breathingindex.com', 104, 552, 24, FAINT)}`

export async function write(svg, path) {
  await sharp(Buffer.from(svg)).png().toFile(path)
  console.log(`wrote ${path}`)
}
