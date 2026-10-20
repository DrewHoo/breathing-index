// Tells Bing (and the other IndexNow engines: Yandex, Seznam, Naver) which
// pages to recrawl, after a deploy. Bing's index is what ChatGPT search,
// Copilot and DuckDuckGo answer from, and it crawls a small site slowly on
// its own. Google ignores IndexNow; scripts/gsc.mjs sitemap is its equivalent.
//
//   node scripts/indexnow.mjs      every URL in the live sitemap
//
// The key is public by design: a file under public/ whose name and content
// are the key, which proves to the engines that whoever pings owns the host.
// Run after the deploy, so the key file and the pages are live. It reports
// and exits 0 on any failure: a missed ping never fails a deploy.
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HOST = 'breathingindex.com'
const SITE = `https://${HOST}/`
const ENDPOINT = 'https://api.indexnow.org/indexnow'
const BATCH = 10000 // the protocol's cap per request

const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
const keyFile = readdirSync(publicDir).find((f) => /^[0-9a-f]{32}\.txt$/.test(f))
if (!keyFile) {
  console.log('indexnow: no key file under public/, skipped')
  process.exit(0)
}
const key = keyFile.slice(0, -4)
const keyLocation = `${SITE}${keyFile}`

// Pages can take a minute to serve a fresh deploy, so the key file gets a few tries.
async function keyIsLive() {
  for (let i = 0; i < 6; i++) {
    const res = await fetch(keyLocation, { cache: 'no-store' }).catch(() => null)
    if (res?.ok && (await res.text()).trim() === key) return true
    await new Promise((r) => setTimeout(r, 20000))
  }
  return false
}

async function main() {
  if (!(await keyIsLive())) {
    console.log(`indexnow: the key file isn't live at ${keyLocation}, skipped`)
    return
  }
  const res = await fetch(`${SITE}sitemap.xml`, { cache: 'no-store' })
  if (!res.ok) {
    console.log(`indexnow: sitemap ${res.status}, skipped`)
    return
  }
  const urls = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => u.startsWith(SITE))
  for (let i = 0; i < urls.length; i += BATCH) {
    const urlList = urls.slice(i, i + BATCH)
    const ping = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key, keyLocation, urlList }),
    })
    // 200 accepted, 202 accepted while the key is checked; 403 key not
    // valid, 422 a URL outside the key's scope, 429 too often
    console.log(`indexnow: ${urlList.length} URLs → ${ping.status} ${ping.statusText} ${(await ping.text()).slice(0, 200)}`)
  }
}

main().catch((e) => console.log(`indexnow: ${e instanceof Error ? e.message : e}`))
