// ===========================================================================
// sync.js — bulletproof offline sync engine for the flashcards module.
//
// Design (deliberately NOT a naive "online → push" listener):
//   • LOCAL-FIRST: the UI writes to IndexedDB instantly (useMedHubStore
//     writers); this engine only mirrors decks/cards to Supabase afterwards.
//   • DURABLE OUTBOX: pending mutations live in the Dexie `outbox` table
//     (db.js v3), keyed "entity:entityId" so repeated edits coalesce into the
//     latest snapshot. Closing the tab loses nothing.
//   • CONFLICT RULE — LAST-WRITE-WINS by `updated_at` (row-level): every local
//     write stamps `updated_at`; the server RPCs only apply an upsert when
//     the incoming timestamp is NEWER than the stored row's, and pull-merge
//     applies the same comparison locally. Deterministic on both sides;
//     deletes are tombstones so they propagate across devices and never
//     resurrect. (Field-level SM-2 merge can layer on later.)
//   • VERIFIED RECONNECT: `online` events are treated as a hint only — the
//     browser fires them for any interface. A real request to the Supabase
//     auth endpoint decides; failures back off exponentially (5s → 5min).
//   • PARTIAL-FAILURE SAFE + IDEMPOTENT: each op is one RPC in its own
//     try/catch; failures keep ONLY that row queued (retry count bumped).
//     The LWW guard makes every retry a safe no-op if it already landed.
//   • SILENT: background flush, no UI blocking; Flashcards shows a tiny
//     status pill via onSyncStatus.
//
// RLS: fc_decks / fc_cards enforce user_id = auth.uid()
// (supabase/migrations/0008_flashcards_sync.sql). The SM-2 algorithm is
// untouched — this file only ships its persisted output.
// ===========================================================================
import { db } from "../db";
import { supabase } from "./supabaseClient";

const BACKOFF_MIN = 5_000;
const BACKOFF_MAX = 5 * 60_000;
// Card images can be large data-URLs; anything bigger than this stays
// local-only (stripped from the cloud snapshot) to keep RPC payloads sane.
const MAX_IMAGE_BYTES = 512 * 1024;
// Poison-item guard: after this many consecutive failures, PARK the item so a
// single permanently-bad row can't pin the whole queue in "retrying" forever.
const MAX_RETRIES = 5;

// Entity → sync target: which RPC pushes it, which server table pulls it, and
// which local Dexie table it merges into. Push and merge follow SYNC_ORDER, so
// parents (folders → decks) always land before children (cards/gaps/mcqs/images).
const ENTITY = {
  folder: { rpc: "fc_upsert_folder", table: "fc_folders", local: () => db.folders },
  deck:   { rpc: "fc_upsert_deck",   table: "fc_decks",   local: () => db.projects },
  card:   { rpc: "fc_upsert_card",   table: "fc_cards",   local: () => db.flashcards },
  gap:    { rpc: "fc_upsert_gap",    table: "fc_gaps",    local: () => db.gaps },
  mcq:    { rpc: "fc_upsert_mcq",    table: "fc_mcqs",    local: () => db.mcqs },
  image:  { rpc: "fc_upsert_image",  table: "fc_images",  local: () => db.occlusions },
};
const SYNC_ORDER = ["folder", "deck", "card", "gap", "mcq", "image"];
const orderIndex = (e) => { const i = SYNC_ORDER.indexOf(e); return i === -1 ? 99 : i; };

let backoff = BACKOFF_MIN;
let flushing = false;
let timer = null;
let started = false;

// ---- tiny status bus -------------------------------------------------------
//   "idle"     — queue empty (parked items ignored), everything synced
//   "syncing"  — a flush is in progress
//   "offline"  — no real connectivity / not signed in; changes safely queued
//   "retrying" — a transient failure; will retry with backoff (bounded)
//   "error"    — a hard failure: one or more items PARKED after MAX_RETRIES.
//                Truthful terminal state — NOT an endless "will retry".
let status = "idle";
let parked = 0;   // number of PARKED (poison) outbox items — drives "N failed" UI
const listeners = new Set();
const emit = () => listeners.forEach((f) => f(status, parked));
const setStatus = (s) => { if (s !== status) { status = s; emit(); } };
const setParked = (n) => { if (n !== parked) { parked = n; emit(); } };
// Listeners receive (status, parkedCount). Second arg is additive — existing
// single-arg subscribers keep working unchanged.
export function onSyncStatus(fn) { listeners.add(fn); fn(status, parked); return () => listeners.delete(fn); }

