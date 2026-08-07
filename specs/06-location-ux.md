# Location UX — never fake a fix, and let humans pick places

**Status:** proposed · **Effort:** S–M · **Deps:** none · **Priority:** high — silently wrong data poisons the model

## Problem

Both geolocation error callbacks are `() => undefined` (`src/ui/useExposureSeries.ts`,
`src/routes/intro.tsx`). A Denver user who denies the prompt gets `DEFAULT_LOCATION` (Hamden,
CT), and the header *strips the honesty marker* — `label.replace(' (default)', '')` — so a
faked fix is indistinguishable from a real one. They can then log diary entries against air
they never breathed: the app's founding complaint (being gaslit by a number that doesn't match
your lungs), self-inflicted. The escape hatch is worse: the intro's "pick a place by hand"
lands on the full Settings page, where "Add a place" means typing raw latitude/longitude into
three unvalidated fields. The intro's geolocation warm-up also uses `timeout: 5000`, which can
expire while the iOS permission dialog is still on screen.

## Design

1. **Denial is a state, not a shrug.** On `PermissionDeniedError` (or timeout with no saved
   place), the home screen shows a location-needed card — "I can't see your air without a
   place. Use my location · Search for a place" — instead of silently loading Hamden. The
   default location is for the intro's *preview* only, always labeled.
2. **Place search, not coordinates.** Replace the lat/lon inputs with a name search against
   Open-Meteo's free geocoding API (`geocoding-api.open-meteo.com/v1/search`, no key, CORS
   friendly): type "Denver", pick from results (name, admin1, country), store
   {label, lat, lon}. Keep a tiny "enter coordinates" disclosure for the hikers.
3. **Never strip "(default)".** Delete both `.replace(' (default)', '')` call sites; if a
   label is provisional, the header says so.
4. **Fix the intro timeout:** raise to 30 s (the permission dialog is user-paced) and treat
   timeout as "no answer yet", not denial.
5. **Quick-log guard:** if the current exposure series came from the default/fallback location,
   the quick-log card is replaced by the location-needed card — a diary entry must never bind
   to air from a place the user didn't choose.

## Acceptance

- Deny geolocation on a fresh profile → location-needed card, no Hamden data, no way to log.
- Search "Denver" → one tap adds and selects it; air loads; logging works.
- No code path renders a default location without saying so.
- Simulated slow permission dialog (>5 s) no longer falls through to the default.
