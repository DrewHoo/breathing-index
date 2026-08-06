/**
 * Lazy-loaded Mixpanel, per the drewhoover.com sibling-site pattern.
 * The token is public by design (write-only ingestion). The chunk is
 * code-split so the main bundle stays small, and a blocked load fails
 * silently — analytics must never break the app.
 *
 * Privacy: never send diary note text or coordinates; ratings and tag
 * names only.
 */
const TOKEN = '1c6a0f45b8a5768185a8d9a2f4d65452'

type Props = Record<string, unknown>

let mp: typeof import('mixpanel-browser').default | null = null
const queue: [string, Props | undefined][] = []

function flush(): void {
  for (const args of queue) {
    try {
      mp?.track(...args)
    } catch {
      /* analytics must never throw */
    }
  }
  queue.length = 0
}

if (typeof window !== 'undefined') {
  import('mixpanel-browser')
    .then((m) => {
      mp = m.default
      mp.init(TOKEN, {
        // Pageview on initial load and on every history-API URL change,
        // so each route (and future shareable URL state) counts.
        track_pageview: 'url-with-path-and-query-string',
      })
      flush()
    })
    .catch(() => {
      // Adblockers commonly block anything with 'mixpanel' in the URL.
      queue.length = 0
    })
}

export function track(name: string, props?: Props): void {
  if (mp) {
    try {
      mp.track(name, props)
    } catch {
      /* analytics must never throw */
    }
  } else {
    queue.push([name, props])
  }
}
