// ===========================================================================
// Med Hub — local-first persistence (IndexedDB via Dexie)
//
// MERGED design: the clean repo pattern + SM-2 review() from the uploaded
// draft, on top of the fuller Med Hub schema (gaps / mcqs / occlusions,
// soft-delete trash, meta key/value, cascade deletes, persistent storage,
// JSON backup/restore, and one-time localStorage migration).
//
// Field names match the existing Med Hub components (q/a, title) so the full
// UI can be ported without touching child components. Offline-only: no backend.
// ===========================================================================
import Dexie from "dexie";

export const SCHEMA_VERSION = 2;

export const db = new Dexie("MedHubDB");

// ---------------------------------------------------------------------------
// Schema. PKs are app-generated string ids (stable across export/import).
// Only indexed fields appear in the string; everything else lives on the
// object. Indexes chosen for our live queries (by-folder, by-project, due).
//
// To evolve the schema later, bump db.version(n).stores({...}).upgrade(tx=>…)
// so existing user data migrates in place instead of breaking. Template:
//
//   db.version(2).stores({ flashcards: "id, projectId, dueDate, lastReviewed, tags" })
//     .upgrade(tx => tx.table("flashcards").toCollection()
//       .modify(c => { if (c.tags === undefined) c.tags = []; }));
// ---------------------------------------------------------------------------
db.version(1).stores({
  folders:    "id, parentId, pinned, deleted, deletedAt, createdAt",
  projects:   "id, folderId, pinned, lastOpened, createdAt",
  // SM-2 fields live on the card row: easeFactor, interval, repetitions,
  // dueDate, lastReviewed. dueDate is indexed so "due now" is a fast scan.
  flashcards: "id, projectId, dueDate, lastReviewed, createdAt",
  gaps:       "id, projectId, createdAt",
  mcqs:       "id, projectId, createdAt",
  occlusions: "id, projectId, createdAt",
  meta:       "key",
});

// v2 — add the `assets` table for binary image Blobs (occlusion images).
// Adding a table in a new version preserves all existing data automatically.
// The (empty) .upgrade() makes the version bump explicit; legacy base64 images
// are converted to asset Blobs by migrateFromLocalStorageIfNeeded() below.
db.version(2).stores({
  assets: "id, createdAt",   // { id, blob, mimeType, width, height, createdAt }
}).upgrade(() => {
  // No row transform needed: occlusions created under v1 had no images, and
  // legacy localStorage base64 images are handled during the one-time migration.
});

// v3 — durable sync OUTBOX (see lib/sync.js). Pending cloud mutations survive
// tab close: each row is one entity's latest snapshot, keyed "entity:entityId"
// so repeated edits COALESCE into one op instead of replaying history.
// Row shape: { id, entity: 'deck'|'card', entityId, payload, deleted,
//              updated_at (ms), retries, queuedAt }
db.version(3).stores({
  outbox: "id, entity, queuedAt",
}).upgrade(() => {
  // New table only; no data transform.
});

// ---------------------------------------------------------------------------
// Small shared helpers.
// ---------------------------------------------------------------------------
export const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const nowMs = () => Date.now();

// Fresh SM-2 state for a new card (Anki/SuperMemo defaults).
export const freshSm2 = () => ({
  easeFactor: 2.5,
  interval: 0,        // days (0 = still learning)
  repetitions: 0,
  dueDate: nowMs(),   // due immediately
  lastReviewed: null,
});

// ===========================================================================
// Repositories — granular writes (each method touches one record / one cascade).
// ===========================================================================
export const folderRepo = {
  all: () => db.folders.toArray(),
  async create({ id = uid(), title, parentId = null, pinned = false, ...rest } = {}) {
    const folder = { id, title, parentId, pinned, deleted: false, deletedAt: null, createdAt: nowMs(), ...rest };
    await db.folders.put(folder);
    return folder;
  },
  update: (id, changes) => db.folders.update(id, changes),
  softDelete: (id) => db.folders.update(id, { deleted: true, deletedAt: nowMs() }),
  restore: (id) => db.folders.update(id, { deleted: false, deletedAt: null }),
  // Permanent: removes the folder AND cascades to its projects + their content.
  async purge(id) {
    const projects = await db.projects.where("folderId").equals(id).toArray();
    // also free each project's image-occlusion Blob assets before removal
    for (const p of projects) {
      const occs = await db.occlusions.where("projectId").equals(p.id).toArray();
      await Promise.all(occs.map((o) => o.assetId ? assetRepo.remove(o.assetId) : null));
    }
    await Promise.all(projects.map((p) => projectRepo.remove(p.id)));
    await db.folders.delete(id);
  },
};

