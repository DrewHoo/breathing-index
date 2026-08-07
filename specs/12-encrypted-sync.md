# Encrypted backup & sync — the first paid feature

**Status:** proposed · **Effort:** L · **Deps:** [01-data-durability.md](01-data-durability.md) (nudges/UI), [02-honest-analytics.md](02-honest-analytics.md) (trust story must be clean first) · **Priority:** first monetization

## Why this one first

The #1 product gap (diary fragility) and the most natural revenue stream are the same feature.
End-to-end encryption makes the privacy story *stronger* than today's local-only claim — "I
can't read your diary" beats "no cloud" — and it's the standard indie-PWA model people pay
for happily. Free tier stays local-only + manual export, fully functional.

## Product shape

- **Free:** everything today, plus spec-01 durability.
- **Breathing Index Plus — $15/yr or $2/mo:** encrypted sync across devices, automatic
  continuous backup, restore-on-new-phone. (Alert features from
  [13-forecast-alerts.md](13-forecast-alerts.md) join this same tier later — one tier, ever.)

## Design

1. **Crypto client-side, keys never leave.** On enable, generate a random 256-bit data key;
   wrap it with a key derived (Argon2id / PBKDF2-600k) from a 6-word recovery phrase shown
   once. Diary blob encrypted AES-GCM client-side; server stores ciphertext + wrapped key.
   Losing the phrase loses the backup — say so plainly (and the local copy still exists;
   re-enroll re-encrypts).
2. **Backend: one Cloudflare Worker + KV/D1 + Stripe.** Endpoints: `PUT /blob` (ciphertext,
   monotonic version, If-Match), `GET /blob`, `POST /checkout` (Stripe Checkout session),
   Stripe webhook → entitlement row keyed by an opaque account id. Account identity is an
   emailed magic link (email needed for Stripe receipts anyway) — email is stored server-side;
   diary content never is, in any readable form. Total surface small enough to audit in one
   sitting; publish the Worker source in the repo — auditability is part of the pitch.
3. **Sync semantics: last-writer-wins per entry, merge by id** — identical to the existing
   import merge (`merges by entry, safe to repeat`), so sync and manual import share one code
   path. Push on diary write (debounced), pull on app open. Conflicts are near-impossible by
   construction (entries are append-mostly, keyed by id); settings sync excluded in v1.
4. **UI:** Settings gains a "Backup & sync" section: enabled state shows last-sync time and
   device count; the spec-01 backup chip upsells here ("or turn on automatic backup").
5. **Payments:** Stripe Checkout + customer portal, no in-app price logic beyond a link.
   PWA = no app-store cut or IAP rules.

## Acceptance

- Enroll on device A, log entries, restore on device B with the phrase: diaries identical;
  server-side inspection shows ciphertext only.
- Cancelled subscription: sync stops, local data untouched, export still free — leaving is
  always safe, and the settings copy says so.
- Wrong phrase: clear failure, no partial state.
- The Worker repo passes a "what can the operator read?" review: email + timestamps +
  blob sizes, nothing else.

## Open questions

- Anthropic-of-one problem: this adds the project's first operational liability (uptime,
  support email, Stripe tax handling — Stripe Tax probably mandatory from day one).
  Price accordingly; $15/yr at even 100 subscribers is coffee money, so the real v1 goal is
  proving people pay at all before building more paid surface.
