/**
 * Lazy-loaded Mixpanel, per the drewhoover.com sibling-site pattern.
 * The token is public by design (write-only ingestion). The chunk is
 * code-split so the main bundle stays small, and a blocked load fails
 * silently — analytics must never break the app.
 *
 * Privacy, and the line it draws: nothing the app *learned about you* may
 * ever leave in an event — no rating, tag, note, diary text, granted
 * coordinate, or pollutant value. That list is closed; adding to it is not
 * a judgement call. IP-derived city/region/country is on the other side of
 * the line and deliberately on: it is ambient request metadata every server
 * already sees, and it answers the two questions this project has to answer —
 * whether anyone but me uses the app, and where they are, so integrations
 * get built for the places people actually breathe in.
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

/**
 * My own devices, marked once by loading the app with ?dev=1 and marked for
 * good after that. Reports filter on `internal`; without it my testing is
 * indistinguishable from the handful of real users I am trying to count.
 * Deliberately not a Setting: it is a developer switch, not a user promise,
 * and a UI for it would only invite someone to hide their own usage.
 */
const INTERNAL_KEY = 'breathing-index.internal.v1'

function markInternalFromUrl(): void {
  try {
    if (new URLSearchParams(location.search).get('dev') === '1') {
      localStorage.setItem(INTERNAL_KEY, '1')
    }
  } catch {
    /* analytics must never throw */
  }
}

/** Super property, so every event from this device carries it — including
 *  the automatic pageviews, which no track() call site can reach. */
function registerInternal(): void {
  try {
    if (localStorage.getItem(INTERNAL_KEY) === '1') mp?.register({ internal: true })
  } catch {
    /* analytics must never throw */
  }
}

function load(): void {
  import('mixpanel-browser')
    .then((m) => {
      mp = m.default
      mp.init(TOKEN, {
        // Pageview on initial load and on every history-API URL change,
        // so each route (and future shareable URL state) counts.
        track_pageview: 'url-with-path-and-query-string',
        // Let Mixpanel derive city/region/country from the request address.
        // This is the coarse, ambient geography — never the precise location
        // the browser grants us, which no event carries. Default is already
        // true; stated outright because this used to be false and the reason
        // for the reversal belongs next to the switch.
        ip: true,
      })
      registerInternal()
      if (optedOut) mp.opt_out_tracking()
      else flush()
    })
    .catch(() => {
      // Adblockers commonly block anything with 'mixpanel' in the URL.
      queue.length = 0
    })
}

if (typeof window !== 'undefined') {
  // Before the opt-out check: the mark has to survive being set while pings
  // are off, so turning them back on later still lands on the right side.
  markInternalFromUrl()
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
    // Opting out can clear stored super properties; re-assert the mark.
    registerInternal()
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