// Permanently delete a folder and everything under it (alias of folderRepo.purge).
export const hardDeleteFolder = (id) => folderRepo.purge(id);

export const projectRepo = {
  all: () => db.projects.toArray(),
  byFolder: (folderId) => db.projects.where("folderId").equals(folderId).toArray(),
  async create({ id = uid(), title, folderId = null, ...rest } = {}) {
    const project = { id, title, folderId, pinned: false, lastOpened: nowMs(), createdAt: nowMs(), ...rest };
    await db.projects.put(project);
    return project;
  },
  update: (id, changes) => db.projects.update(id, changes),
  // Cascade: delete the project + its flashcards/gaps/mcqs/occlusions atomically.
  async remove(id) {
    await db.transaction("rw", db.projects, db.flashcards, db.gaps, db.mcqs, db.occlusions, async () => {
      await db.flashcards.where("projectId").equals(id).delete();
      await db.gaps.where("projectId").equals(id).delete();
      await db.mcqs.where("projectId").equals(id).delete();
      await db.occlusions.where("projectId").equals(id).delete();
      await db.projects.delete(id);
    });
  },
};

export const flashcardRepo = {
  byProject: (projectId) => db.flashcards.where("projectId").equals(projectId).toArray(),
  due: (now = nowMs()) => db.flashcards.where("dueDate").belowOrEqual(now).toArray(),
  async create({ id = uid(), projectId, q, a, ...rest } = {}) {
    const card = { id, projectId, q, a, type: "card", ...freshSm2(), createdAt: nowMs(), ...rest };
    await db.flashcards.put(card);
    return card;
  },
  put: (card) => db.flashcards.put(card),
  bulkPut: (cards) => db.flashcards.bulkPut(cards),
  update: (id, changes) => db.flashcards.update(id, changes),
  remove: (id) => db.flashcards.delete(id),

  /**
   * SM-2 review. Accepts a SuperMemo quality (0–5) OR a Med Hub grade string
   * ("again" | "hard" | "good" | "easy"). Writes only this card's SM-2 fields.
   * If your app already has a learning-steps schedule(), use update() with its
   * output instead — see INTEGRATION.md.
   */
  async review(id, gradeOrQuality) {
    const card = await db.flashcards.get(id);
    if (!card) return null;
    const quality = typeof gradeOrQuality === "number"
      ? gradeOrQuality
      : ({ again: 1, hard: 3, good: 4, easy: 5 }[gradeOrQuality] ?? 4);

    let { easeFactor = 2.5, interval = 0, repetitions = 0 } = card;
    if (quality >= 3) {
      interval = repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.round(interval * easeFactor);
      repetitions += 1;
    } else {
      repetitions = 0;
      interval = 1;
    }
    easeFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

    const changes = {
      easeFactor, interval, repetitions,
      dueDate: nowMs() + interval * 86400000,
      lastReviewed: nowMs(),
    };
    await db.flashcards.update(id, changes);
    return { ...card, ...changes };
  },
};

export const gapRepo = {
  byProject: (projectId) => db.gaps.where("projectId").equals(projectId).toArray(),
  async create({ id = uid(), projectId, ...rest } = {}) {
    const gap = { id, projectId, createdAt: nowMs(), ...rest };
    await db.gaps.put(gap);
    return gap;
  },
  put: (gap) => db.gaps.put(gap),
  bulkPut: (gaps) => db.gaps.bulkPut(gaps),
  update: (id, changes) => db.gaps.update(id, changes),
  remove: (id) => db.gaps.delete(id),
};

export const mcqRepo = {
  byProject: (projectId) => db.mcqs.where("projectId").equals(projectId).toArray(),
  put: (mcq) => db.mcqs.put(mcq),
  bulkPut: (mcqs) => db.mcqs.bulkPut(mcqs),
  remove: (id) => db.mcqs.delete(id),
};

export const occlusionRepo = {
  byProject: (projectId) => db.occlusions.where("projectId").equals(projectId).toArray(),
  put: (occ) => db.occlusions.put(occ),
  remove: (id) => db.occlusions.delete(id),
};

// ===========================================================================
// Assets — binary image Blobs kept OUT of the JSON state. Occlusion records
// store only a string `assetId`; the Blob lives here and is turned into an
// object URL on demand (see useAsset). This is what keeps large images from
// bloating localStorage / the in-memory snapshot.
// ===========================================================================

