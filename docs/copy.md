# Breathing Index — replacement copy (revised: plain and direct)

Single version per surface. All lengths verified by character count.

---

## A. Headline surfaces

### 1. HTML `<title>` (≤60 chars)

> Breathing Index — a personal 1–4 air scale

(42)

### 2. Tagline / OG-image subtitle (two lines, each ≤55 chars)

```
Per-pollutant air data and a personal 1–4 index,     (48)
learned from your own symptom diary.                 (36)
```

### 3. Meta description (≤160 chars)

> Shows each pollutant, heat, and humidity separately, marks each by your symptom diary evidence, and predicts your day on a personal four-level scale.

(149)

---

## B. Single-best surfaces

### 4. OG/Twitter description (~200 chars max)

> The composite AQI reduces all pollutants to one number. Breathing Index shows each exposure variable separately, learns your triggers from your symptom diary, and predicts your day on a 1–4 scale.

(196)

### 5. PWA manifest description (one sentence)

> A personal air index that learns your triggers from your own symptom diary and predicts your day on a four-level scale, from 1 (Easy) to 4 (Dangerous).

### 6. og:image:alt (one sentence)

> Share card for Breathing Index: the app name and tagline on a white card, a bar chart of one day's hourly air readings rising to a single red peak, and the scale from 1 Easy through 2 Noticeable and 3 Limiting to 4 Dangerous.

### 7. Project-card blurb for drewhoover.com (≤280 chars)

> A personal air quality index. Shows each pollutant separately, learns which ones affect you from your symptom diary, and predicts your day on a four-level scale, from 1 (easy) to 4 (dangerous).

(192)

### 8. Project-card body (2 short paragraphs, markdown)

The composite AQI collapses every pollutant into one number with population-calibrated labels. The project started with a concrete failure of that design: air labeled "insufficient" in Amsterdam (Dutch LKI 7–8) was manageable for the same asthmatic lungs that struggled in Hamden, CT under a US AQI of 70, labeled "Moderate."

Breathing Index shows every exposure variable (pollutants, heat, humidity) and marks each by what the user's symptom diary establishes about it: confirmed trigger, suspected, or tolerated. It predicts the day on a four-level behavioral scale, 1 (Easy) to 4 (Dangerous). When several candidates are elevated at once, it reports the ambiguity instead of attributing the day to one of them; later diary entries resolve it. A scoreboard view compares the official composite indices against the logged ratings.

---

## C. In-app copy

### 9. Diary empty state

> No entries yet. Log good days too: a rating of 1 records that you tolerated everything in today's air.

### 10. Diary section heading

> How's breathing right now?

(Kept: "right now" matches the exposure capture at log time.)

### 11. Home CTA button

> Open your diary →

(The home screen now asks "How's breathing right now?" itself, at the top, so the bottom link
names its destination instead of repeating the question.)

### 11a. Home quick-log card

Asking state — same heading as the diary, since it's the same question:
> How's breathing right now?

Sub-line:
> One tap logs it against the air right now. Add a note, tags, or a correction in your diary.

Answered state, when today already has an entry in air like this:
> **You rated it noticeable**
> logged 9:05 AM, with this air

(The line says *this air*, not *today*: the card comes back when the air moves, and the wording
has to survive both. The state is read from the diary, not from the session, so a 4 logged at
breakfast is still on the screen after a reload. The reopen button is "Log again", the diary's
"+ Log now" from the other side — it never hides the ask, it just stops leading with it. "undo" only appears for a tap made in this session; taking
back this morning's entry is the diary's job.)

### 11b. Forecast hold-out note

Under the evidence line, only while the quick-log card is showing an answer:
> Your rating above isn't counted here — this is what your other days expect from air like this.

(The headline below an answered card would otherwise be the user's own tap played back as a
prediction. The note says the hold-out out loud rather than letting the two numbers look like
they disagree by accident.)

### 11c. The first day, and the day after

Quick-log sub-line before there is anything to learn from:
> Easy days teach the most — they prove today's whole mix is fine for you.

Under the forecast, while today's entries are logged but held out:
> 1 entry banked · starts counting tomorrow

Why block, when every entry in the diary is one of today's:
> Your first entries are from today, so they're held aside — today's rating can't grade itself.
> Tomorrow they start driving this forecast.

Why block, once on the next local day, when they do:
> Now drawing on your 3 entries.

(Nothing here promises a mechanism the engine doesn't have. A 1 is worth exactly one entry; what
makes it valuable is that it clears every variable in that entry's air at once. The forecast is
still "unpersonalized" on day one, and the copy says when that ends instead of implying it
already has.)

