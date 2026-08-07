# UI polish batch — sidewalk legibility, honest labels, dark mode

**Status:** proposed · **Effort:** M (batch of smalls) · **Deps:** none · **Priority:** medium

A single cleanup pass; each item is small enough that separate specs would be ceremony.

## 1. Stop inventing causes in variable names

"Smoke" (PM2.5) and "Dust" (PM10) assert sources the data doesn't support — most US metro
PM2.5 is traffic/industrial — and the spec's first goal is "without inventing a cause."
Rename rows to "Fine particles · PM2.5" / "Coarse particles · PM10". Exception: when the
smoke fingerprint fires (PM2.5 elevated *and* PM2.5/PM10 ratio ≥ ~0.85 — the M1 finding),
the row may earn a "likely smoke" sub-label. Evidence lines inherit the same names
(`src/ui/labels.ts`, `src/ui/evidence.ts`).

## 2. Bridge the units in the AirNow strip

"Ozone 180 µg/m³" (model row) sits above "OZONE 58 Moderate" (station AQI points) with no
hint the scales differ. Convert station AQI per-pollutant back to concentration for a
same-unit comparison ("station ≈ 120 µg/m³ vs model 180"), or at minimum caption the strip:
"station numbers are AQI points, not µg/m³."

The disagreement caption also points the wrong way for ozone. "Disagreement usually means a
local source, such as smoke, that the model missed" is right for PM (station reads high ⇒
hyperlocal source). Ozone has no hyperlocal sources: when the *model* reads high against a
monitor — the observed Hamden case, CAMS 166 vs station ~82 µg/m³-equivalent — the model is
biased and the station wins. Make the caption per-pollutant: PM keeps the local-source line;
ozone gets "when these disagree, trust the station."

## 3. Dark mode

A 4 AM breathing check is currently a flashlight to the face. The palette is already
variable-based (`src/styles.css` custom properties): add a `prefers-color-scheme: dark` block
remapping the neutrals + a dark `theme-color` meta, and verify the four level colors keep
their meaning and contrast on dark ground. Manual toggle can wait; the media query can't.

## 4. Touch targets & sidewalk type

Raise interactive targets to ≥44 px: chips, "undo", "remove", "Nothing to add", tab links
(pad the hit area, not necessarily the visual). Raise load-bearing microcopy: quick-log
button words (9.5 px) and status chips (10 px) to ≥12 px; hour-axis ticks can stay small.
Set `.note-input` to 16 px to kill the iOS focus-zoom jump.

## 5. Screen-reader state

The Settings location "radios" are buttons with decorative spans — add `role="radio"` +
`aria-checked` (or use real inputs); unit segments get `aria-pressed`; the rating buttons'
accessible names should include the number ("1 — Easy"); the by-hour SVG gets a text
alternative summarizing the curve ("ceiling 3 until 10 PM, then 2").

## 6. Persist small UI state

The Diary conflict-card "leave it" choice is component state and resurrects every visit —
persist dismissals (entry id + card kind) alongside settings. Same store can carry the
install-nudge and backup-chip dismissals from [01](01-data-durability.md).

## Acceptance

- Axe/Lighthouse a11y pass ≥ 95 on Today, Diary, Settings; no target < 44 px in the tap audit.
- Dark mode screenshot set (Today/Diary/Settings, mobile) added to the repo docs.
- "Smoke" appears only when the fine-fraction rule fires.
- Dismissed conflict cards stay dismissed across reloads.