// Read an image Blob's natural dimensions (best-effort; 0×0 if unavailable).
export async function imageDimensions(blob) {
  try {
    if (typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(blob);
      const dims = { width: bmp.width, height: bmp.height };
      bmp.close?.();
      return dims;
    }
  } catch { /* fall through */ }
  return { width: 0, height: 0 };
}

const _urlCache = new Map(); // assetId -> object URL (so we don't re-create per render)

export const assetRepo = {
  // Store a Blob, return its new id. `meta` may carry mimeType/width/height.
  async put(blob, meta = {}) {
    const id = meta.id || uid();
    const dims = (meta.width != null && meta.height != null)
      ? { width: meta.width, height: meta.height }
      : await imageDimensions(blob);
    await db.assets.put({
      id,
      blob,
      mimeType: meta.mimeType || blob.type || "image/png",
      width: dims.width,
      height: dims.height,
      createdAt: nowMs(),
    });
    return id;
  },
  // Convenience: store an <input type=file> File (a File IS a Blob).
  async putFile(file) {
    return assetRepo.put(file, { mimeType: file.type });
  },
  async get(id) {
    const row = await db.assets.get(id);
    return row?.blob ?? null;
  },
  // Object URL for rendering. Cached per id; call revoke(id) when done.
  async getURL(id) {
    if (!id) return null;
    if (_urlCache.has(id)) return _urlCache.get(id);
    const blob = await assetRepo.get(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    _urlCache.set(id, url);
    return url;
  },
  revoke(id) {
    const url = _urlCache.get(id);
    if (url) { URL.revokeObjectURL(url); _urlCache.delete(id); }
  },
  async remove(id) {
    assetRepo.revoke(id);
    await db.assets.delete(id);
  },
};

// ---- Blob <-> base64 (for JSON backup/restore) ----
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => resolve(r.result); // data URL: "data:<mime>;base64,...."
    r.readAsDataURL(blob);
  });
}

export function base64ToBlob(dataUrl, fallbackMime = "image/png") {
  const [head, b64] = String(dataUrl).split(",");
  const mime = (head.match(/data:(.*?);base64/) || [, fallbackMime])[1];
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Key/value store for preferences (settings, theme, profile, prefs, stats…).
export const metaRepo = {
  get: async (key, fallback = null) => (await db.meta.get(key))?.value ?? fallback,
  set: (key, value) => db.meta.put({ key, value }),
};

// ===========================================================================
// Persistent storage — ask the browser not to evict our IndexedDB. Call once.
// ===========================================================================
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}

export async function storageEstimate() {
  try { return navigator.storage?.estimate ? await navigator.storage.estimate() : null; }
  catch { return null; }
}

// ===========================================================================
// Backup / Restore — full JSON export & import (offline data safety).
// ===========================================================================
export async function exportAll() {
  const [folders, projects, flashcards, gaps, mcqs, occlusions, meta, assetRows] = await Promise.all([
    db.folders.toArray(), db.projects.toArray(), db.flashcards.toArray(),
    db.gaps.toArray(), db.mcqs.toArray(), db.occlusions.toArray(), db.meta.toArray(),
    db.assets.toArray(),
  ]);
  // Blobs can't go in JSON — serialize each asset Blob to a base64 data URL.
  const assets = await Promise.all(assetRows.map(async (a) => ({
    id: a.id, mimeType: a.mimeType, width: a.width, height: a.height,
    createdAt: a.createdAt, data: await blobToBase64(a.blob),
  })));
  return {
    app: "Med Hub",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { folders, projects, flashcards, gaps, mcqs, occlusions, meta, assets },
  };
}