// ---- connectivity: never trust navigator.onLine alone ---------------------
async function verifyOnline() {
  try {
    const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      cache: "no-store",
    });
    return r.ok;
  } catch { return false; }
}

// Return a VALID session, refreshing a stale/near-expiry JWT first. A stale
// token is the classic silent killer: the RPC runs with auth.uid() = null, RLS
// rejects the write, and the item retries forever. Refreshing up front makes
// the write actually pass the user_id = auth.uid() policy.
async function validSession() {
  try {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    // expires_at is epoch SECONDS. Refresh if expired or within 60s of expiry.
    const skewMs = 60_000;
    const expiresMs = (session.expires_at ?? 0) * 1000;
    if (expiresMs - Date.now() <= skewMs) {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        console.error(`[SYNC ERROR] session refresh failed — code: ${error?.code ?? "(none)"} status: ${error?.status ?? "(none)"} message: ${error?.message ?? error}`, { error });
        return null;
      }
      session = data.session;
    }
    return session;
  } catch (e) {
    console.error(`[SYNC ERROR] getSession threw — message: ${e?.message ?? e}`, { error: e });
    return null;
  }
}

// ---- enqueue (called by useMedHubStore writers after every local write) ----
function snapshot(entity, payload) {
  if (!payload) return {};
  const snap = { ...payload };
  if (entity === "card" && typeof snap.image === "string" && snap.image.length > MAX_IMAGE_BYTES) {
    delete snap.image; // stays on-device; documented v1 limitation
  }
  return snap;
}

export async function enqueueOutbox(entity, entityId, payload, deleted = false) {
  // Fire-and-forget from the writers: a (rare) outbox failure must never
  // break the local-first write that already succeeded.
  // NOTE (deliberate): this coalescing put() resets `retries` and clears
  // `parked` for the row — a NEW payload deserves a fresh chance (the edit
  // may have fixed malformed data). Permanent failures (RLS/auth/validation)
  // no longer depend on the counter anyway: they park on FIRST failure.
  try {
    const updated_at = payload?.updated_at ?? Date.now();
    await db.outbox.put({
      id: `${entity}:${entityId}`,
      entity,
      entityId,
      payload: snapshot(entity, payload),
      deleted,
      updated_at,
      retries: 0,
      queuedAt: Date.now(),
    });
    scheduleFlush(0);
  } catch {
    /* local data is safe; sync just won't have this op until the next write */
  }
}

// ---- failure classification + diagnostics ----------------------------------
// TRANSIENT (keep retrying, bounded): network drops, timeouts, 5xx, 429.
// PERMANENT (park immediately — retrying can't help): RLS violations (42501),
// auth/JWT rejections (401/403), PostgREST contract errors (PGRST*), and
// data-type/constraint errors (22xxx / 23xxx, e.g. 22P02 invalid input).
// Unknown errors default to transient so real outages aren't parked, but stay
// bounded by MAX_RETRIES.
function classifyFailure(e) {
  const code = e?.code != null ? String(e.code) : "";
  const status = e?.status ?? e?.statusCode ?? null;
  const msg = String(e?.message || e || "");
  if (e instanceof TypeError || /failed to fetch|networkerror|load failed|timeout|abort/i.test(msg)) return "transient";
  if (status != null) {
    if (status === 408 || status === 429 || status >= 500) return "transient";
    if (status >= 400) return "permanent";           // 401/403 auth, 404, 409, 422…
  }
  if (code === "42501") return "permanent";          // RLS policy violation
  if (/^PGRST/i.test(code)) return "permanent";      // PostgREST / REST contract
  if (/^(22|23)/.test(code)) return "permanent";     // data type (22P02) / constraint
  return "transient";
}

