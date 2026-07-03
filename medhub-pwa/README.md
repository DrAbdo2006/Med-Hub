# Med Hub — offline-capable PWA (IndexedDB + Service Worker)

A zero-backend, fully offline flashcard app. All data lives on-device in
IndexedDB (via Dexie); the service worker (vite-plugin-pwa + Workbox) makes the
whole app installable and usable with no network.

## Run it

```bash
npm install
npm run dev          # service worker is enabled in dev (devOptions.enabled)
npm run build        # production build with precaching
npm run preview      # serve the production build locally to test offline/Lighthouse
```

## What each file does

| File | Purpose |
|------|---------|
| `src/db.js` | Dexie database in the **repo pattern** (`folderRepo`, `projectRepo`, `flashcardRepo` w/ built-in SM-2 `review()`, `gapRepo`, `mcqRepo`, `occlusionRepo`, `metaRepo`): schema + `version().upgrade()`, granular CRUD + cascade/soft-delete, `requestPersistentStorage()`, **backup/restore** (`downloadBackup` / `importAll`), and one-time **localStorage → IndexedDB migration**. |
| `src/useMedHubStore.js` | Live-query hooks. Granular read hooks (`useFolders/useProjects/useFlashcards/useDueCards`) **plus** `useMedHubStore()` which reassembles tables into the app's `folders / decks / srs` shapes and exposes **granular writers**. |
| `src/BackupControls.jsx` | "Backup (download JSON)" + "Import from file…" UI, with a confirm dialog before overwriting. |
| `src/main.jsx` | Boot: requests persistent storage, runs the legacy migration, then renders. |
| `src/App.jsx` | Working harness that exercises the full pipeline (live queries, granular writes, SM-2 review, backup, online/offline badge). Swap in the full Med Hub UI per `INTEGRATION.md`. |
| `vite.config.js` | `vite-plugin-pwa`: `registerType:'autoUpdate'`, `strategies:'generateSW'`, manifest, icons, Workbox precache + Google-Fonts `CacheFirst`, `devOptions.enabled`. |
| `public/pwa-192.png`, `pwa-512.png`, `maskable-512.png` | App icons (brand-blue placeholders — replace with final art any time). |
| `tailwind.config.js`, `postcss.config.js`, `src/index.css` | Med Hub design system (palette + Public Sans). |

## Persistence model (the important part)

- **Schema** (`db.version(1)`): `folders`, `projects`, `flashcards` (with SM-2
  fields `easeFactor, interval, repetitions, dueDate, lastReviewed`), plus
  `gaps`, `mcqs`, `occlusions`, and a `meta` key/value table for preferences.
- **Versioned upgrades**: bump `db.version(n)` and add `.upgrade()` to transform
  existing data instead of wiping it. `SCHEMA_VERSION` tracks the current number.
- **Init from IndexedDB**: `useMedHubStore` loads via `useLiveQuery`, so the very
  first render hydrates from the DB and the UI re-renders on any DB change.
- **Granular writes**: every writer (`putCard`, `patchCard`, `deleteCard`, …)
  writes a single record. No full-state serialization, no localStorage.
- **No eviction**: `navigator.storage.persist()` is requested on first load.

## Verification

> This project was authored in an environment without npm/a browser, so the
> three checks below must be run on your machine. The steps:

1. **Data survives reload** — `npm run dev`, add a file + cards, refresh the
   page. Data reloads from IndexedDB (DevTools → Application → IndexedDB →
   `medhub`). It also survives a full browser restart (persistent storage).
2. **Works offline** — `npm run build && npm run preview`, open the app, then
   DevTools → Network → **Offline**, and reload. The app shell, fonts, and your
   data all load; adding/reviewing cards still works (writes go to IndexedDB).
3. **Lighthouse PWA installability** — run Lighthouse on the `preview` build
   (Chrome → Lighthouse → "Progressive Web App"). Manifest, icons (incl.
   maskable), `start_url`, `theme_color`, HTTPS/localhost, and a registered
   service worker are all configured for the installability audit to pass.

## Backup & restore

- **Backup** downloads `medhub-backup-<timestamp>.json` containing every table.
- **Import** parses a backup file, shows a confirm dialog, then replaces all
  data in one atomic Dexie transaction.
