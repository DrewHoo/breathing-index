# Glossary — what each thing in the air is, and a ? on every row

**Status:** built 2026-09-14 (branch `claude/spec-30-glossary`) · **Effort:** M · **Deps:** [19-pollen-content-pages.md](19-pollen-content-pages.md) (the generator pattern), [11-ui-polish.md](11-ui-polish.md) (44 px targets) · **Priority:** high. The rows now name eleven things and the app explains none of them.

## Problem

After specs 21–28 the air table can show fine particles, ozone, coarse particles, smoke, mold, dry-spore conditions, three pollen rows, a dew-point row and SO₂, each with a window and a source in its sub-label. The app says what the numbers are and never what they do. A reader who wants to know why "dry air" is a row, or what "8-h" means, or why mold is an estimate, has nowhere to go but the repo.

Two surfaces, one source of text: a glossary page anyone can link to, and a `?` on each row that opens the same entry in place.

## Design

1. **One content module.** `src/content/glossary.ts`: an entry per live variable, keyed by the exposure variable name, with these fields: `name`, `what` (what the number measures, one or two sentences), `breathing` (how it affects breathing in people with asthma, with the evidence tier and the one number worth knowing), `window` (the span the row's number covers and why), `source` (where the number comes from and what "monitor" / "model" / "estimate" mean on that row), `verdicts` (what the row's right-hand words mean here, e.g. "not graded" on PM10, "comfortable" on the dew point). Plain prose, no markdown. Retired variables get no entry; the diary renders them by label alone.

2. **The page.** `/glossary`, prerendered as static HTML under `public/glossary/index.html` by `scripts/generate-glossary.mjs`, exactly the way `generate-pollen-tables.mjs` renders the calendar between `begin generated` / `end generated` markers, with `--check` wired into `npm test` so the page and the module cannot drift. One section per entry in air-table order, a short intro line, the disclaimer, and a link back to the app. Prerendered because the point is that a search for "PM2.5 24-hour mean asthma" or "what is dew point asthma" can land here.

3. **The `?` on the row.** Each `AirRow` gets a `help` key (the variable name; the dew-point row uses `dewpoint`, PM10 uses `pm10`). The row's name renders with a small `?` button after it: 44 px target, `aria-label="About {name}"`, visually a faint circled question mark in the sub-label register so it does not compete with the number. Tapping opens a **bottom sheet** (a native `<dialog>`, no dependency) showing that entry's `what`, `breathing`, `window`, `source`, `verdicts` under small labels, with a close control and a "Full glossary →" link to `/glossary#{key}`. Escape and backdrop close it. On desktop the same dialog is fine; a popover anchored to the `?` is not worth a second layout.

4. **Same content, same words.** The sheet renders from `glossary.ts` directly; the page is generated from it. Neither may carry text the other lacks.

5. **What the text may and may not say.** The glossary explains mechanisms at the population level ("in controlled exposure, ozone at…") and never speaks about the user's day; the home screen's rule against naming a cause stands. Every `breathing` paragraph names its evidence tier in plain words ("shown in controlled exposure", "seen in emergency-visit studies", "a mechanism, thin data"). The disclaimer sentence from `labels.ts` appears once on the page and once at the foot of the sheet.

6. **Diary evidence rows** get the same `?`, since they name the same variables.

7. **Draft copy.** The table below is a starting draft, written by the agent from `research/asthma-triggers-evidence.md`, for Drew to edit before it ships. It is deliberately short: three to five sentences per entry, one number each.