export async function downloadBackup() {
  const payload = await exportAll();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `medhub-backup-${stamp}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  return payload;
}

// Replace ALL data with a backup. Destructive — caller MUST confirm() first.
export async function importAll(payload) {
  const d = payload?.data;
  if (payload?.app !== "Med Hub" || !d || !Array.isArray(d.folders) || !Array.isArray(d.projects) || !Array.isArray(d.flashcards)) {
    throw new Error("Not a valid Med Hub backup file.");
  }
  // Decode asset data URLs back into Blobs before the transaction.
  const assetRows = (d.assets || []).map((a) => ({
    id: a.id, blob: base64ToBlob(a.data, a.mimeType), mimeType: a.mimeType,
    width: a.width, height: a.height, createdAt: a.createdAt,
  }));
  await db.transaction("rw", db.folders, db.projects, db.flashcards, db.gaps, db.mcqs, db.occlusions, db.meta, db.assets, async () => {
    await Promise.all([
      db.folders.clear(), db.projects.clear(), db.flashcards.clear(),
      db.gaps.clear(), db.mcqs.clear(), db.occlusions.clear(), db.meta.clear(), db.assets.clear(),
    ]);
    await db.folders.bulkPut(d.folders);
    await db.projects.bulkPut(d.projects);
    await db.flashcards.bulkPut(d.flashcards);
    await db.gaps.bulkPut(d.gaps || []);
    await db.mcqs.bulkPut(d.mcqs || []);
    await db.occlusions.bulkPut(d.occlusions || []);
    await db.meta.bulkPut(d.meta || []);
    await db.assets.bulkPut(assetRows);
  });
  return { folders: d.folders.length, projects: d.projects.length, flashcards: d.flashcards.length, assets: assetRows.length };
}

// ===========================================================================
// One-time migration from the legacy localStorage snapshot ("medhub-state-v1").
// Normalizes nested decks (deck.cards/.gaps/.mcqs) + the separate `srs` map
// into the tables above. Runs only if IndexedDB is empty.
// ===========================================================================
const LEGACY_KEY = "medhub-state-v1";

export async function migrateFromLocalStorageIfNeeded() {
  const existing = (await db.folders.count()) + (await db.projects.count()) + (await db.flashcards.count());
  if (existing > 0) return false;
  let snap;
  try { snap = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null"); } catch { snap = null; }
  if (!snap) return false;

  const srs = snap.srs || {};
  const mapSm2 = (cardId) => {
    const s = srs[cardId];
    if (!s) return freshSm2();
    return {
      easeFactor: s.ease ?? s.easeFactor ?? 2.5,
      interval: s.interval ?? 0,
      repetitions: s.reps ?? s.repetitions ?? 0,
      dueDate: s.due ?? s.dueDate ?? nowMs(),
      lastReviewed: s.lastReviewed ?? null,
      phase: s.phase,
    };
  };

  const folders = (snap.folders || []).map((f) => ({ parentId: null, pinned: false, deleted: false, deletedAt: null, createdAt: nowMs(), ...f }));
  const projects = [], flashcards = [], gaps = [], mcqs = [];
  for (const deck of snap.decks || []) {
    const { cards = [], gaps: dgaps = [], mcqs: dmcqs = [], ...project } = deck;
    projects.push({ pinned: false, lastOpened: nowMs(), createdAt: nowMs(), ...project });
    for (const c of cards) flashcards.push({ ...c, projectId: deck.id, type: "card", createdAt: nowMs(), ...mapSm2(c.id) });
    for (const g of dgaps) gaps.push({ ...g, projectId: deck.id, createdAt: nowMs() });
    for (const m of dmcqs) mcqs.push({ ...m, projectId: deck.id, createdAt: nowMs() });
  }
  // Occlusions: convert each legacy base64 `image` into an asset Blob and
  // store only `assetId` on the occlusion record (no more base64 in state).
  const assets = [];
  const occ = (snap.occlusions || []).map((o) => {
    const { image, ...rest } = o;
    const record = { ...rest, projectId: o.deckId ?? o.projectId ?? null, createdAt: nowMs() };
    if (typeof image === "string" && image.startsWith("data:")) {
      const id = uid();
      const blob = base64ToBlob(image);
      assets.push({ id, blob, mimeType: blob.type, width: 0, height: 0, createdAt: nowMs() });
      record.assetId = id;
    }
    return record;
  });
  const meta = [
    ["srsSettings", snap.srsSettings], ["theme", snap.theme], ["profile", snap.profile],
    ["prefs", snap.prefs], ["progress", snap.progress], ["lastProg", snap.lastProg],
    ["studyActivity", snap.studyActivity],
  ].filter(([, v]) => v !== undefined).map(([key, value]) => ({ key, value }));

  await db.transaction("rw", db.folders, db.projects, db.flashcards, db.gaps, db.mcqs, db.occlusions, db.meta, db.assets, async () => {
    await db.folders.bulkPut(folders);
    await db.projects.bulkPut(projects);
    await db.flashcards.bulkPut(flashcards);
    await db.gaps.bulkPut(gaps);
    await db.mcqs.bulkPut(mcqs);
    await db.occlusions.bulkPut(occ);
    await db.meta.bulkPut(meta);
    await db.assets.bulkPut(assets);
  });
  return true;
}
