# Honest analytics — make the privacy promise true

**Status:** proposed · **Effort:** S · **Deps:** none · **Priority:** highest — trust, cheap to fix

## Problem

The intro promises "Your diary never leaves this phone. No account, no cloud."
(`src/routes/intro.tsx`). But every log fires `track('Diary entry saved', { rating, ... })`
(`src/routes/index.tsx`), and conflict resolution sends confounder tag names
(`src/routes/diary.tsx`) — the rating time series *is* the diary's health signal — keyed to a
persistent Mixpanel `distinct_id`, with Mixpanel's default IP-based city geolocation (no
`ip: false` in `src/ui/analytics.ts`). README's "anonymous" is also wrong (pseudonymous device
ID). For a health app whose brand is built on this exact promise, the gap is the kind of thing
that ends up as a screenshot on social media.

## Design

Keep the promise; shrink the telemetry. The product question analytics must answer is "do
people log, and does anything break" — not "what did they log."

1. **Strip health payloads from events.** `Diary entry saved` keeps occurrence, cold-start flag,
   and tap-to-save latency; drops `rating` and any exposure summary. `Conflict tagged` keeps
   occurrence and card kind; drops the tag value. Grep the codebase for every `track(` call and
   audit each property against the rule: *nothing that describes the user's body or air.*
2. **Turn off IP geolocation.** `ip: false` in the Mixpanel init, and set
   `property_blacklist` for `$city`/`$region`/`mp_country_code`.
3. **Say what is actually collected.** One sentence in Settings under the diary section:
   "Anonymous usage pings (screen views, taps — never ratings, notes, or location) help me see
   what's broken. Turn off." — with a working toggle persisted next to the other settings.
4. **Correct the claims.** README "anonymous" → "pseudonymous, content-free"; intro line can
   stay once 1–3 are true, because it will be true of the *diary*. Third-party subresources
   count too: self-host the Google Fonts files (also fixes offline typography and one more
   third-party IP disclosure).

## Acceptance

- Network tab during a full log-amend-undo session shows no Mixpanel property containing a
  rating, tag value, note text, coordinate, or pollutant value.
- Mixpanel events arrive without city/region geo.
- Opt-out toggle in Settings stops all tracking calls (verified in network tab) and persists.
- No request to fonts.googleapis.com / gstatic.com; fonts load offline in the installed PWA.

## Non-goals

Dropping analytics entirely; cookie banners (nothing here needs consent UI once payloads are
content-free — revisit if that judgment changes).
