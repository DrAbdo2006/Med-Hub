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
  // SM-2 state map for EVERY schedulable type: cards, gaps, and MCQs each
  // carry scheduler fields on their own table rows. (Previously only cards
  // were mapped, so gaps/MCQs always looked brand-new to schedule() and were
  // stuck re-doing the 10-minute learning step forever.)
  for (const c of [...(cards || []), ...(gaps || []), ...(mcqs || [])]) srs[c.id] = toSrsEntry(c);
  const meta = Object.fromEntries((metaRows || []).map((r) => [r.key, r.value]));

  return {
    loading,
    folders: folders || [],
    decks,
    occlusions: occlusions || [],
    srs,
    meta,
    writers: {
      // folders (Files) — now cloud-synced. Soft-delete/restore ride in `data`
      // (data.deleted flag) as normal upserts; only PURGE emits sync tombstones.
      createFolder: async (args) => {
        const f = await folderRepo.create({ ...args, updated_at: Date.now() });
        enqueueOutbox("folder", f.id, f);
        return f;
      },
      patchFolder: async (id, changes) => {
        const r = await folderRepo.update(id, { ...changes, updated_at: Date.now() });
        const f = await db.folders.get(id);
        if (f) enqueueOutbox("folder", id, f);
        return r;
      },
      softDeleteFolder: async (id) => {
        await folderRepo.softDelete(id);
        await db.folders.update(id, { updated_at: Date.now() });
        const f = await db.folders.get(id);
        if (f) enqueueOutbox("folder", id, f);   // trash state syncs via data
      },
      restoreFolder: async (id) => {
        await folderRepo.restore(id);
        await db.folders.update(id, { updated_at: Date.now() });
        const f = await db.folders.get(id);
        if (f) enqueueOutbox("folder", id, f);
      },
      // Permanent cascade: tombstone the folder AND its projects. Pull-merge's
      // project-tombstone cascade then drops each project's cards/gaps/mcqs/
      // images on every device — no ghost descendants.
      purgeFolder: async (id) => {
        const projIds = (await db.projects.where("folderId").equals(id).toArray()).map((p) => p.id);
        await folderRepo.purge(id);
        for (const pid of projIds) enqueueOutbox("deck", pid, null, true);
        enqueueOutbox("folder", id, null, true);
      },
      hardDeleteFolder: async (id) => {   // alias of purgeFolder (same cascade + tombstones)
        const projIds = (await db.projects.where("folderId").equals(id).toArray()).map((p) => p.id);
        await folderRepo.purge(id);
        for (const pid of projIds) enqueueOutbox("deck", pid, null, true);
        enqueueOutbox("folder", id, null, true);
      },
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
        const stamped = { ...changes, updated_at: Date.now() };
        // SM-2 state lands on whichever table OWNS the item. Card rows also
        // mirror to the cloud outbox; gap/MCQ scheduling persists locally
        // (they don't cloud-sync by design). Previously this wrote ONLY to
        // db.flashcards, so gap/MCQ scheduler output silently no-oped —
        // the "stuck at 10 minutes, never graduates" bug.
        const n = await flashcardRepo.update(id, stamped);
        if (n) {
          const c = await db.flashcards.get(id);
          if (c) enqueueOutbox("card", id, c);
          return n;
        }
        const g = await gapRepo.update(id, stamped);
        if (g) { const row = await db.gaps.get(id); if (row) enqueueOutbox("gap", id, row); return g; }
        const m = await db.mcqs.update(id, stamped);
        if (m) { const row = await db.mcqs.get(id); if (row) enqueueOutbox("mcq", id, row); }
        return m;
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
      // gaps / mcqs / occlusions — now cloud-synced (stamp updated_at + enqueue).
      createGap: async (projectId, gap) => {
        const g = await gapRepo.create({ projectId, ...gap, updated_at: Date.now() });
        enqueueOutbox("gap", g.id, g);
        return g;
      },
      patchGap: async (id, changes) => {
        const r = await gapRepo.update(id, { ...changes, updated_at: Date.now() });
        const g = await db.gaps.get(id);
        if (g) enqueueOutbox("gap", id, g);
        return r;
      },
      bulkPutGaps: async (projectId, list) => {
        const gaps = list.map((g) => ({ ...g, id: g.id || uid(), projectId, updated_at: Date.now() }));
        const r = await gapRepo.bulkPut(gaps);
        for (const g of gaps) enqueueOutbox("gap", g.id, g);
        return r;
      },
      deleteGap: async (id) => { await gapRepo.remove(id); enqueueOutbox("gap", id, null, true); },
      putMcq: async (projectId, mcq) => {
        const m = { ...mcq, id: mcq.id || uid(), projectId, updated_at: Date.now() };
        const r = await mcqRepo.put(m);
        enqueueOutbox("mcq", m.id, m);
        return r;
      },
      bulkPutMcqs: async (projectId, list) => {
        const mcqs = list.map((m) => ({ ...m, id: m.id || uid(), projectId, updated_at: Date.now() }));
        const r = await mcqRepo.bulkPut(mcqs);
        for (const m of mcqs) enqueueOutbox("mcq", m.id, m);
        return r;
      },
      deleteMcq: async (id) => { await mcqRepo.remove(id); enqueueOutbox("mcq", id, null, true); },
      putOcclusion: async (projectId, occ) => {
        const o = { projectId, ...occ, id: occ.id || uid(), updated_at: Date.now() };
        const r = await occlusionRepo.put(o);
        enqueueOutbox("image", o.id, o);
        return r;
      },
      deleteOcclusion: async (id) => { await occlusionRepo.remove(id); enqueueOutbox("image", id, null, true); },
      // image assets (Blobs) — store a File, get back an assetId string
      putImage: (file) => assetRepo.putFile(file),
      removeImage: (assetId) => assetRepo.remove(assetId),
      // preferences
      setMeta: metaRepo.set,
    },
  };
}
