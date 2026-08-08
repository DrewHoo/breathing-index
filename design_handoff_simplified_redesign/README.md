# Handoff: Breathing Index — simplified redesign

## Overview
A simplified, opinionated redesign of the Breathing Index PWA (repo: `DrewHoo/breathing-index`). The app predicts a personal 1–4 breathing level learned from a one-tap symptom diary, shows every exposure variable with its diary-evidence status, and keeps official composite indices out entirely. This redesign reduces the app from 5 screens to 3 tabs + a first-run intro, and establishes a new visual system ("Clear Air" chrome + ink-weight severity).

## About the Design Files
The files in this bundle are **design references created in HTML** — mockups showing intended look, copy, and behavior. They are NOT production code. The task is to **recreate these designs in the existing codebase** (TypeScript + React + Vite + TanStack Router, hand-rolled CSS in `src/styles.css`), reusing the existing engine (`src/engine/`), sources, and storage as-is. The inference/data layer does not change; this is a presentation-layer rebuild.

`Mockups.dc.html` is a design-exploration canvas, newest iteration at top. **The final design is: section 6 (t6: intro, cold start, just-logged, Diary, Settings) plus option 5b (steady-state Today).** Sections t7/t5/t4/t3/t2/t1 are exploration history — reference only. Note: t6/5b phones carry the final voice (sentence-case rule labels, lowercase statuses, 🫁 wordmark) applied after t7; where an older section disagrees, t6/5b win.

## Fidelity
**High-fidelity.** Colors, type, spacing, copy, and component anatomy are final. Recreate pixel-perfectly with the codebase's existing patterns (plain CSS classes are fine — no library needed).

## Information architecture (the consolidation)
- **3 tabs**: Today `/` · Diary `/diary` · Settings `/settings`
- **Intro**: full-screen first-run explainer (also reachable from Settings: "What is this app?")
- **CUT from v1**: `/detail` (per-variable sparkline screen — its job is absorbed by the range bars) and `/scoreboard` (officials vs. you — cut entirely for now; keep capturing `official` on entries for a possible later return)
- The four levels are renamed only at level 1: **Easy** (was "Excellent"), Noticeable, Limiting, Dangerous.

## Design tokens ("Clear Air" chrome)
Colors:
- Paper (app background): `#F3F6F7` · Card: `#FFFFFF`
- Ink (primary text): `#22303A` · Secondary: `#64757F` · Faint: `#93A3AC`
- Hairline: `#DCE4E8` · Hairline-light (row dividers): `#E8EEF1` · Range-bar track: `#E3EAED` · Number-line/tick rule: `#C7D2D8`
- Accent (interactive only — links, active-tab dot, radio/toggle, CTA): `#4A7E96`
- Conflict-card tint: bg `#EAF0F2`, border `#D5DFE4`

Severity (the "ink + one alarm" system — severity is NEVER hue except level 4):
- 1 Easy: outline pill — border 1.5px `#C2CFD6`, text `#7A8B94`, transparent bg
- 2 Noticeable: fill `#E0E7EA`, text `#3B4A54`
- 3 Limiting: fill `#54646E`, text `#F3F6F7`
- 4 Dangerous: fill `#C13A31`, text `#FFF6F4` — the only saturated color in the app
- Numeral/line inks per level: 1 `#A7B6BE`/`#B9C6CC`, 2 `#7A8B94`, 3 `#3B4A54`, 4 `#C13A31`

Typography:
- **Instrument Sans** (Google Fonts, 400–700): all UI text. Wordmark: 600 15px, letter-spacing -0.01em, rendered as "Breathing Index 🫁" (emoji is part of the wordmark).
- **Spline Sans Mono** (400–600): numeric data only — table values, range endpoints, diary exposure lines, hour ticks. Never for labels.
- Section labels: sentence case, 600 12px `#64757F`, followed by a 1px `#DCE4E8` rule filling the row, optional right-aligned annotation (400 10.5–11px). NO all-caps microlabels anywhere.
- Forecast headline: 600 23px/1.15, letter-spacing -0.015em, a sentence: "Noticeable, maybe limiting."
- Evidence statuses: lowercase with glyphs — `● trigger` `◐ suspect` `○ fine before` `◌ no data` `· low`; suspect is 600 ink `#3B4A54`, others 500 secondary/faint.
- Minimum hit target 44px on interactive controls (quick-log buttons are full-width flex cells ≥42px tall in the mock; make them ≥44px in build).

Spacing/radius: cards radius 14–16px, border 1px hairline; pills radius 8px; chips radius 14px, padding 4px 9px; main column padding 0 18px; section gap 10px.

## Screens

