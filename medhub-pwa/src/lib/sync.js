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

let backoff = BACKOFF_MIN;
let flushing = false;
let timer = null;
let started = false;

// ---- tiny status bus ("idle" | "syncing" | "offline" | "retrying") --------
let status = "idle";
const listeners = new Set();
const setStatus = (s) => { if (s !== status) { status = s; listeners.forEach((f) => f(s)); } };
export function onSyncStatus(fn) { listeners.add(fn); fn(status); return () => listeners.delete(fn); }

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

async function currentUserId() {
  try { return (await supabase.auth.getSession()).data.session?.user?.id ?? null; }
  catch { return null; }
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

// ---- flush: push the outbox, one idempotent RPC per row --------------------
function scheduleFlush(delay) {
  clearTimeout(timer);
  timer = setTimeout(() => { flushOutbox(); }, delay);
}

export async function flushOutbox() {
  if (flushing) return;
  flushing = true;
  try {
    const items = await db.outbox.toArray();
    if (!items.length) { setStatus("idle"); return; }
    if (!(await currentUserId())) return;         // signed out: keep queued
    if (!(await verifyOnline())) {                 // no REAL connectivity
      setStatus("offline");
      scheduleFlush(backoff);
      backoff = Math.min(backoff * 2, BACKOFF_MAX);
      return;
    }
    setStatus("syncing");
    let failed = 0;
    for (const it of items) {
      try {
        const { error } = await supabase.rpc(it.entity === "deck" ? "fc_upsert_deck" : "fc_upsert_card", {
          _id: String(it.entityId),
          _data: it.payload ?? {},
          _updated_at: new Date(it.updated_at).toISOString(),
          _deleted: !!it.deleted,
        });
        if (error) throw error;
        // Remove ONLY if the row wasn't re-queued (newer edit) mid-flight.
        const cur = await db.outbox.get(it.id);
        if (cur && cur.updated_at === it.updated_at && cur.deleted === it.deleted) {
          await db.outbox.delete(it.id);
        }
      } catch {
        failed++;
        await db.outbox.update(it.id, { retries: (it.retries || 0) + 1 }).catch(() => {});
      }
    }
    if (failed) {
      setStatus("retrying");
      scheduleFlush(backoff);
      backoff = Math.min(backoff * 2, BACKOFF_MAX);
    } else {
      backoff = BACKOFF_MIN;
      setStatus("idle");
    }
  } finally {
    flushing = false;
  }
}

// ---- pull-merge: bring the other devices' rows in, LWW by updated_at ------
const localStamp = (row) => row?.updated_at ?? row?.createdAt ?? 0;

export async function pullMerge() {
  if (!(await currentUserId())) return;
  if (!(await verifyOnline())) return;
  const [decksRes, cardsRes] = await Promise.all([
    supabase.from("fc_decks").select("id, data, updated_at, deleted"),
    supabase.from("fc_cards").select("id, data, updated_at, deleted"),
  ]);
  if (decksRes.error || cardsRes.error) return;    // stay silent; retry later

  await db.transaction("rw", db.projects, db.flashcards, async () => {
    for (const r of decksRes.data || []) {
      const remoteAt = Date.parse(r.updated_at);
      const local = await db.projects.get(r.id);
      if (r.deleted) {
        if (local && localStamp(local) <= remoteAt) {
          await db.flashcards.where("projectId").equals(r.id).delete();
          await db.projects.delete(r.id);
        }
      } else if (!local || localStamp(local) < remoteAt) {
        await db.projects.put({ ...r.data, id: r.id, updated_at: remoteAt });
      }
    }
    for (const r of cardsRes.data || []) {
      const remoteAt = Date.parse(r.updated_at);
      const local = await db.flashcards.get(r.id);
      if (r.deleted) {
        if (local && localStamp(local) <= remoteAt) await db.flashcards.delete(r.id);
      } else if (!local || localStamp(local) < remoteAt) {
        // Keep a local-only oversized image if the cloud snapshot lacks one.
        const image = r.data.image ?? local?.image ?? null;
        await db.flashcards.put({ ...r.data, image, id: r.id, updated_at: remoteAt });
      }
    }
  });
}

// One-time backfill: data created BEFORE this engine existed has no outbox
// rows. Enqueue everything once (LWW server guard makes it collision-safe).
async function backfillOnce() {
  const flag = await db.meta.get("fcSyncBackfillDone");
  if (flag?.value) return;
  const [projects, cards] = await Promise.all([db.projects.toArray(), db.flashcards.toArray()]);
  for (const p of projects) await enqueueOutbox("deck", p.id, p);
  for (const c of cards) await enqueueOutbox("card", c.id, c);
  await db.meta.put({ key: "fcSyncBackfillDone", value: true });
}

// ---- lifecycle -------------------------------------------------------------
export function startSync() {
  if (started) return () => {};
  started = true;
  const onOnline = () => { backoff = BACKOFF_MIN; scheduleFlush(500); };
  window.addEventListener("online", onOnline);
  // Initial pass: merge remote state in, backfill pre-engine data, then push.
  (async () => {
    await pullMerge();
    await backfillOnce();
    flushOutbox();
  })();
  return () => {
    window.removeEventListener("online", onOnline);
    clearTimeout(timer);
    started = false;
  };
}
