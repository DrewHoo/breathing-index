// Generate the favicon and the PWA icon set. Run: node scripts/generate-icons.mjs
//
// Two marks, on purpose (Drew, 2026-09-14):
//
// - The favicon is an SVG whose only content is the lungs emoji as text, so
//   the browser draws it with the viewer's own emoji font — Apple's lungs in
//   Safari, Microsoft's in Edge on Windows. That is the same glyph the
//   wordmark shows, and it is "display" under Apple's font license rather
//   than redistribution of Apple's artwork. Safari renders SVG favicons from
//   version 26; older Safari falls through to the PNG links.
// - The PNGs (home screen, manifest, 32 px fallback) cannot use the device's
//   font, and shipping a rasterized Apple emoji is not licensed, so they carry
//   Microsoft's Fluent Emoji 3D lungs (MIT; scripts/assets/LICENSE-fluent-
//   emoji.txt) on the same blue tile. Closest open drawing to Apple's shaded
//   look. The source is 256 px, so 512 is a 2× upscale.
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const TILE = '#1f4e8c'
const LUNGS = 'scripts/assets/fluent-lungs-3d.png'

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="${TILE}"/>
  <text x="256" y="256" font-size="360" text-anchor="middle" dominant-baseline="central" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">🫁</text>
</svg>
`

await mkdir('public/icons', { recursive: true })
await writeFile('public/favicon.svg', favicon)
console.log('wrote public/favicon.svg')

/**
 * A tile with the lungs centred on it. `rounded` draws the tile's own corners
 * (browsers and launchers that show the icon as-is); the maskable and iOS
 * icons stay square because the platform applies its own mask, and `scale`
 * is the lungs' share of the tile — smaller on the maskable icon so the
 * drawing stays inside the 80 % safe zone once a circle is cut from it.
 */
async function icon(size, { rounded, scale }) {
  const rx = rounded ? Math.round((size * 96) / 512) : 0
  const tile = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${rx}" fill="${TILE}"/></svg>`,
  )
  const lungsSize = Math.round(size * scale)
  const lungs = await sharp(LUNGS).resize(lungsSize, lungsSize, { kernel: 'lanczos3' }).png().toBuffer()
  const offset = Math.round((size - lungsSize) / 2)
  return sharp(tile).composite([{ input: lungs, left: offset, top: offset }]).png()
}

const jobs = [
  { size: 512, file: 'public/icons/icon-512.png', rounded: true, scale: 0.7 },
  { size: 192, file: 'public/icons/icon-192.png', rounded: true, scale: 0.7 },
  { size: 512, file: 'public/icons/maskable-512.png', rounded: false, scale: 0.56 },
  { size: 180, file: 'public/icons/apple-touch-icon.png', rounded: false, scale: 0.68 },
  { size: 32, file: 'public/icons/favicon-32.png', rounded: true, scale: 0.8 },
]

for (const { size, file, rounded, scale } of jobs) {
  await (await icon(size, { rounded, scale })).toFile(file)
  console.log(`wrote ${file}`)
}
