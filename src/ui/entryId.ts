/**
 * A unique id for a diary entry.
 *
 * `crypto.randomUUID` only exists in a secure context. That is not a hypothetical
 * gap here: the app is reachable over plain HTTP both from the LAN address used
 * for phone testing and, until Enforce HTTPS is on, from GitHub's redirect off
 * the old project-site path. Calling it unguarded throws inside the tap handler
 * and silently loses the entry — the one thing this app must never do.
 *
 * Ids only have to be unique within one device's diary, and import dedupes on
 * them, so a timestamped random suffix is a fine fallback.
 */
export function newEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
