# Breathing Index — replacement copy

All lengths verified by character count. Constraint noted per surface.

---

## A. Headline surfaces

### 1. HTML `<title>` (≤60 chars)

1. `Breathing Index — a 1–4 air scale learned from your lungs` (57)
2. `Breathing Index — air on a scale of 1 to Indoors` (48)
3. `Breathing Index — air, rated by what it makes you do` (52)

**Pick: option 2.** "A scale of 1 to Indoors" carries the whole thesis — personal, behavioral, top level named after what you do about it — and the mismatch of a number scale ending in a word is the joke, unsignaled.

### 2. Tagline / OG-image subtitle (two lines, each ≤55 chars)

Option 1:
```
The official AQI called a smoke day 'Moderate.'      (47)
This app takes your lungs' word for it instead.      (47)
```

Option 2:
```
A four-level air scale that ends at Indoors,         (44)
calibrated to the only lungs you've got.             (40)
```

Option 3:
```
Air, rated by what it makes you do:                  (35)
anything, feel it, change the plan, stay in.         (44)
```

**Pick: option 1.** The origin story is the strongest thing the product owns, "Moderate" does the deflating on its own, and line two states the entire product in plain words with no jargon.

### 3. Meta description (≤160 chars)

1. `Every pollutant shown separately, marked by what your own symptom diary proves about it, and your day predicted on a scale of 1 (Clear) to 4 (Indoors).` (151)
2. `The composite AQI is a max() over pollutants — it hides which one gets you. This shows them all, learns yours from your diary, and predicts your 1–4 day.` (153)
3. `A personal air index for lungs the official labels weren't graded on. Learns your triggers from your symptom diary and predicts your day ahead of time.` (151)

**Pick: option 2.** It names the actual defect in one clause — an engineer skimming search results gets it instantly — and the fix in the next two, with no adjectives doing the selling.

---

## B. Single-best surfaces

### 4. OG/Twitter description (~200 chars max)

> The US AQI read 70, 'Moderate,' on a day I could barely breathe. This app tracks each pollutant separately, learns from your symptom diary which ones are yours, and predicts your 1–4 day in advance. (198)

### 5. PWA manifest description (one sentence)

> A personal air index that learns your triggers from your own symptom diary and predicts your day on a four-level scale, from 1 (Clear) to 4 (Indoors).

### 6. og:image:alt (one sentence)

> Share card for Breathing Index: the app name in large type beside the digits 1 through 4 colored green, yellow, orange, and red, above the tagline and a small bar chart of hourly air readings.

### 7. Project-card blurb for drewhoover.com (≤280 chars)

> A personal air index, born the week the official AQI called a smoke day 'Moderate.' Shows every pollutant separately, learns which ones are yours from your symptom diary, and predicts your day on a scale of 1 (do anything) to 4 (stay inside). (242)

### 8. Project-card body (2 short paragraphs, markdown)

In Amsterdam, the Dutch air index read 7–8 — "insufficient" — and my asthmatic lungs worked harder than usual but worked. Back home in Hamden, Connecticut, the US AQI read 70 out of 500, "Moderate," and I couldn't finish a lap of the block. The composite AQI is a `max()` over pollutant sub-indices: it hides what's in the air, and its labels are calibrated to the average lung, which nobody has.

Breathing Index goes the other way. Every exposure variable on one screen — pollutants, heat, humidity — each marked by what your own symptom diary has proven about it, and your day predicted on a four-level scale defined by behavior, from 1 (do anything) to 4 (stay inside). On a day when smoke and ozone spike together, it admits it doesn't know which one got you and waits for the diary to settle it. There's also a scoreboard comparing what officials said to what your lungs said. The officials are not doing great.

---

## C. In-app copy

### 9. Diary empty state

> No entries yet. Good days are the best data — a 1 proves you tolerated everything in today's air.

### 10. Diary section heading

> How's breathing right now?

Kept as-is: "right now" is load-bearing (the exposure vector is captured at log time), and the question is already in the house voice.

### 11. Home CTA button

> How's breathing? →

The question is the CTA — tapping it is answering — and it pairs with the diary heading it lands on. "Log it" was the button explaining itself.

### 12. Scoreboard heading + intro

Heading:
> Officials vs. your lungs

Intro:
> Every day you logged, beside what the official composite indices called it. They appear on this page and nowhere else in the app, where we can keep an eye on them.

### 13. AirNow measured-strip caption

> Station measurements from AirNow, one US AQI number per pollutant. When these disagree with the model above, something hyper-local is going on — usually smoke. Your nose knew first.

### 14. Settings diary-data note

> Your diary lives only in this browser. Export a copy now and then — browsers forget things. Import merges by entry id, so re-importing is safe.

### 15. Offline banner prefix

> Offline — this air is from {time}.

### 16. The four level meanings

Keep all four as written:

- 1 Clear — "The air isn't a factor. Do anything."
- 2 Noticeable — "You'll feel it, but you can carry on as planned."
- 3 Limiting — "Change the plan: shorter, slower, later, or elsewhere."
- 4 Indoors — "Outside is unsafe for you. Stay in filtered air."

These are behavioral definitions doing exact work — each one is an instruction, not a description — and every rewrite I tried traded precision for polish. They stand.

---

## Tells I caught and removed from my own drafts

1. First tagline instinct was "Air quality that knows you" — dead statistical center; the pick keeps the emotional vector (betrayal by an official number) and moves to the specific incident instead.
2. The "Moderate" joke initially appeared on five surfaces; a joke repeated is a slogan. It survives on two (tagline, blurb), and the scoreboard gets a different one.
3. Early drafts averaged an em dash per sentence and three "actually"s; kept the dashes that carry a turn, cut the ones that were just breathing, kept one "actually" doing real work — then cut it too.