// One loud, grep-able error record per failure. Search the console for
// "[SYNC ERROR]". Prints every Supabase error field explicitly (a bare object
// can collapse to [object Object] in some sinks) AND attaches the raw error +
// failing item as a structured second argument for expansion in DevTools.
function logSyncError(it, e, bucket, action) {
  console.error(
    `[SYNC ERROR] ${bucket.toUpperCase()} — ${action}\n` +
      `  code:    ${e?.code ?? "(none)"}   ← 42501=RLS · 401/403=auth/JWT · PGRST*=REST · 22P02=data type\n` +
      `  status:  ${e?.status ?? e?.statusCode ?? "(none)"}\n` +
      `  message: ${e?.message ?? String(e)}\n` +
      `  details: ${e?.details ?? "(none)"}\n` +
      `  hint:    ${e?.hint ?? "(none)"}\n` +
      `  item:    _type=${it.entity} id=${it.entityId} deleted=${!!it.deleted} retries=${it.retries || 0} updated_at=${new Date(it.updated_at).toISOString()}`,
    { item: { _type: it.entity, id: it.entityId, payload: it.payload }, error: e }
  );
}

// ---- flush: push the outbox, one idempotent RPC per row --------------------
function scheduleFlush(delay) {
  clearTimeout(timer);
  timer = setTimeout(() => { flushOutbox(); }, delay);
}

export async function flushOutbox() {
  if (flushing) return;
  flushing = true;
  try {
    const all = await db.outbox.toArray();
    // Parked (poison) items are excluded from the active working set so they
    // never block healthy rows — but they still count toward the error state.
    const parkedCount = all.filter((it) => it.parked).length;
    // STRICT RELATIONAL PUSH ORDER: folders → decks → cards/gaps/mcqs/images, so
    // a parent row always reaches the server before its children. Ties break by
    // enqueue time (FIFO).
    const items = all
      .filter((it) => !it.parked)
      .sort((a, b) => (orderIndex(a.entity) - orderIndex(b.entity)) || ((a.queuedAt || 0) - (b.queuedAt || 0)));

    setParked(parkedCount);   // keep the "N failed" count in sync with the store

    if (!items.length) {
      // Nothing left to try. If poison items remain, tell the truth: error.
      setStatus(parkedCount ? "error" : "idle");
      return;
    }

    const session = await validSession();
    if (!session) {                                // signed out / unrefreshable
      setStatus("offline");                        // queued; a later login flushes
      return;
    }
    if (!(await verifyOnline())) {                 // no REAL connectivity
      setStatus("offline");
      scheduleFlush(backoff);
      backoff = Math.min(backoff * 2, BACKOFF_MAX);
      return;
    }

    setStatus("syncing");
    let transientFailures = 0;   // items that failed but are still retryable
    let newlyParked = 0;         // items that just crossed MAX_RETRIES

    for (const it of items) {
      try {
        // Idempotent by client UUID (upsert key) + server LWW guard, so a
        // retry that already landed is a safe no-op — never a duplicate row.
        const rpc = ENTITY[it.entity]?.rpc;
        if (!rpc) throw Object.assign(new Error(`unknown sync entity "${it.entity}"`), { code: "PGRST_UNKNOWN_ENTITY" });
        const { error, status: httpStatus } = await supabase.rpc(rpc, {
          _id: String(it.entityId),
          _data: it.payload ?? {},
          _updated_at: new Date(it.updated_at).toISOString(),
          _deleted: !!it.deleted,
        });
        if (error) {
          // Carry the HTTP status into the error so the classifier/logger
          // can distinguish auth (401/403) from server (5xx) failures.
          if (error.status == null) error.status = httpStatus;
          throw error;
        }
        // Remove ONLY if the row wasn't re-queued (newer edit) mid-flight.
        const cur = await db.outbox.get(it.id);
        if (cur && cur.updated_at === it.updated_at && cur.deleted === it.deleted) {
          await db.outbox.delete(it.id);
        }
      } catch (e) {
        const bucket = classifyFailure(e);
        const retries = (it.retries || 0) + 1;
        // PERMANENT failures park IMMEDIATELY — retrying an RLS/validation
        // rejection can never succeed, and looping on it is what kept the
        // pill stuck on "Sync pending — will retry".
        const park = bucket === "permanent" || retries >= MAX_RETRIES;
        logSyncError(
          it,
          e,
          bucket,
          park
            ? `PARKED ${bucket === "permanent" ? "(permanent — retrying can't help)" : `(after ${retries}/${MAX_RETRIES} attempts)`}`
            : `retry ${retries}/${MAX_RETRIES} scheduled`
        );
        if (park) {
          newlyParked++;
          await db.outbox.update(it.id, {
            retries,
            parked: true,
            failBucket: bucket,
            lastError: `${e?.code ?? ""} ${e?.message ?? e}`.trim(),
          }).catch(() => {});
        } else {
          transientFailures++;
          await db.outbox.update(it.id, { retries }).catch(() => {});
        }
      }
    }

    setParked(parkedCount + newlyParked);   // refreshed failed count

    if (transientFailures) {
      // Genuinely transient: bounded backoff retry (not an endless loop —
      // each item is capped at MAX_RETRIES, then parks into "error").
      setStatus("retrying");
      scheduleFlush(backoff);
      backoff = Math.min(backoff * 2, BACKOFF_MAX);
    } else if (parkedCount + newlyParked > 0) {
      setStatus("error");     // healthy items drained; only poison remains
    } else {
      backoff = BACKOFF_MIN;
      setStatus("idle");
    }
  } finally {
    flushing = false;
  }
}

