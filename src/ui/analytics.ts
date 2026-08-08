/**
 * Lazy-loaded Mixpanel, per the drewhoover.com sibling-site pattern.
 * The token is public by design (write-only ingestion). The chunk is
 * code-split so the main bundle stays small, and a blocked load fails
 * silently — analytics must never break the app.
 *
 * Privacy: events answer "do people log, and does anything break" and
 * nothing else. No property may describe the user's body or their air —
 * no rating, tag, note, coordinate, or pollutant value — and IP-derived
 * geolocation is off, so the diary really does stay on the phone.
 * Opting out in Settings keeps the chunk from loading at all.
 */
import { loadSettings } from './settings'

const TOKEN = '1c6a0f45b8a5768185a8d9a2f4d65452'

type Props = Record<string, unknown>

let mp: typeof import('mixpanel-browser').default | null = null
let optedOut = false
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

function load(): void {
  import('mixpanel-browser')
    .then((m) => {
      mp = m.default
      mp.init(TOKEN, {
        // Pageview on initial load and on every history-API URL change,
        // so each route (and future shareable URL state) counts.
        track_pageview: 'url-with-path-and-query-string',
        // Mixpanel geolocates the request IP by default. A city is a
        // location, and this app already knows where you breathe.
        ip: false,
        property_blacklist: ['$city', '$region', 'mp_country_code'],
      })
      if (optedOut) mp.opt_out_tracking()
      else flush()
    })
    .catch(() => {
      // Adblockers commonly block anything with 'mixpanel' in the URL.
      queue.length = 0
    })
}

if (typeof window !== 'undefined') {
  optedOut = !loadSettings().analyticsEnabled
  if (!optedOut) load()
}

/** Settings toggle. Off silences the automatic pageviews too, not just track(). */
export function setAnalyticsEnabled(enabled: boolean): void {
  optedOut = !enabled
  if (!enabled) {
    queue.length = 0
    try {
      mp?.opt_out_tracking()
    } catch {
      /* analytics must never throw */
    }
  } else if (mp) {
    try {
      mp.opt_in_tracking()
    } catch {
      /* analytics must never throw */
    }
  } else {
    load()
  }
}

export function track(name: string, props?: Props): void {
  if (optedOut) return
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
