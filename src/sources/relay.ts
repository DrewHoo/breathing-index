/**
 * The relay is the one server this app runs (worker/): it holds the API keys
 * a public client cannot, caches by grid cell, and refuses any location
 * sharper than one decimal degree. Rounding here, before a request leaves the
 * browser, is the client's half of that promise — the relay never receives
 * what it would refuse, and neither end trusts the other to be the only gate.
 */
export const RELAY_BASE = 'https://breathing-index-worker.drewhoo.workers.dev'

/** ~11 km: all the relay is allowed to know, and all it would accept. */
export const coarse = (x: number): string => x.toFixed(1)