// Manually clear parked poison items (e.g. a "Retry failed syncs" button):
// un-park them and flush again. Exposed for the UI / debugging.
export async function retryParked() {
  const all = await db.outbox.toArray();
  await Promise.all(
    all.filter((it) => it.parked).map((it) => db.outbox.update(it.id, { parked: false, retries: 0 }))
  );
  backoff = BACKOFF_MIN;
  scheduleFlush(0);
}

// ---- pull-merge: bring the other devices' rows in, LWW by updated_at ------
// MERGE, never replace: each pulled row is applied only when its stamp is
// strictly newer than the local row's. A local record with pending outbox ops
// is newer by definition (writers stamp updated_at on every local write), so
// unsynced local work can never be wiped by a pull. Deletes require a strict
// boolean true — a missing/undefined `deleted` is treated as ACTIVE.
const localStamp = (row) => row?.updated_at ?? row?.createdAt ?? 0;
const LAST_PULL_KEY = "fcLastPulledAt";

export async function pullMerge() {
  const session = await validSession();
  if (!session) { console.warn("[SYNC] pull skipped — no valid session"); return; }
  if (!(await verifyOnline())) { console.warn("[SYNC] pull skipped — offline (no real connectivity)"); return; }
  const uid = session.user?.id;
  console.log(`[SYNC] 3. Pulling from Supabase for user: ${uid}`);

  // INCREMENTAL: only rows changed since the last successful pull (tombstones
  // included — they're rows too). First sync / fresh device = full pull.
  // The .eq("user_id") filter is for clarity/efficiency — RLS already enforces
  // it server-side, but it documents intent and trims the payload.
  const marker = await db.meta.get(LAST_PULL_KEY).catch(() => null);
  const since = marker?.value || null;

  // Fetch ALL SIX tables for this user (incremental after the first pull). The
  // .eq("user_id") filter is for clarity/efficiency; RLS is the real boundary.
  const res = {};
  await Promise.all(SYNC_ORDER.map(async (e) => {
    let q = supabase.from(ENTITY[e].table).select("id, data, updated_at, deleted").eq("user_id", uid);
    if (since) q = q.gt("updated_at", since);
    res[e] = await q;
  }));
  const firstErr = SYNC_ORDER.map((e) => res[e].error).find(Boolean);
  if (firstErr) {
    console.error(`[SYNC] ERROR: pull failed — code: ${firstErr?.code ?? "(none)"} message: ${firstErr?.message ?? firstErr} details: ${firstErr?.details ?? "(none)"}`, firstErr);
    setStatus("error");
    return;
  }
  console.log(`[SYNC] 4. Pulled records: ${SYNC_ORDER.map((e) => `${e}=${res[e].data?.length || 0}`).join(", ")}`);

  // NEVER clobber unsynced local work: any id with a pending outbox op is
  // treated as locally-newer regardless of timestamp. This also shields offline
  // edits from clock-skew (a stale server row with a "newer" clock can't win).
  const pending = new Set((await db.outbox.toArray().catch(() => [])).map((o) => o.entityId));

  // UTC normalization: Date.parse on an ISO-8601 string is spec'd as UTC, so
  // there is no local-timezone drift. NOTE: this `updated_at` is CLIENT-set (the
  // RPC stores the caller's _updated_at; the DB does not override it), so LWW
  // trusts device clocks — see the clock-skew caveat in the summary.
  const toUtc = (iso) => Date.parse(iso) || 0;
  let maxStamp = 0;
  const seen = (iso) => { const t = toUtc(iso); if (t > maxStamp) maxStamp = t; return t; };
  const orphans = [];

  // Generic per-row merge: strict LWW + pending-outbox protection + strict
  // tombstones. `hydrate` keeps local-only fields (e.g. an oversized card image
  // the cloud snapshot dropped); `parentOf` flags orphans; `cascade` removes a
  // deleted parent's descendants.
  async function mergeRows(rows, table, { hydrate, parentOf, cascade } = {}) {
    for (const r of rows || []) {
      const remoteAt = seen(r.updated_at);
      if (pending.has(r.id)) continue;                 // never clobber unsynced local work
      const local = await table.get(r.id);
      if (r.deleted === true) {                         // strict: only true is a delete
        if (local && localStamp(local) <= remoteAt) {
          if (cascade) await cascade(r.id);
          await table.delete(r.id);
        }
      } else if (!local || localStamp(local) < remoteAt) {
        if (parentOf) { const miss = await parentOf(r.data); if (miss) orphans.push(miss); }
        const data = hydrate ? hydrate(local, r.data) : r.data;
        await table.put({ ...data, id: r.id, updated_at: remoteAt });
      }
    }
  }

  // ONE transaction, STRICT HIERARCHICAL ORDER (parents before children) so a
  // child row never lands while its parent is still missing — that transient
  // "parent doesn't exist yet" window is exactly what dumped projects into
  // "Unfiled". Order: Folders → Projects → Cards/Gaps/MCQs/Images.
  await db.transaction("rw", db.folders, db.projects, db.flashcards, db.gaps, db.mcqs, db.occlusions, async () => {
    // 1. FILES (folders) — merged first so every project's folderId resolves.
    await mergeRows(res.folder.data, db.folders);
    // 2. PROJECTS (decks) — a tombstoned project cascades to ALL its children
    //    locally, so no ghost cards/gaps/mcqs/images linger under it.
    await mergeRows(res.deck.data, db.projects, {
      parentOf: async (d) => (d.folderId && !(await db.folders.get(d.folderId)) ? { type: "project", id: d.id, folderId: d.folderId } : null),
      cascade: async (pid) => { await Promise.all([
        db.flashcards.where("projectId").equals(pid).delete(),
        db.gaps.where("projectId").equals(pid).delete(),
        db.mcqs.where("projectId").equals(pid).delete(),
        db.occlusions.where("projectId").equals(pid).delete(),
      ]); },
    });
    // 3. CARDS / GAPS / MCQs / IMAGES — projectId now resolves.
    const childParent = async (d) => (d.projectId && !(await db.projects.get(d.projectId)) ? { type: "child", id: d.id, projectId: d.projectId } : null);
    await mergeRows(res.card.data, db.flashcards, { parentOf: childParent, hydrate: (local, d) => ({ ...d, image: d.image ?? local?.image ?? null }) });
    await mergeRows(res.gap.data, db.gaps, { parentOf: childParent });
    await mergeRows(res.mcq.data, db.mcqs, { parentOf: childParent });
    await mergeRows(res.image.data, db.occlusions, { parentOf: childParent });
  });

  if (orphans.length) console.warn(`[SYNC] ${orphans.length} record(s) reference a missing parent — kept linked / quarantined (not silently moved to Unfiled):`, orphans);

  // Advance the marker to the newest SERVER stamp we saw. No rows → stays put.
  if (maxStamp > 0) {
    await db.meta.put({ key: LAST_PULL_KEY, value: new Date(maxStamp).toISOString() }).catch(() => {});
  }
  // Live queries (dexie-react-hooks) re-run on commit → the hierarchy rehydrates
  // instantly, no reload.
  console.log("[SYNC] 5. Merge complete, updating UI");
}

