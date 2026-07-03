# Porting the full Med Hub UI onto the Dexie store

`src/App.jsx` is a small harness proving the pipeline works. To ship your real
UI, drop your existing `Flashcards.jsx` into `src/`, then refactor **only the
persistence seam inside the top-level `App()` component**. Every child component
(Header, LibraryView, ProjectView, StudyView, etc.) stays unchanged — they keep
receiving the same `folders / decks / occlusions / srs` props and the same
handler names.

## 1. Replace state initialization

**Remove** the localStorage-backed state and the snapshot effect:

```js
// DELETE these:
const saved = loadSaved();
const [folders, setFolders] = useState(saved?.folders || INITIAL_FOLDERS);
const [decks, setDecks]     = useState(saved?.decks   || INITIAL_DECKS);
const [occlusions, setOcclusions] = useState(saved?.occlusions || []);
const [srs, setSrs]   = useState(saved?.srs || {});
// …and:
useEffect(() => { saveState(snapshot()); }, [ ...everything ]);   // DELETE
```

**Add** the live-query store instead:

```js
import { useMedHubStore } from "./useMedHubStore";

const { loading, folders, decks, occlusions, srs, meta, writers } = useMedHubStore();
if (loading) return <Splash />;   // brief, until the first IndexedDB read resolves
```

Preferences that were in the snapshot now come from `meta` with a writer:

```js
const srsSettings = meta.srsSettings ?? DEFAULT_SETTINGS;
const theme       = meta.theme       ?? "system";
const setTheme    = (v) => writers.setMeta("theme", v);
const setSettings = (v) => writers.setMeta("srsSettings", v);
// progress / lastProg / studyActivity: read meta.*, write via writers.setMeta(...)
```

## 2. Map each mutation handler to a granular writer

Replace the `setDecks/setFolders(...)` bodies with a single-record DB write.
The live query updates the UI automatically — you no longer call setState.

| Old handler (setState) | New body (granular write) |
|---|---|
| `createFolder(title, desc)` | `writers.createFolder({ title, description: desc })` *(auto id + createdAt)* |
| `renameFolder(id, title)` | `writers.patchFolder(id, { title })` |
| `setFolderDesc(id, d)` | `writers.patchFolder(id, { description: d })` |
| `togglePinFolder(id)` | `writers.patchFolder(id, { pinned: !folders.find(f=>f.id===id).pinned })` |
| `deleteFolder(id)` (soft) | `writers.softDeleteFolder(id)` |
| `restoreFolder(id)` | `writers.restoreFolder(id)` |
| `purgeFolder(id)` | `writers.purgeFolder(id)`  *(cascades to its projects)* |
| `createDeck(title, desc, folderId)` | `writers.createProject({ folderId, title, description: desc, ...palette })` |
| `renameDeck(id, title)` | `writers.patchProject(id, { title })` |
| `setDeckDesc / setDeckFolder / togglePinDeck` | `writers.patchProject(id, { ... })` |
| `deleteDeck(id)` | `writers.deleteProject(id)`  *(cascades cards/gaps/mcqs/occlusions)* |
| `upsertCard(deckId, card)` | new: `writers.createCard(deckId, card)` · edit: `writers.putCard({ ...card })` |
| `addCards(deckId, list)` | `writers.bulkPutCards(deckId, list)` |
| `deleteCard(deckId, cardId)` | `writers.deleteCard(cardId)` |
| `upsertGap / addGaps / deleteGap` | `writers.createGap / bulkPutGaps / deleteGap` |
| `importMcqs / deleteMcq` | `writers.bulkPutMcqs / deleteMcq` |
| `saveOcc / deleteOcc` | `writers.putOcclusion(deckId, occ) / deleteOcclusion(id)` |

## 3. SM-2 review → patch only the card row

Your `schedule(prev, grade, settings)` returns the app's srs entry shape
(`{ phase, ease, interval, due, reps, lastReviewed }`). Convert it to the
canonical flashcard fields and patch that one card:

```js
const review = (cardId, grade) => {
  const next = schedule(srs[cardId], grade, srsSettings);     // your existing fn
  writers.patchCard(cardId, {
    phase: next.phase,
    easeFactor: next.ease,
    interval: next.interval,
    repetitions: next.reps,
    dueDate: next.due,
    lastReviewed: Date.now(),
  });
};
```

`useMedHubStore` already rebuilds the `srs` map the rest of your code reads
(`srs[cardId] = { phase, ease, interval, due, reps, lastReviewed }`), so
`schedule()`, `dueCount()`, `projectDue()` keep working untouched.

> Alternatively, if you don't need the learning-steps engine, use the built-in
> SM-2: `writers.reviewCard(cardId, "good")` (accepts "again"|"hard"|"good"|"easy"
> or a 0–5 quality) writes the card's next interval/ease/dueDate for you.

## 4. Drop the Supabase sync (optional)

This is now an offline-only app. Remove the `sb.*` cloud-sync effects and the
auth UI, or keep auth purely for the profile in `meta`. Replace the old
Export/Import-everything with `<BackupControls />` in your Settings view.

## 4b. Occlusion images → Blob assets (Task 1 UI wiring)

The data layer is ready (`assetRepo`, `useAsset`, base64 backup, migration).
Wire the three occlusion components in `Flashcards.jsx` to it:

**On image pick (OcclusionEditor)** — replace `readImage(file, dataUrl => …)`
(base64) with a Blob store, and save only the returned id:

```js
import { useAsset } from "./useMedHubStore";
import { assetRepo } from "./db";

// when the user selects a file:
const assetId = await assetRepo.putFile(file);   // stores the Blob in IndexedDB
setOcc(o => ({ ...o, assetId }));                // save the STRING id, not base64
// on save: writers.putOcclusion(projectId, { ...occ, assetId })  // no `image` field
```

**On render (OcclusionEditor / OcclusionStudy / OcclusionCard)** — resolve the
id to an object URL with the hook (lazy + auto-revoked):

```js
function OcclusionImage({ assetId, ...props }) {
  const url = useAsset(assetId);          // null until resolved, revoked on unmount
  return url ? <img src={url} {...props} /> : <div className="…skeleton…" />;
}
```

Replace every `<img src={occ.image}>` with `<OcclusionImage assetId={occ.assetId} />`.
When deleting an occlusion, also `writers.removeImage(occ.assetId)` so the Blob
is freed. Do **not** read `occ.image` anywhere anymore.

## 5. First-run migration

`main.jsx` already calls `migrateFromLocalStorageIfNeeded()`, which converts an
existing `medhub-state-v1` blob (nested decks + separate `srs` map) into the new
normalized tables — so current users keep their data on first launch.
