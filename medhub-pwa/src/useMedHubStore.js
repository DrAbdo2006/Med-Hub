// ===========================================================================
// Live-query hooks — the UI reacts to IndexedDB automatically (no setState).
//
// Two layers:
//  • Granular read hooks (useFolders/useProjects/useFlashcards/useDueCards) for
//    components that only need one slice of data.
//  • useMedHubStore() — assembles the normalized tables into the shapes the
//    existing Med Hub UI expects (folders / decks-with-nested-cards / srs) and
//    exposes granular writers. Use this to port the full app.
// ===========================================================================
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db, folderRepo, projectRepo, flashcardRepo, gapRepo, mcqRepo, occlusionRepo, metaRepo, assetRepo, uid,
} from "./db";
import { enqueueOutbox } from "./lib/sync";

// ---------------------------------------------------------------------------
// useAsset(assetId) — lazily resolve an image asset to an object URL, only
// when the component that needs it is actually rendered. Revokes the URL on
// unmount / id change so memory doesn't leak even with hundreds of images.
// Image Blobs are NEVER pulled into the global toArray() live queries below.
// ---------------------------------------------------------------------------
export function useAsset(assetId) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!assetId) { setUrl(null); return; }
    assetRepo.getURL(assetId).then((u) => { if (alive) setUrl(u); });
    return () => {
      alive = false;
      assetRepo.revoke(assetId);   // drop this id's cached object URL
    };
  }, [assetId]);
  return url;
}

// ---- granular read hooks (mirror the uploaded useMedHubData.js) ----
export const useFolders = (parentId = undefined) => useLiveQuery(
  () => parentId === undefined ? db.folders.toArray() : db.folders.where("parentId").equals(parentId ?? null).toArray(),
  [parentId]
);
export const useProjects = (folderId = undefined) => useLiveQuery(
  () => folderId === undefined ? db.projects.toArray() : db.projects.where("folderId").equals(folderId).toArray(),
  [folderId]
);
export const useFlashcards = (projectId) => useLiveQuery(
  () => projectId ? db.flashcards.where("projectId").equals(projectId).toArray() : [],
  [projectId]
);
export const useDueCards = (projectId) => useLiveQuery(async () => {
  const cards = await db.flashcards.where("dueDate").belowOrEqual(Date.now()).toArray();
  return projectId ? cards.filter((c) => c.projectId === projectId) : cards;
}, [projectId]);

// Map a flashcard row → the scheduler's srs-entry shape. Tolerant of both the
// scheduler's field names (ease/reps/stepIndex/dueDate) and the legacy create
// defaults (easeFactor/repetitions), so freshly-created and reviewed cards both
// read correctly. MUST include stepIndex/lapses/postLapseInterval or learning
// progress would reset every review.
const toSrsEntry = (c) => ({
  phase: c.phase ?? "new",
  ease: c.ease ?? c.easeFactor ?? 2.5,
  interval: c.interval ?? 0,
  stepIndex: c.stepIndex ?? 0,
  dueDate: c.dueDate ?? null,
  lapses: c.lapses ?? 0,
  reps: c.reps ?? c.repetitions ?? 0,
  lastReviewed: c.lastReviewed ?? null,
  postLapseInterval: c.postLapseInterval ?? 0,
  isLeech: c.isLeech,
});