// ---- manual/bidirectional sync: PUSH FIRST, then pull ----------------------
// Order matters: flushing the outbox before pulling means local unsynced work
// reaches the server before any merge decisions; a pull can then never see a
// "newer" stale server row for something the user just edited offline.
// `syncingNow` is the concurrency lock — mount + button + online-event can't
// run two overlapping cycles.
let syncingNow = false;
export async function syncNow() {
  if (syncingNow) return false;   // concurrency lock: mount + button can't overlap
  syncingNow = true;
  try {
    setStatus("syncing");
    // PUSH the outbox — even with 0 items — then ALWAYS pull. Never early-return
    // on an empty outbox: that was the "clicking Sync does nothing" bug (the
    // pull was reached, but the status flipped to idle so the spinner vanished
    // and a silent pull failure looked like inaction).
    const pending = await db.outbox.count().catch(() => 0);
    console.log(`[SYNC] 2. Pushing outbox (items: ${pending})`);
    await flushOutbox();     // 1. PUSH local changes (no-op if empty)
    await pullMerge();       // 2. PULL + ordered LWW-merge (logs step 5 on commit)
    return true;
  } catch (e) {
    // Surface — never swallow. Reflect in the SyncBadge too.
    console.error(`[SYNC] ERROR: sync cycle failed — code: ${e?.code ?? "(none)"} message: ${e?.message ?? e}`, e);
    setStatus("error");
    return false;
  } finally {
    syncingNow = false;
  }
}

