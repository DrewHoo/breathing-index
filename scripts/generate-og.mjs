// Generate public/og.png (1200x630 share card). Run: node scripts/generate-og.mjs
//
// The card is drawn in the "Clear Air" language the app itself uses: paper
// ground, one white card, hairline rules, and severity carried by ink weight
// with a single alarm color at level 4. The scale rail is lifted straight from
// the home screen, because that is the thing worth recognising in a feed.
//
// Display text is converted to outlines rather than set as <text>. sharp's
// bundled libvips resolves font families through its own fontconfig and will
// not pick up a font directory we hand it, so live text would silently fall
// back to a system face and lose the brand entirely. Outlines render the same
// everywhere and need nothing installed.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'
import sharp from 'sharp'

const font = (weight) =>
  opentype.parse(
    readFileSync(fileURLToPath(new URL(`./fonts/InstrumentSans-${weight}.ttf`, import.meta.url)))
      .buffer,
  )

const regular = font(400)
const semibold = font(600)
const bold = font(700)

// --- design tokens, kept in step with src/styles.css -------------------------
const PAPER = '#f3f6f7'
const CARD = '#ffffff'
const INK = '#22303a'
const SECONDARY = '#64757f'
const FAINT = '#93a3ac'
const HAIRLINE = '#dce4e8'
const RULE = '#c7d2d8'
const LEVEL = ['#a7b6be', '#7a8b94', '#3b4a54', '#c13a31'] // --l1 … --l4

/**
 * Set `str` as outlines. `anchor` mirrors SVG text-anchor.
 *
 * Glyphs are walked one at a time rather than going through getPath/
 * getAdvanceWidth: those run opentype's shaping pass, which throws on this
 * font's ccmp lookup (type 6, format 2 — unimplemented upstream). Going
 * straight through the cmap sidesteps shaping we do not need for Latin text,
 * and lets us measure and kern in the same walk.
 */
function text(face, str, x, y, size, fill, anchor = 'start') {
  const scale = size / face.unitsPerEm
  const glyphs = [...str].map((ch) => face.charToGlyph(ch))

  let width = 0
  glyphs.forEach((glyph, i) => {
    if (i > 0) width += face.getKerningValue(glyphs[i - 1], glyph) * scale
    width += glyph.advanceWidth * scale
  })

  let pen = x + (anchor === 'middle' ? -width / 2 : anchor === 'end' ? -width : 0)
  const d = glyphs
    .map((glyph, i) => {
      if (i > 0) pen += face.getKerningValue(glyphs[i - 1], glyph) * scale
      const path = glyph.getPath(pen, y, size).toPathData(2)
      pen += glyph.advanceWidth * scale
      return path
    })
    .join(' ')

  return `<path d="${d}" fill="${fill}"/>`
}

const LEVELS = [
  { n: '1', label: 'Easy' },
  { n: '2', label: 'Noticeable' },
  { n: '3', label: 'Limiting' },
  { n: '4', label: 'Dangerous' },
]

// A plausible ozone day: quiet overnight, ramping through the afternoon, easing
// off after the peak. Echoes the hourly strip on the home screen, and makes the
// point that the day is a shape rather than a single number.
const HOURS = [
  0.24, 0.22, 0.2, 0.2, 0.23, 0.28, 0.35, 0.43, 0.51, 0.59, 0.67, 0.75, 0.83, 0.91, 0.96, 0.92,
  0.84, 0.73, 0.61, 0.5, 0.4, 0.33, 0.28, 0.25,
]
const levelOf = (h) => (h < 0.35 ? 0 : h < 0.62 ? 1 : h < 0.94 ? 2 : 3)

const BAR_W = 10
const BAR_GAP = 4
const BAR_MAX = 92
const BARS_BASE = 214
const BARS_X = 1096 - (HOURS.length * (BAR_W + BAR_GAP) - BAR_GAP)

const bars = HOURS.map((h, i) => {
  const height = Math.round(h * BAR_MAX)
  const x = BARS_X + i * (BAR_W + BAR_GAP)
  return `<rect x="${x}" y="${BARS_BASE - height}" width="${BAR_W}" height="${height}" rx="3" fill="${LEVEL[levelOf(h)]}"/>`
}).join('\n  ')

const RAIL_Y = 350
const RAIL_X0 = 190
const RAIL_X1 = 1010
const step = (RAIL_X1 - RAIL_X0) / (LEVELS.length - 1)

const rail = [
  `<line x1="${RAIL_X0}" y1="${RAIL_Y}" x2="${RAIL_X1}" y2="${RAIL_Y}" stroke="${RULE}" stroke-width="3" stroke-linecap="round"/>`,
  // end caps, as on the home-screen rail
  `<line x1="${RAIL_X0}" y1="${RAIL_Y - 11}" x2="${RAIL_X0}" y2="${RAIL_Y + 11}" stroke="${RULE}" stroke-width="3" stroke-linecap="round"/>`,
  `<line x1="${RAIL_X1}" y1="${RAIL_Y - 11}" x2="${RAIL_X1}" y2="${RAIL_Y + 11}" stroke="${RULE}" stroke-width="3" stroke-linecap="round"/>`,
  ...LEVELS.flatMap((lv, i) => {
    const x = RAIL_X0 + i * step
    return [
      text(bold, lv.n, x, RAIL_Y + 78, 62, LEVEL[i], 'middle'),
      text(regular, lv.label, x, RAIL_Y + 116, 23, SECONDARY, 'middle'),
    ]
  }),
].join('\n  ')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${PAPER}"/>
  <rect x="40" y="40" width="1120" height="550" rx="22" fill="${CARD}" stroke="${HAIRLINE}" stroke-width="2"/>

  ${text(bold, 'Breathing Index', 104, 148, 54, INK)}
  ${text(regular, 'Per-pollutant air data and a personal 1–4 index,', 104, 206, 27, SECONDARY)}
  ${text(regular, 'learned from your own symptom diary.', 104, 244, 27, SECONDARY)}

  ${bars}

  ${rail}

  <line x1="104" y1="510" x2="1096" y2="510" stroke="${HAIRLINE}" stroke-width="2"/>
  ${text(semibold, 'breathingindex.com', 104, 552, 24, FAINT)}
</svg>`

await sharp(Buffer.from(svg)).png().toFile('public/og.png')
console.log('wrote public/og.png')
