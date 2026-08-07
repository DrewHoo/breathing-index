# Data durability — the diary must survive the platform

**Status:** proposed · **Effort:** S · **Deps:** none · **Priority:** highest — every other feature compounds on diary length

## Problem

The entire product value is one localStorage key (`src/ui/diaryStorage.ts`). Realistic loss
scenarios, all silent: Safari ITP evicts script-writable storage after 7 days of Safari use
without visiting the site (the exact pattern of a user who tries the app, then returns after a
good-air month); "Clear History and Website Data"; iOS storage-pressure eviction; phone
replacement. Nothing in the app fights any of these — no `navigator.storage.persist()`, no
install-to-home-screen nudge (installing is the primary ITP exemption), and the only backup
prompt is an 11px note at the bottom of Settings.

Worst of all, loss is invisible: `loadDiary()` returns `[]` on any failure, and `introSeen`
lives in the same storage, so an evicted diary presents as a fresh install. The user sees the
intro again and never learns they lost four months of logs.

## Design

1. **Request persistence at the moment it's earned.** On first diary save, call
   `navigator.storage.persist()`. One line; on Chrome and installed PWAs it materially changes
   eviction policy. Track the returned grant in analytics (boolean only).
2. **Nudge install, once, at the right moment.** After the 3rd diary entry (an engaged user),
   show a dismissable card: installing keeps the app one tap away *and protects the diary from
   browser cleanup*. Detect standalone mode (`display-mode: standalone`) and never show it
   there. iOS gets the "Share → Add to Home Screen" wording; everything else gets
   `beforeinstallprompt` when available.
3. **Backup nudges tied to unbacked-up entries, not time.** Record `lastExportAt` and the entry
   count at export. When ≥10 entries have accrued since the last export (or ever), show a quiet
   chip on the Diary screen: "12 entries only live on this phone — back up". One tap runs the
   existing export. Dismissal snoozes until the next +10.
4. **Make eviction visible.** Write a tiny sentinel (`bi.sentinel`) to localStorage *and* to
   IndexedDB (different eviction behavior on some platforms, and ITP clears both — but a
   mismatch still catches partial clears and corruption). If either exists without the diary,
   show "Your diary is gone from this browser — restore from a backup?" with the import flow,
   instead of the intro.
5. **Harden the one write that matters.** `saveDiary` calls `localStorage.setItem` unguarded;
   a quota error inside the tap handler shows "Saved" then evaporates on reload. Wrap it,
   and on failure surface "couldn't save — export your diary now" rather than pretending.
6. **Make export work on iOS standalone.** Blob-anchor downloads fail silently in installed-PWA
   mode. Prefer `navigator.share({ files })` when available, fall back to the anchor, fall back
   to copy-to-clipboard. Validate imports against the entry shape (`rating`, `time`, `exposure`)
   before merging — today any JSON array with `id` fields merges straight into the model.

## Acceptance

- Fresh profile: first save triggers a `persist()` request.
- Third entry: install card appears in browser mode, never in standalone.
- Ten unexported entries: backup chip appears; export clears it; ten more brings it back.
- Deleting the diary key but not the sentinel → restore screen, not intro.
- Export produces a file on iOS standalone Safari (share sheet).
- Import of malformed JSON is rejected with a message, diary untouched.

## Non-goals

Cloud sync (that's [12-encrypted-sync.md](12-encrypted-sync.md)); automatic scheduled backups.