// ---- logout safety: flush before wiping ------------------------------------
// True when the outbox holds ANY pending op (including parked/poison items) —
// i.e. there is unsynced local work that a wipe would destroy.
export async function hasUnsyncedWork() {
  try { return (await db.outbox.count()) > 0; } catch { return false; }
}

// Best-effort push for logout. Runs a normal push (session-validated,
// connectivity-checked) and reports whether the outbox is EMPTY afterward.
// Returns false if anything remains (offline, failed, or parked) so the caller
// can WARN instead of silently wiping unsynced changes.
export async function flushForLogout() {
  try { await flushOutbox(); } catch { /* fall through to the count check */ }
  return (await db.outbox.count().catch(() => 1)) === 0;
}

// Reset the in-memory engine state after a wipe so the next user starts clean
// (no carried-over backoff / parked count / status). Persisted markers are
// cleared by wipeAll() clearing the `meta` table.
export function resetSyncState() {
  backoff = BACKOFF_MIN;
  clearTimeout(timer);
  started = false;
  setParked(0);
  setStatus("idle");
}

// One-time backfill: data created BEFORE this engine existed has no outbox
// rows. Enqueue everything once (LWW server guard makes it collision-safe).
async function backfillOnce() {
  // Bump the flag key so devices that backfilled under the deck/card-only engine
  // re-run and now also ship folders/gaps/mcqs/images.
  const flag = await db.meta.get("fcSyncBackfillDone_v2");
  if (flag?.value) return;
  const [folders, projects, cards, gaps, mcqs, occ] = await Promise.all([
    db.folders.toArray(), db.projects.toArray(), db.flashcards.toArray(),
    db.gaps.toArray(), db.mcqs.toArray(), db.occlusions.toArray(),
  ]);
  // Enqueue in relational order (the flush re-sorts anyway, but this keeps the
  // outbox tidy): folders → decks → cards/gaps/mcqs/images.
  for (const f of folders) await enqueueOutbox("folder", f.id, f);
  for (const p of projects) await enqueueOutbox("deck", p.id, p);
  for (const c of cards) await enqueueOutbox("card", c.id, c);
  for (const g of gaps) await enqueueOutbox("gap", g.id, g);
  for (const m of mcqs) await enqueueOutbox("mcq", m.id, m);
  for (const o of occ) await enqueueOutbox("image", o.id, o);
  await db.meta.put({ key: "fcSyncBackfillDone_v2", value: true });
}

// ---- lifecycle -------------------------------------------------------------
export function startSync() {
  if (started) return () => {};
  started = true;
  const onOnline = () => { backoff = BACKOFF_MIN; scheduleFlush(500); };
  window.addEventListener("online", onOnline);
  // Initial pass — PUSH FIRST, then pull (same rule as syncNow): backfill
  // enqueues any pre-engine data, the flush ships everything local, and only
  // then do we merge remote rows in. Non-blocking: runs behind first paint.
  (async () => {
    await backfillOnce();
    await syncNow();
  })();
  return () => {
    window.removeEventListener("online", onOnline);
    clearTimeout(timer);
    started = false;
  };
}