// ---- assembled store for porting the full Med Hub UI ----
export function useMedHubStore() {
  const folders = useLiveQuery(() => db.folders.toArray(), [], undefined);
  const projects = useLiveQuery(() => db.projects.toArray(), [], undefined);
  const cards = useLiveQuery(() => db.flashcards.toArray(), [], undefined);
  const gaps = useLiveQuery(() => db.gaps.toArray(), [], undefined);
  const mcqs = useLiveQuery(() => db.mcqs.toArray(), [], undefined);
  const occlusions = useLiveQuery(() => db.occlusions.toArray(), [], undefined);
  const metaRows = useLiveQuery(() => db.meta.toArray(), [], undefined);

  const loading = [folders, projects, cards, gaps, mcqs, occlusions, metaRows].some((x) => x === undefined);

  const decks = (projects || []).map((p) => ({
    ...p,
    cards: (cards || []).filter((c) => c.projectId === p.id),
    gaps: (gaps || []).filter((g) => g.projectId === p.id),
    mcqs: (mcqs || []).filter((m) => m.projectId === p.id),
  }));
  const srs = {};
  for (const c of cards || []) srs[c.id] = toSrsEntry(c);
  const meta = Object.fromEntries((metaRows || []).map((r) => [r.key, r.value]));

  return {
    loading,
    folders: folders || [],
    decks,
    occlusions: occlusions || [],
    srs,
    meta,
    writers: {
      // folders
      createFolder: (args) => folderRepo.create(args),
      patchFolder: folderRepo.update,
      softDeleteFolder: folderRepo.softDelete,
      restoreFolder: folderRepo.restore,
      purgeFolder: folderRepo.purge,
      hardDeleteFolder: folderRepo.purge,   // permanent cascade delete (alias)
      // projects (decks) — LOCAL-FIRST + durable outbox. The IndexedDB write
      // happens first (UI reacts instantly, offline included); the outbox
      // enqueue mirrors the row to Supabase in the background (lib/sync.js).
      // Every write stamps `updated_at` = the LWW conflict timestamp.
      // SM-2 itself is untouched — only its persisted output is stamped/queued.
      createProject: async (args) => {
        const p = await projectRepo.create({ ...args, updated_at: Date.now() });
        enqueueOutbox("deck", p.id, p);
        return p;
      },
      patchProject: async (id, changes) => {
        const r = await projectRepo.update(id, { ...changes, updated_at: Date.now() });
        const p = await db.projects.get(id);
        if (p) enqueueOutbox("deck", id, p);
        return r;
      },
      deleteProject: async (id) => {
        const cardIds = (await flashcardRepo.byProject(id)).map((c) => c.id);
        await projectRepo.remove(id);
        enqueueOutbox("deck", id, null, true);              // tombstone
        for (const cid of cardIds) enqueueOutbox("card", cid, null, true);
      },
      // flashcards
      createCard: async (projectId, card) => {
        const c = await flashcardRepo.create({ projectId, ...card, updated_at: Date.now() });
        enqueueOutbox("card", c.id, c);
        return c;
      },
      putCard: async (card) => {
        const stampedCard = { ...card, updated_at: Date.now() };
        const r = await flashcardRepo.put(stampedCard);
        enqueueOutbox("card", stampedCard.id, stampedCard);
        return r;
      },
      patchCard: async (id, changes) => {          // for app's own schedule() output
        const r = await flashcardRepo.update(id, { ...changes, updated_at: Date.now() });
        const c = await db.flashcards.get(id);
        if (c) enqueueOutbox("card", id, c);
        return r;
      },
      reviewCard: async (id, gradeOrQuality) => {  // built-in SM-2 (quality or grade)
        const r = await flashcardRepo.review(id, gradeOrQuality);
        await db.flashcards.update(id, { updated_at: Date.now() });
        const c = await db.flashcards.get(id);
        if (c) enqueueOutbox("card", id, c);
        return r;
      },
      deleteCard: async (id) => {
        await flashcardRepo.remove(id);
        enqueueOutbox("card", id, null, true);              // tombstone
      },
      bulkPutCards: async (projectId, list) => {
        const cards = list.map((c) => ({ ...c, id: c.id || uid(), projectId, type: "card", updated_at: Date.now() }));
        const r = await flashcardRepo.bulkPut(cards);
        for (const c of cards) enqueueOutbox("card", c.id, c);
        return r;
      },
      // gaps / mcqs / occlusions
      createGap: (projectId, gap) => gapRepo.create({ projectId, ...gap }),
      patchGap: gapRepo.update,
      bulkPutGaps: (projectId, list) => gapRepo.bulkPut(list.map((g) => ({ ...g, id: g.id || uid(), projectId }))),
      deleteGap: gapRepo.remove,
      putMcq: (projectId, mcq) => mcqRepo.put({ ...mcq, id: mcq.id || uid(), projectId }),
      bulkPutMcqs: (projectId, list) => mcqRepo.bulkPut(list.map((m) => ({ ...m, id: m.id || uid(), projectId }))),
      deleteMcq: mcqRepo.remove,
      putOcclusion: (projectId, occ) => occlusionRepo.put({ projectId, ...occ }),
      deleteOcclusion: occlusionRepo.remove,
      // image assets (Blobs) — store a File, get back an assetId string
      putImage: (file) => assetRepo.putFile(file),
      removeImage: (assetId) => assetRepo.remove(assetId),
      // preferences
      setMeta: metaRepo.set,
    },
  };
}