| Key | What | Breathing | Window / source | Verdict words |
|---|---|---|---|---|
| `pm25` | Particles under 2.5 µm: smoke, exhaust, secondary aerosol. Small enough to reach the deep lung. | Seen in emergency-visit studies: asthma visits rise about 4 % per 10 µg/m³, and wildfire smoke hits harder per microgram than city particulate. | 24-hour mean, because the health studies and the official breakpoints are daily. Monitor when one is near; the model otherwise. | The usual verdicts. |
| `o3` | Ozone at ground level, made from traffic and heat in sunlight. Peaks mid-afternoon. | Shown in controlled exposure: lung function drops and airways inflame at 0.06 ppm over hours, below the US standard, and exertion multiplies the dose. The effect lags by hours. | 8-hour mean, the standard's own form. Monitor or model; the model runs high in the eastern US in summer. | The usual verdicts. |
| `pm10` | Particles under 10 µm, which includes PM2.5 plus dust and road grit. | Weak on its own for acute asthma; it moves with PM2.5. Shown so you can see coarse particulate; the diary does not grade it. | 24-hour mean. | "not graded": shown, never a suspect. |
| `so2` | Sulfur dioxide, from coal, refineries, ships and volcanoes. Usually near zero in Connecticut. | Shown in controlled exposure: exercising asthmatics tighten within minutes at levels healthy lungs ignore. The best-proven acute trigger there is, and the rarest here. | The hour itself. The row appears only when it is present. | The usual verdicts. |
| `smoke` | NOAA's satellite smoke analysis, light to heavy, counted only when the particulate under it is fine-mode. | Seen in emergency-visit studies: asthma visits rose 82 % in New York in a day of June 2023 smoke; per microgram, smoke is two to three times ordinary PM2.5. | The current hour; satellites need daylight, so at night the plume is the afternoon's. | The usual verdicts. |
| `mold` | Outdoor fungal spores per cubic metre, counted on a slide by the station you chose. Alternaria and Cladosporium are the two that matter. | Seen in emergency-visit studies: every fungal group larger than any pollen group; Alternaria is linked to near-fatal asthma. Spores are small enough to reach the lower airway. | Highest of the station's last three counts. Stations count on weekday mornings; a count older than three days is an estimate. | "estimate" when the count is old. |
| `dry_spore_index` | A weather guess at dry-air spores: warm, dry, windy, no rain in two days, after a wet spell. | The same spores as mold, by proxy. It can suspect and never confirm. | Daily, in season, always an estimate. | "estimate from weather". |
| `pollen_graminales` | Grass pollen on a 0–5 index, by plant. | Seen in emergency-visit studies: the only pollen with a firm asthma signal, and it builds over three days. | Highest of the last three days. Modelled, not counted; a calendar estimate where the model is silent. | "calendar estimate". |
| tree / weed pollen | Tree and weed pollen on a 0–5 index, by plant. | Mostly a hay-fever story; the asthma evidence is thin, so these warn later than grass. | The day's index. | "calendar estimate". |
| `dry_air` | Dew point below 11 °C / 52 °F: air dry enough to dry the airway lining. | Shown in controlled exposure: what people call cold-air asthma is drying, not cold, and it needs hard breathing to start. Nose-breathing nearly cancels it. | The hour itself. | "comfortable" between 11 and 18 °C. |
| `humid_heat` | Dew point above 18 °C / 64 °F: hot, wet air. | Shown in controlled exposure: a separate reflex from dry air, blocked by an inhaler drug in the lab. | The hour itself. | "comfortable" between 11 and 18 °C. |
| `viral` | You said you were sick. | A cold alone does little; a cold plus the pollen you react to does a lot. Logging it is what lets the diary see that. | The day you tapped it. | — |

## Copy rules from Drew (2026-09-14), applied

- A symbol gets its English name in parentheses the first time it appears in an entry: "2.5 µm (micrometers)", "10 µg/m³ (micrograms per cubic meter of air)", "0.06 ppm (parts per million)".
- "Average", never "mean".
- "Monitor" and "model" are named and told apart in every entry that uses them: a monitor is an instrument run by the state environmental agency, published through the EPA's AirNow; a model is a computer estimate on a 45-kilometer grid, a prediction and not a measurement.
- The "What the words on the row mean" part is gone from the module, the sheet and the page.
- A part that would only state the obvious is left out; Sick keeps one sentence.
- Dew point, what it is: the temperature at which the water vapor in the air would condense into a dew drop; too high and the air is muggy and sets off the humid-heat reflex; too low and it dries the airway lining, which is what people call cold-air asthma.

A test guards the first two rules for the symbols the copy uses.

## Acceptance

- `/glossary` renders one section per live variable from `glossary.ts`; `npm test` fails if the page drifts.
- Every air-table row and diary evidence row has a `?` with a 44 px target and an accessible name; tapping opens a sheet with that entry; Escape and backdrop close it; the sheet links to the page anchor.
- The text in the sheet and on the page is byte-identical per entry.
- No entry speaks about the user's own day.

## Non-goals

Per-verdict explanations beyond the words listed. Translation. A glossary for retired variables.

## As built

- **One dew-point entry, not two.** `dry_air` and `humid_heat` are one row on the screen, so
  they are one entry keyed `dewpoint`, and `glossaryKeyFor` sends both variables to it. The two
  drafts above are merged with a joining sentence on each side ("One measurement with two
  edges", "Two mechanisms, one row"); every other clause is the draft's.
- **Tree and weed split.** The draft's one "tree / weed pollen" row became `pollen_tree` and
  `pollen_weed`, since the app draws two rows. The shared sentences are shared verbatim; only
  the first noun differs.
- **Five fields, and the draft table had four.** The table's "Window / source" column is one
  cell, so `window` and `source` are split out of it where it holds two sentences. Where it
  holds none for `source` — PM10, SO₂, smoke, dry-spore, tree/weed pollen, dew point, sick —
  one short sentence was written to fill it, each saying only what the code already does.
  `viral.verdicts` was "—" in the draft and needed words for the same reason.
- **The part labels are content too.** `GLOSSARY_PARTS` in the module holds the five labels, so
  the page and the sheet cannot label the same paragraph differently — §4's rule applied to the
  chrome as well as the prose.
- **The `?` announces the row's name, not the entry's.** "Dry air" and "Humid heat" are two
  rows and one entry, and two buttons in one panel both reading "About Dew point" is a screen
  reader saying the same thing twice. The entry's name is the fallback.
- **`/glossary` has no dark mode**, because `legal.css` has none — it is the same light
  document /privacy, /terms and /pollen are. The sheet inside the app is on the app's tokens
  and follows the system.
- **No component tests.** `HelpButton` and `HelpSheet` have no harness in this repo (there is
  no DOM test setup); `src/content/glossary.test.ts` covers the content and the key mapping,
  and the generator's `--check` covers the page. The sheet was verified by hand: open from an
  air row, a diary row and an absent-line name; close by button and by backdrop; the anchor
  link lands on the right section.