### 1. Intro (first run) — mock 6a
Purpose: explain the app in one screen; get location permission.
Layout: single column, padding 0 26px. Wordmark → headline → two paragraphs → four level rows → privacy line → CTA pinned to bottom.
- Headline: 550 24px/1.3 — **"The AQI isn't calibrated for your lungs."**
- Body 1: "It's an average of averages, tuned to an average person — it can't know that smoke gets you and ozone doesn't, or the other way round. Your lungs know; they just don't publish."
- Body 2: "This app takes their side of the story. Rate your breathing when you think of it, 1 to 4, and it learns your triggers from what you tap — then starts telling you what tomorrow will feel like:"
- Level rows: severity pill (82px wide, "1 · Easy" etc.) + meaning text (12px secondary): "The air isn't a factor. Do anything." / "You'll feel it, but carry on as planned." / "Change the plan: shorter, slower, later." / "Outside is unsafe for you. Stay in filtered air."
- Privacy: "Your diary never leaves this phone. No account, no cloud." (12px faint)
- CTA: full-width 50px, radius 14, bg accent, "Use my location"; below it "or pick a place by hand →" (12px faint, centered).

### 2. Today `/` — mocks 5b (steady), 6b (cold start), 6c (just logged)
Vertical order: header · quick-log card · Forecast · Why · In the air · By hour · tab bar.

**Header**: wordmark left; right "Hamden, CT · 3:05 PM" (11px secondary) — detected location + last fetch time.

**Quick-log card** (white card, radius 16):
- Asking state: "How is your breathing?" (600 14px) + right hint "one tap saves this air" (11px faint); row of 4 buttons (flex 1, gap 8, radius 12, hairline border): mono numeral (600 15px, level ink) over sentence-case label (9.5px faint).
- Saved state (6c): level word pill + "Saved, 3:05 PM" (600 13px) + "logged with this air" (11px faint) + "undo" (accent, right); one row of confounder/observation chips — worse outdoors · sick · allergies · indoors all day · + note — ALL visually identical (border `#C2CFD6`, text `#46606E`); full-width "Nothing to add" button (30px, radius 10, bg `#E3EAED`, 600 12px) dismisses the card. Chips are optional post-save annotations; the entry is already saved on tap.
- Cold start (6b): card border darkens to `#C7D2D8`; sub-line "Your first tap starts the learning — good days count double."
- Card shows only while today has no entry in similar air (existing `todaysSimilarEntries` logic — keep).

**Forecast block**:
- Label row "Forecast" (rule style; cold start adds right annotation "unpersonalized").
- Headline sentence: floor=ceiling → single word ("Limiting."); range → "Noticeable, maybe limiting."; cold start → "Up to limiting is possible."
- **Number line** (SVG, full width, ~48px tall): horizontal rule `#C7D2D8` with end ticks; numerals 1–4 beneath at even positions (mono 11px; in-range numerals 600 ink, others faint); filled dots (r5) at each in-range level in that level's ink; a square bracket drawn above spanning the range (1.3px ink stroke: up 7px, across, down 7px) with italic "likely" (10px) centered over it. Cold start: bracket is dashed `#7A8B94` from 1 to ceiling, labeled "at most", ceiling gets a hollow ring (paper fill, `#7A8B94` stroke), no filled dots.
- Meaning line (12.5px secondary): "You will feel it. Keep a plan B for the walk." (per ceiling level).
- Hold-out note, only while the quick-log card shows an answer (11.5px faint italic): "Your tap is not counted here — this is what the rest of your diary expects from air like this."

**Why block**: label rule "Why" + evidence sentence (12.5px/1.5 `#3B4A54`) citing diary evidence, never mechanism: "Smoke is past what you have handled well (22 µg/m³), and ozone is high too. Together this sits just under your Aug 6 day — you rated that one limiting." Optional second line italic faint: "Still untangling whether ozone alone affects you." Cold start: "No diary yet, so this ceiling comes from population breakpoints for sensitive groups. Every entry you log replaces a piece of it with *you*."

**In the air** (label rule "In the air" + right annotation "3 PM · range = past 48 h · ○ handled fine"):
Six two-line rows (dividers `#E8EEF1`, padding 6px 0 7px):
- Line 1: name (600 12.5px) + tiny sublabel (10px faint: PM2.5 / O₃ / PM10 / 3-day) + spacer + value (mono 12.5px) with unit (10px faint) + status (right-aligned, 88px col, lowercase glyph form).
- Line 2 (range bar): 48h-low number (mono 10px faint, 26px right-aligned) · 3px track `#E3EAED` (radius 2) · 48h-high number. Markers on the track: current value = 7px filled dot ink `#22303A`; personal tolerance ("highest handled fine") = 8px ring, 1.5px `#64757F` stroke, paper fill — only where evidence exists.
- Variables: Smoke (PM2.5), Ozone (O₃), Dust (PM10), NO₂, Heat, Humidity (3-day mean drives its status).
- Temperature row behavior: ONE row backed by the two one-sided stress features; the name follows the active side — "Heat" above the comfort band, "Cold, dry" below it (cold-dry gated on dry air); in the comfort band temperature is not a factor. (See t4 option 4e for the two-state demo with shaded stress zones — shading both zones on the track is the intended treatment.)

