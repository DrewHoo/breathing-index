// Generate the PWA icon set from a single master SVG (breath-lines mark).
// Run: node scripts/generate-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const master = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1f4e8c"/>
  <g stroke="#ffffff" stroke-width="44" stroke-linecap="round">
    <line x1="128" y1="176" x2="384" y2="176" opacity="0.55"/>
    <line x1="128" y1="256" x2="416" y2="256"/>
    <line x1="128" y1="336" x2="328" y2="336" opacity="0.8"/>
  </g>
</svg>`

const maskable = master.replace('rx="96"', 'rx="0"')

await mkdir('public/icons', { recursive: true })
await writeFile('public/favicon.svg', master)

const jobs = [
  { size: 512, file: 'public/icons/icon-512.png', svg: master },
  { size: 192, file: 'public/icons/icon-192.png', svg: master },
  { size: 512, file: 'public/icons/maskable-512.png', svg: maskable },
  { size: 180, file: 'public/icons/apple-touch-icon.png', svg: maskable },
  { size: 32, file: 'public/icons/favicon-32.png', svg: master },
]

for (const { size, file, svg } of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file)
  console.log(`wrote ${file}`)
}
