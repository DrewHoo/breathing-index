// Generate one 1200x630 share card per content page.
// Run: node scripts/generate-content-og.mjs
//
//   public/og-why-aqi-lies.png        /why-aqi-lies-to-your-lungs
//   public/og-smoke-vs-ozone.png      /smoke-vs-ozone
//   public/og-what-moderate-means.png /what-moderate-means
//
// Same language as the app's own card (scripts/generate-og.mjs): paper ground,
// one white card, hairline rules, severity carried by ink weight with a single
// alarm colour. Each card carries the essay's actual receipt rather than a
// decorative image — the number is the reason to click.
//
// Note the unit: the bundled Instrument Sans TTFs have no "µ" or "³" glyph, so
// concentrations here are spelled out in words.
import {
  footer,
  frame,
  regular,
  semibold,
  bold,
  text,
  measure,
  write,
  ALARM,
  FAINT,
  HAIRLINE,
  INK,
  RULE,
  SECONDARY,
  WASH,
} from './og-lib.mjs'

const L = 104 // left margin, matching the app card
const R = 1096

/** The kicker + two-line headline every content card opens with. */
function head(kicker, line1, line2) {
  return [
    text(semibold, kicker, L, 128, 22, FAINT),
    text(bold, line1, L, 190, 46, INK),
    line2 ? text(bold, line2, L, 244, 46, INK) : '',
  ].join('\n  ')
}

// --- 1. Why the AQI lies to your lungs ---------------------------------------
// The two receipts, side by side, with the felt outcome under each. The point
// of the card is that the alarming label was the walkable day.
function whyAqiLies() {
  const row = (x, place, index, label, outcome, tone) =>
    [
      text(semibold, place, x, 350, 22, SECONDARY),
      text(bold, index, x, 416, 52, INK),
      text(regular, label, x, 452, 24, SECONDARY),
      text(semibold, outcome, x, 490, 26, tone),
    ].join('\n  ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  ${frame}
  ${head('BREATHING INDEX', 'Why the AQI lies to your lungs', '')}
  ${text(regular, 'Same lungs, three days apart. The milder-sounding label was the worse day.', L, 286, 26, SECONDARY)}

  <line x1="${L}" y1="312" x2="${R}" y2="312" stroke="${HAIRLINE}" stroke-width="2"/>
  ${row(L, 'AMSTERDAM', 'LKI 7–8', '"insufficient"', 'Walked for hours', SECONDARY)}
  <line x1="620" y1="330" x2="620" y2="510" stroke="${HAIRLINE}" stroke-width="2"/>
  ${row(660, 'HAMDEN, CT', 'US AQI 70', '"Moderate"', 'Cut the walk short', ALARM)}

  ${footer}
</svg>`
}

// --- 2. Smoke vs ozone -------------------------------------------------------
// Two bar pairs. The fine fraction is the whole argument, so the bars are drawn
// to the real ratios: 14.0/15.0 measured on the smoke day, against a coarse-
// dominated day for contrast.
function smokeVsOzone() {
  const BASE = 458
  const MAX = 148
  const W = 108
  const GAP = 26

  const pair = (x, fine, coarse, title, ratio) => {
    const hi = Math.max(fine, coarse)
    const bar = (bx, value, fill) => {
      const h = Math.round((value / hi) * MAX)
      return `<rect x="${bx}" y="${BASE - h}" width="${W}" height="${h}" rx="6" fill="${fill}"/>`
    }
    return [
      text(semibold, title, x, 300, 26, INK),
      text(regular, ratio, x + measure(semibold, title, 26) + 14, 300, 24, SECONDARY),
      bar(x, fine, INK),
      bar(x + W + GAP, coarse, RULE),
      text(regular, 'PM2.5', x + W / 2, BASE + 30, 22, SECONDARY, 'middle'),
      text(regular, 'PM10', x + W + GAP + W / 2, BASE + 30, 22, SECONDARY, 'middle'),
    ].join('\n  ')
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  ${frame}
  ${head('BREATHING INDEX', 'Smoke vs ozone:', 'same AQI, different lungs')}

  ${pair(150, 14.0, 15.0, 'Smoke day', 'fine fraction 0.93')}
  ${pair(700, 4.5, 15.0, 'Dust day', 'fine fraction 0.30')}

  ${footer}
</svg>`
}

// --- 3. What "Moderate" actually means ---------------------------------------
// One band, one word, ticked at both ends and at the AQI 70 that started this.
function whatModerateMeans() {
  const X0 = L
  const X1 = R
  const Y = 336
  const H = 64
  const at = (value) => X0 + ((value - 9.1) / (35.4 - 9.1)) * (X1 - X0)

  const tick = (value, caption, tone) =>
    [
      `<line x1="${at(value)}" y1="${Y - 14}" x2="${at(value)}" y2="${Y + H + 14}" stroke="${tone}" stroke-width="3"/>`,
      text(bold, String(value), at(value), Y + H + 46, 34, tone, 'middle'),
      text(regular, caption, at(value), Y + H + 78, 21, SECONDARY, 'middle'),
    ].join('\n  ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  ${frame}
  ${head('BREATHING INDEX', 'What "Moderate" actually means', '')}
  ${text(regular, 'PM2.5, in micrograms per cubic meter. One word, end to end.', L, 286, 26, SECONDARY)}

  <rect x="${X0}" y="${Y}" width="${X1 - X0}" height="${H}" rx="10" fill="${WASH}"/>
  ${text(semibold, 'MODERATE', (X0 + X1) / 2, Y + 44, 32, SECONDARY, 'middle')}

  ${tick(9.1, 'AQI 51', INK)}
  ${tick(19.3, 'AQI 70 — cut the walk short', ALARM)}
  ${tick(35.4, 'AQI 100', INK)}

  ${footer}
</svg>`
}

await write(whyAqiLies(), 'public/og-why-aqi-lies.png')
await write(smokeVsOzone(), 'public/og-smoke-vs-ozone.png')
await write(whatModerateMeans(), 'public/og-what-moderate-means.png')
