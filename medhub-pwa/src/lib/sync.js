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
    const items = all.filter((it) => !it.parked);

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
        const { error, status: httpStatus } = await supabase.rpc(
          it.entity === "deck" ? "fc_upsert_deck" : "fc_upsert_card",
          {
            _id: String(it.entityId),
            _data: it.payload ?? {},
            _updated_at: new Date(it.updated_at).toISOString(),
            _deleted: !!it.deleted,
          }
        );
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
  let decksQ = supabase.from("fc_decks").select("id, data, updated_at, deleted").eq("user_id", uid);
  let cardsQ = supabase.from("fc_cards").select("id, data, updated_at, deleted").eq("user_id", uid);
  if (since) { decksQ = decksQ.gt("updated_at", since); cardsQ = cardsQ.gt("updated_at", since); }
  const [decksRes, cardsRes] = await Promise.all([decksQ, cardsQ]);
  if (decksRes.error || cardsRes.error) {
    const e = decksRes.error || cardsRes.error;
    console.error(`[SYNC] ERROR: pull failed — code: ${e?.code ?? "(none)"} message: ${e?.message ?? e} details: ${e?.details ?? "(none)"}`, e);
    setStatus("error");
    return;
  }
  console.log(`[SYNC] 4. Pulled records: decks=${decksRes.data?.length || 0}, cards=${cardsRes.data?.length || 0}`);

  let maxStamp = 0;
  const seen = (iso) => { const t = Date.parse(iso); if (t > maxStamp) maxStamp = t; return t; };

  await db.transaction("rw", db.projects, db.flashcards, async () => {
    for (const r of decksRes.data || []) {
      const remoteAt = seen(r.updated_at);
      const local = await db.projects.get(r.id);
      if (r.deleted === true) {
        if (local && localStamp(local) <= remoteAt) {
          await db.flashcards.where("projectId").equals(r.id).delete();
          await db.projects.delete(r.id);
        }
      } else if (!local || localStamp(local) < remoteAt) {
        await db.projects.put({ ...r.data, id: r.id, updated_at: remoteAt });
      }
    }
    for (const r of cardsRes.data || []) {
      const remoteAt = seen(r.updated_at);
      const local = await db.flashcards.get(r.id);
      if (r.deleted === true) {
        if (local && localStamp(local) <= remoteAt) await db.flashcards.delete(r.id);
      } else if (!local || localStamp(local) < remoteAt) {
        // Keep a local-only oversized image if the cloud snapshot lacks one.
        const image = r.data.image ?? local?.image ?? null;
        await db.flashcards.put({ ...r.data, image, id: r.id, updated_at: remoteAt });
      }
    }
  });

  // Advance the marker to the newest SERVER stamp we saw (not local clock —
  // clock-skew resistant). No rows → marker stays put.
  if (maxStamp > 0) {
    await db.meta.put({ key: LAST_PULL_KEY, value: new Date(maxStamp).toISOString() }).catch(() => {});
  }
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
    await pullMerge();       // 2. PULL + LWW-merge (live queries rehydrate UI)
    console.log("[SYNC] 5. Merge complete, updating UI");
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
