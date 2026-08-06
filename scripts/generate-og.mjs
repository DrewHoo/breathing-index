// Generate public/og.png (1200x630 share card). Run: node scripts/generate-og.mjs
import sharp from 'sharp'

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#11151c"/>
      <stop offset="1" stop-color="#0a0d12"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- breath-lines mark -->
  <g stroke="#4b7fc4" stroke-width="16" stroke-linecap="round">
    <line x1="92" y1="120" x2="212" y2="120" opacity="0.55"/>
    <line x1="92" y1="152" x2="248" y2="152"/>
    <line x1="92" y1="184" x2="184" y2="184" opacity="0.8"/>
  </g>

  <text x="92" y="300" font-family="-apple-system, 'Segoe UI', system-ui, sans-serif"
        font-size="76" font-weight="800" fill="#f5f7fa">Breathing Index</text>
  <text x="92" y="366" font-family="-apple-system, 'Segoe UI', system-ui, sans-serif"
        font-size="34" fill="#9fb0c3">The official AQI called a smoke day "Moderate."</text>
  <text x="92" y="412" font-family="-apple-system, 'Segoe UI', system-ui, sans-serif"
        font-size="34" fill="#9fb0c3">This app takes your lungs' word for it instead.</text>

  <!-- the four levels -->
  <g font-family="-apple-system, 'Segoe UI', system-ui, sans-serif" font-weight="800" font-size="120" text-anchor="middle">
    <text x="880" y="200" fill="#4caf50">1</text>
    <text x="990" y="200" fill="#d4a017">2</text>
    <text x="1100" y="200" fill="#ff7a33">3</text>
    <text x="990" y="330" fill="#e05252">4</text>
  </g>

  <!-- mini prediction curve -->
  <g transform="translate(820,380)">
    <rect x="0" y="40" width="20" height="24" rx="3" fill="#4caf50"/>
    <rect x="26" y="32" width="20" height="32" rx="3" fill="#d4a017"/>
    <rect x="52" y="32" width="20" height="32" rx="3" fill="#d4a017"/>
    <rect x="78" y="16" width="20" height="48" rx="3" fill="#ff7a33"/>
    <rect x="104" y="16" width="20" height="48" rx="3" fill="#ff7a33"/>
    <rect x="130" y="40" width="20" height="24" rx="3" fill="#4caf50"/>
    <rect x="156" y="32" width="20" height="32" rx="3" fill="#d4a017"/>
    <rect x="182" y="0" width="20" height="64" rx="3" fill="#e05252"/>
    <rect x="208" y="16" width="20" height="48" rx="3" fill="#ff7a33"/>
    <rect x="234" y="40" width="20" height="24" rx="3" fill="#4caf50"/>
  </g>

  <rect x="0" y="614" width="1200" height="16" fill="#1f4e8c"/>
  <text x="92" y="576" font-family="-apple-system, 'Segoe UI', system-ui, sans-serif"
        font-size="28" fill="#6b7c90">drewhoover.com/breathing-index</text>
</svg>`

await sharp(Buffer.from(svg)).png().toFile('public/og.png')
console.log('wrote public/og.png')