**By hour** (label rule "By hour" + right "eases after 8 PM", faint italic "unpersonalized ceiling" on cold start):
Step sparkline SVG (~34px tall, preserveAspectRatio="none"): gridlines at levels 1/2/3 (`#E3EAED`); horizontal runs stroked 2.5px in the level's ink (L1 `#B9C6CC`, L2 `#7A8B94`, L3 `#3B4A54`, L4 `#C13A31`); vertical transitions 1.5px `#C7D2D8`. Time ticks below (mono 9.5px faint): 3PM · 8PM · 1AM · 9AM. Cold start: whole SVG at 50% opacity. The plain-language takeaway ("eases after 8 PM") is computed, sits in the label row.

**Tab bar**: hairline top, paper bg, 3 columns (Today/Diary/Settings), active = 600 ink + 4px accent dot beneath; inactive 500 faint.

### 3. Diary `/diary` — mock 6d
- Header: "Diary" (650 20px) + "23 entries" (11.5px faint) + right "+ Log now" pill button (accent text, border `#A9C0CC`).
- **"What your diary shows"** (label rule) — white card, one row per variable with evidence: glyph + name (600 12.5px, 70px col) + plain-language summary (11.5px secondary): "trigger — limiting near 38, fine up to 22" / "suspect — never seen it act alone" / "fine in everything up to 95 °F" / "no evidence yet either way".
- **Conflict card** (tinted `#EAF0F2`): "**Aug 3 does not add up.** You rated it limiting, but everything I track sat at levels you have handled fine. Was something else going on?" + uniform chips: pollen · sick · indoors all day · leave it · + note. Tagging adds a confounder to that entry (existing behavior).
- **Entries**, grouped by day (group labels 600 11px secondary, sentence case: Today / Yesterday / Aug 4…): each row = word pill (78px, severity style) + time (500 12.5px, inline tags like "· worse outdoors" in faint; "· does not add up ↑" in `#B0603C` linking to the conflict card) + exposure line (mono 10.5px faint): "smoke 38 · ozone 165 — "walk cut short at the park"".

### 4. Settings `/settings` — mock 6e
Sections (each label rule + white card of 42–44px rows):
- Location: radio rows — "Follow my location" (+ "Hamden, CT now" hint) / saved places with "remove" / "+ Add a place" (accent).
- Sources: "Open-Meteo model — drives predictions · worldwide, no key" (default) / "AirNow station comparison — US only · disagreement often means local smoke" with toggle (40×24, accent when on).
- Temperature: segmented control (bg `#E3EAED`, active segment white with subtle shadow): Match region (°F) / °F / °C + note "Display only — your diary always stores metric, so switching never rewrites history."
- Your diary: "Export backup — 23 entries · JSON" / "Import — merges by entry, safe to repeat" + note "Everything lives in this browser only. Export a backup now and then."
- Footer row: "What is this app? — the two-minute version ▸" (accent) → opens the Intro screen.

## Interactions & behavior
- Quick-log tap saves the entry immediately (exposure + official captured, existing code path), then swaps the card to the saved state; chips/`+ note` amend the just-saved entry; "Nothing to add" (or navigating away) dismisses; "undo" deletes it.
- Today's similar-air entries are held out of the forecast model (existing behavior — keep), with the hold-out note shown.
- Range bars: min/max over the trailing-48h hourly series per variable; tolerance tick = max exposure across entries rated < 2 (i.e. "handled fine"), hidden when none.
- Conflict "does not add up ↑" scrolls/links to the conflict card.
- Transitions: keep minimal — no animation requirements beyond default; the saved-state card swap can be a simple crossfade (~150ms ease-out).
- Desktop/PWA: single column max-width ~560px centered is acceptable; a two-pane desktop layout was explored (t1 option 1d) but is NOT part of this handoff's scope.

## State management
No new state beyond existing app state: diary entries (localStorage), settings, exposure series fetch. New derived values: 48h min/max per variable, tolerance-tick values, forecast bracket (floor/ceiling from existing `predict()`), by-hour level series (existing), active temp-stress side.

## Assets
- Google Fonts: Instrument Sans (400–700 + italic 400), Spline Sans Mono (400–600). Load via fonts.googleapis.com.
- No images or icon fonts. Glyphs ● ◐ ○ ◌ · ▸ ‹ are text characters. The lungs emoji 🫁 is part of the wordmark.
- Sparklines/number line are inline SVG (geometry described above; reference the mock source for exact paths).

## Files
- `Mockups.dc.html` — the design canvas. **Final = section t6 (6a–6e) + option 5b.** Open in a browser; earlier sections are exploration history. Copy strings verbatim from the final screens; all styles are inline on the elements.
- `ios-frame.jsx`, `browser-window.jsx` — device-frame scaffolding used by the canvas for presentation only; not part of the design.