### 12. Scoreboard heading + intro

Heading:
> Official indices vs. your ratings

Intro:
> Each logged day beside what the official composite indices (US AQI, EU EAQI, NL LKI) reported for it. This is the only screen in the app where those indices appear.

### 13. AirNow measured-strip caption

Three lines, because one caption was doing two jobs badly. The first says what the numbers on
the chips are; each chip also carries its AQI value read back through the EPA table
("station ≈ 112 µg/m³"), so the strip and the model rows above it are in the same unit:

> Station readings from AirNow, reported as AQI points; the µg/m³ beside each is that value read back through the EPA table, for comparison with the rows above.

Then the disagreement line, which is *per pollutant*, because the two disagreements do not mean
the same thing. Particles: the station reads a hyperlocal source the model could not see.

> Particles: disagreement usually means a local source, such as smoke, that the model missed.

Ozone has no hyperlocal source, so a model running high against a monitor — the observed Hamden
case, CAMS 166 against a station near 82 µg/m³-equivalent — is the model being wrong:

> Ozone: when these disagree, trust the station.

### 13a. The particulate row names

> Fine particles · PM2.5
> Coarse particles · PM10

"Smoke" and "Dust" asserted causes the data cannot support — most metro PM2.5 is traffic and
industry, and the app's first rule is to describe the air without inventing a reason for it. The
one exception is earned: when PM2.5 is past the level-2 breakpoint *and* PM2.5/PM10 ≥ 0.85, the
particulate is fine-mode dominated (docs/m1-findings.md), and the row carries a sub-label:

> likely smoke

### 14. Settings diary-data note

> Your diary is stored only in this browser. Export a backup periodically. Import merges by entry id, so re-importing the same file is safe.

### 15. Staleness banner

> The newest air I have is from {hour}.

Offline, with a cached reading behind it:

> Offline — the newest air I have is from {hour}.

({hour} is the payload's own newest hour, not the time of the fetch. A service-worker cache hit
arrives looking live, so arrival time can't be trusted to answer "is this now?". The banner appears
whenever that hour is more than 90 minutes behind the clock, however the bytes got here.)

### 15a. No air at all, and the log that still has to work

> I can't reach the air readings from here — no forecast until I can.

with a **Retry** button, above it the quick-log card, and on its answer:

> Saved — I'll attach the air readings when I'm back online.

In the diary, until the readings arrive:

> air readings still to come

### 16. The four level meanings

Kept as approved — these are the *rating* anchors, shown where the user learns the scale and
logs a day they have already lived:

- 1 Easy — "The air isn't a factor. Do anything."
- 2 Noticeable — "You'll feel it, but you can carry on as planned."
- 3 Limiting — "Change the plan: shorter, slower, later, or elsewhere."
- 4 Dangerous — "Outside is unsafe for you. Stay in filtered air."

### 16a. The four forecast meanings

Separate strings (`FORECAST_MEANING` in `src/ui/labels.ts`), because a *prediction* wearing the
rating anchors reads as an instruction the app has not earned. Same information, reported rather
than ordered; only the top of the scale, where being wrong is expensive, still advises:

- 1 — "The air isn't expected to be a factor."
- 2 — "You'll feel it, but you can carry on as planned."
- 3 — "Enough to change the plan: shorter, slower, later."
- 4 — "Outside could be unsafe for you. Plan around filtered air."

(Cold start replaces all four with the existing "Averages for sensitive lungs — not you, yet.")

### 17. The disclaimer

One sentence, `DISCLAIMER` in `src/ui/labels.ts`, reused verbatim by the intro small-print, the
Settings footer, `index.html` (`<meta name="disclaimer">` and the noscript block) and both legal
pages. The last three are literal copies — they ship without the bundle and cannot import it.

> Breathing Index is a diary lens on public air data — not medical advice. Trust your symptoms and your asthma action plan over anything on this screen.

Deliberately not on Today. The home screen is where someone checks the air in ten seconds; the
intro and Settings are where trust is negotiated.

### 18. The rescue clause

`RESCUE_CLAUSE` in `src/ui/labels.ts`. Rendered once, small, in the alarm colour, under the
forecast and only when the *predicted* ceiling is 4 — cold start included, since that is the
case where the app is guessing hardest:

> — if breathing feels dangerous, use your rescue plan and get help, whatever this app says.

A logged 4 gets nothing extra: that is the user reporting their own day back to themselves.

### 19. Legal-page links

Intro small-print and Settings footer, plain anchors (`/privacy`, `/terms` are prerendered
documents, not routes):

> Privacy · Terms
