import { useState, useRef, useEffect, createContext, useContext } from "react";
import { useNavigate } from "react-router-dom";
// Blob-based image storage (occlusion images live in IndexedDB, not localStorage)
import { assetRepo } from "./db";
import { supabase } from "./lib/supabaseClient";
import { useAuth } from "./AuthProvider";
import { useTheme } from "./ThemeProvider";
import { motion, useReducedMotion } from "framer-motion";
import { startSync, onSyncStatus, retryParked } from "./lib/sync";
import { useAsset, useMedHubStore } from "./useMedHubStore";
import { RATING_META, RATING_ORDER, textClass, softBgClass, borderClass, fillHex, initial } from "./ratingStyles";
import {
  BookOpen,
  Brain,
  HeartPulse,
  ArrowLeft,
  RotateCcw,
  Check,
  CheckCircle2,
  XCircle,
  Trophy,
  Sparkles,
  Layers,
  Pencil,
  Plus,
  Save,
  X,
  AlignLeft,
  Lightbulb,
  Folder,
  FolderPlus,
  Trash2,
  ListChecks,
  ChevronDown,
  Image as ImageIcon,
  Upload,
  Eye,
  Move,
  Clock,
  Settings as SettingsIcon,
  User,
  LogIn,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Bell,
  Info,
  Gauge,
  RefreshCw,
  EyeOff,
  Mail,
  Lock,
  AtSign,
  Camera,
  Pin,
  PinOff,
  Search,
  Download,
  FileUp,
  ChevronLeft,
  ChevronRight,
  FolderInput,
} from "lucide-react";

const ThemeCtx = createContext(false);

// ---------------------------------------------------------------------------
// Mock database (hierarchical):
//   folders : { id, title, iconKey }          -> categories (e.g. a subject)
//   decks   : { id, folderId, title, ... }    -> lectures inside a folder
//   deck.cards : { id, q, a, image }          -> flip study + quiz
//   deck.gaps  : { id, text }                 -> fill-in-the-blank ({{...}} markers)
// SM-2 scheduling is tracked separately by entity id.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// LEGACY SEED PURGE MANIFEST — the app used to seed demo folders/decks
// (INITIAL_FOLDERS / INITIAL_DECKS) into IndexedDB for first-run users. That
// was a dual source of truth: a user who deleted ALL content emptied the DB,
// which re-triggered the "empty -> seed" check on the next load and the demo
// cards came back. Seeding is REMOVED — every user now starts 100% empty.
// This manifest only IDENTIFIES old mock rows so the one-time guarded
// cleanup effect can remove them without touching real user data: a deck is
// purged only if its id AND title still match the seed and it contains no
// user-added cards.
// ---------------------------------------------------------------------------
const LEGACY_SEED = {
  folders: [
    { id: "fa", title: "Anatomy" },
    { id: "fp", title: "Physiology" },
  ],
  decks: [
    { id: "an1", title: "Lecture 1: Neuroanatomy", cardIds: ["a1", "a2", "a3"] },
    { id: "an2", title: "Lecture 2: Brainstem & Limbic System", cardIds: ["a4", "a5"] },
    { id: "ph1", title: "Lecture 1: Membranes & Hormones", cardIds: ["p1", "p2", "p3"] },
    { id: "ph2", title: "Lecture 2: Respiration & Renal", cardIds: ["p4", "p5"] },
  ],
};

const ACCENTS = [
  { accent: "from-med-primary to-med-primary", soft: "bg-med-primary-soft", text: "text-med-primary" },
  { accent: "from-med-primary to-med-primary", soft: "bg-med-primary-soft", text: "text-med-primary" },
  { accent: "from-med-primary to-med-primary", soft: "bg-med-primary-soft", text: "text-med-primary" },
  { accent: "from-med-primary to-med-primary", soft: "bg-med-primary-soft", text: "text-med-primary" },
  { accent: "from-med-primary to-med-primary", soft: "bg-med-primary-soft", text: "text-med-primary" },
  { accent: "from-med-primary to-med-primary", soft: "bg-med-primary-soft", text: "text-med-primary" },
];

const ICONS = { brain: Brain, heart: HeartPulse, folder: Folder, book: BookOpen };
const iconFor = (x) => ICONS[x?.iconKey] || Folder;

// Group decks/occlusions by folder. Returns [{ folder, items }] for every folder
// (in order), followed by an Uncategorized bucket when it has items.
function groupByFolder(folders, items, includeEmptyFolders = true) {
  const groups = folders
    .map((folder) => ({ folder, items: items.filter((it) => it.folderId === folder.id) }))
    .filter((g) => includeEmptyFolders || g.items.length > 0);
  const uncategorized = items.filter((it) => !it.folderId || !folders.some((f) => f.id === it.folderId));
  if (uncategorized.length) groups.push({ folder: null, items: uncategorized });
  return groups;
}

// ---------------------------------------------------------------------------
// Persistence — domain data (folders, projects, flashcards, gaps, mcqs,
// occlusions, srs) lives in IndexedDB via the Dexie store (useMedHubStore).
// localStorage is used ONLY for the theme preference below.
// ---------------------------------------------------------------------------
// Supabase — CONSOLIDATED onto the one Med Hub project (lib/supabaseClient),
// sharing the platform session from AuthProvider. No second project, no
// parallel localStorage session, no hardcoded URL/key.
//
// SECURITY NOTE (read before "hiding" keys in .env): every VITE_-prefixed var
// is compiled into the shipped JS bundle and IS visible to any user in
// DevTools. Env vars keep keys out of git — they do NOT hide them from the
// browser. That's fine: the anon/publishable key is designed to be public.
// The actual protection is Row Level Security on every table (see
// supabase/migrations/). The service_role/secret key must NEVER appear here.
// ---------------------------------------------------------------------------
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || "").trim());

const sb = {
  // Lightweight connectivity check against the project's Auth endpoint.
  async ping() {
    try {
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      });
      return r.ok;
    } catch { return false; }
  },
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return data;
  },
  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    return data;
  },
  // OAuth (Google) via the shared client; returns to the flashcards tool.
  async signInWithOAuth(provider) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/flashcards` },
    });
    if (error) throw new Error(error.message);
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseGaps(gap) {
  const text = gap || "";
  const re = /\{\{(.+?)\}\}/g;
  const segments = [];
  const answers = [];
  let last = 0, m, bi = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ type: "text", value: text.slice(last, m.index) });
    segments.push({ type: "blank", answer: m[1].trim(), bi });
    answers.push(m[1].trim());
    bi++;
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ type: "text", value: text.slice(last) });
  return { segments, answers, count: answers.length };
}
const stripGaps = (t) => (t || "").replace(/\{\{|\}\}/g, "");
const normalize = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
let _idCounter = 0;
const newId = () => `c${Date.now().toString(36)}${(_idCounter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
// ----- Lightweight Markdown (no libraries): **bold**, *italic*, line breaks -----
function mdToHtml(text) {
  let s = String(text ?? "");
  s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); // escape first
  s = s.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>"); // bold before italic
  s = s.replace(/\*([^*]+?)\*/g, "<em>$1</em>");
  s = s.replace(/`([^`]+?)`/g, "<code>$1</code>");
  s = s.replace(/\r?\n/g, "<br/>");
  return s;
}
function Md({ text, className = "" }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: mdToHtml(text) }} />;
}
// ----- Project export (.medhub JSON) -----
function exportProject(deck, occlusions) {
  const payload = {
    type: "medhub-project", version: 1, exportedAt: new Date().toISOString(),
    deck: { title: deck.title, description: deck.description || "", iconKey: deck.iconKey, accent: deck.accent, soft: deck.soft, text: deck.text, cards: deck.cards || [], gaps: deck.gaps || [], mcqs: deck.mcqs || [] },
    occlusions: (occlusions || []).map(({ deckId, ...rest }) => rest),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(deck.title || "project").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.medhub`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const blankCard = () => ({ id: newId(), q: "", a: "", image: null });
const blankGap = () => ({ id: newId(), text: "" });
const blankOcc = (projectId = null) => ({ id: newId(), title: "", assetId: null, shapes: [], projectId });
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Quiz questions come ONLY from explicitly added/imported MCQs (deck.mcqs).
// Flashcards (deck.cards) are a separate feature and never feed the Quiz —
// this keeps the two sections strictly decoupled.
function buildQuiz(deck) {
  return (deck.mcqs || []).map((m) => ({ id: m.id, q: m.q, answer: m.answer, options: shuffle([...m.options]) }));
}
const quizCount = (deck) => deck.mcqs?.length || 0;
const canQuiz = (deck) => (deck.mcqs?.length || 0) > 0;
const readImage = (file, cb) => { if (!file) return; const r = new FileReader(); r.onload = () => cb(r.result); r.readAsDataURL(file); };
const readText = (file, cb) => { if (!file) return; const r = new FileReader(); r.onload = () => cb(String(r.result || "")); r.readAsText(file); };

// ----- Lightweight CSV parser (handles quoted fields, commas, newlines) -----
function parseCSV(text) {
  const rows = []; let row = [], field = "", inQ = false, i = 0;
  const t = text.replace(/^﻿/, ""); // strip BOM
  while (i < t.length) {
    const c = t[i];
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  row.push(field); rows.push(row);
  return rows.filter((r) => r.some((c) => (c || "").trim() !== ""));
}
// Expected columns: Question, Option A, Option B, Option C, Option D, Correct Answer
// "Correct Answer" may be a letter (A–D) or the exact option text.
function csvToMcqs(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  let start = 0;
  if ((rows[0][0] || "").trim().toLowerCase() === "question") start = 1;
  const out = [];
  for (let r = start; r < rows.length; r++) {
    const cols = rows[r].map((c) => (c || "").trim());
    const q = cols[0];
    const options = [cols[1], cols[2], cols[3], cols[4]].filter((o) => o && o !== "");
    if (!q || options.length < 2) continue;
    const raw = (cols[5] || "").trim();
    let answer;
    if (/^[a-dA-D]$/.test(raw)) answer = options["abcd".indexOf(raw.toLowerCase())] ?? options[0];
    else answer = options.find((o) => o.toLowerCase() === raw.toLowerCase()) || options[0];
    out.push({ id: newId(), q, options, answer });
  }
  return out;
}
// Flashcards CSV: two columns → Question, Answer
function csvToCards(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  let start = 0;
  if ((rows[0][0] || "").trim().toLowerCase() === "question") start = 1;
  const out = [];
  for (let r = start; r < rows.length; r++) {
    const q = (rows[r][0] || "").trim();
    const a = (rows[r][1] || "").trim();
    if (!q || !a) continue;
    out.push({ id: newId(), q, a, image: null });
  }
  return out;
}
// Gaps from .txt/.csv: each non-empty line is a gap sentence containing {{...}}
function linesToGaps(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^"(.*)"$/, "$1").trim())
    .filter((l) => l && /\{\{.+?\}\}/.test(l))
    .map((l) => ({ id: newId(), text: l }));
}

// ===========================================================================
// SM-2 with Anki-style learning steps (customizable via Settings).
// ---------------------------------------------------------------------------
// A card's schedule state: { phase, step, ease, interval, reps, due }
//   phase 'learning' -> short-term, driven by minute-based steps
//   phase 'review'   -> long-term, the Ease Factor multiplier takes over
//
// HOW IT WORKS
//   • New / failed cards enter the LEARNING phase and are shown again after a
//     few MINUTES, using the user's custom steps (e.g. [1, 10] minutes).
//       - "Hard"  -> restart at the first step (1 min)
//       - "Good"  -> advance to the next step; after the LAST step it GRADUATES
//       - "Easy"  -> graduate immediately
//   • GRADUATION moves the card to the REVIEW phase with a day interval the
//     user picks (Good -> graduatingIntervalDays, Easy -> easyIntervalDays).
//   • From then on classic SM-2 runs: each "Good" multiplies the interval by
//     the Ease Factor (interval = round(interval * ease)), "Easy" adds a bonus,
//     and "Hard" lapses the card back into the minute-based learning steps.
// ===========================================================================
const DAY = 86400000, MIN = 60000;
// Anki "deck options" defaults (all tunable). Old UI keys (learningStepsMin,
// graduatingIntervalDays, easyIntervalDays) are kept so the Settings panel keeps
// working; schedule() reads either name.
const DEFAULT_SETTINGS = {
  learningStepsMin: [1, 10],   // learning steps (minutes) — UI name
  relearningSteps: [10],       // relearning steps (minutes)
  graduatingIntervalDays: 1,   // Good on last learning step (days)
  easyIntervalDays: 4,         // Easy during learning (days)
  startingEase: 2.5,
  easyBonus: 1.3,
  hardFactor: 1.2,
  intervalModifier: 1.0,
  lapseNewIntervalPct: 0.0,    // post-lapse ivl = old × this (Anki default 0)
  minimumInterval: 1,          // days, floor after a lapse
  maximumInterval: 36500,      // days cap
  leechThreshold: 8,           // lapses → flag as leech
  minEase: 1.3,
};

const clampIvl = (d, s) => Math.min(s.maximumInterval ?? 36500, Math.max(s.minimumInterval ?? 1, d));

// Anki interval fuzz. Applies to day-intervals ≥ 2.5 only. rng() in [0,1).
function fuzzInterval(interval, rng = Math.random) {
  if (interval < 2.5) return interval;
  const seg1 = Math.max(0, Math.min(interval, 7) - 2.5);
  const seg2 = Math.max(0, Math.min(interval, 20) - 7);
  const seg3 = Math.max(0, interval - 20);
  const f = Math.max(1, Math.round(seg1 * 0.15 + seg2 * 0.10 + seg3 * 0.05));
  return interval + Math.round((rng() * 2 - 1) * f);   // integer in [-f, +f]
}

// Anki-faithful SM-2. Returns a CHANGES object to merge onto the card.
// rating ∈ {again, hard, good, easy}. A `new` card is treated as learning@0.
// Back-compatible with legacy entries ({ step, due }).
function schedule(card, rating, s = DEFAULT_SETTINGS, now = Date.now(), rng = Math.random) {
  const learningSteps = (s.learningStepsMin?.length ? s.learningStepsMin : [1, 10]);
  const relearningSteps = (s.relearningSteps?.length ? s.relearningSteps : [10]);
  const graduatingInterval = s.graduatingIntervalDays ?? 1;
  const easyInterval = s.easyIntervalDays ?? 4;
  const minInt = s.minimumInterval ?? 1;
  const floorEase = s.minEase ?? 1.3;

  const phase0 = card?.phase && card.phase !== "new" ? card.phase : "learning";
  const ease0 = card?.ease ?? s.startingEase;
  const interval0 = card?.interval ?? 0;
  const stepIndex0 = card?.stepIndex ?? card?.step ?? 0;
  const lapses0 = card?.lapses ?? 0;
  const reps0 = card?.reps ?? 0;
  const postLapse0 = card?.postLapseInterval ?? 0;
  const ch = { lastReviewed: now };

  // ---------- LEARNING / RELEARNING ----------
  if (phase0 === "learning" || phase0 === "relearning") {
    const steps = phase0 === "relearning" ? relearningSteps : learningSteps;
    const last = steps.length - 1;
    if (rating === "again") {
      ch.phase = phase0; ch.stepIndex = 0; ch.dueDate = now + steps[0] * MIN;
    } else if (rating === "hard") {
      const i = Math.min(stepIndex0, last);
      ch.phase = phase0; ch.stepIndex = i; ch.dueDate = now + steps[i] * MIN;
    } else if (rating === "good") {
      const next = stepIndex0 + 1;
      if (next > last) {
        const interval = phase0 === "learning" ? Math.max(minInt, graduatingInterval) : Math.max(minInt, postLapse0);
        ch.phase = "review"; ch.stepIndex = 0; ch.interval = interval; ch.reps = reps0 + 1; ch.dueDate = now + interval * DAY;
      } else {
        ch.phase = phase0; ch.stepIndex = next; ch.dueDate = now + steps[next] * MIN;
      }
    } else { // easy → graduate immediately
      const interval = phase0 === "learning" ? easyInterval : Math.max(minInt, postLapse0 + 1);
      ch.phase = "review"; ch.stepIndex = 0; ch.interval = interval; ch.reps = reps0 + 1; ch.dueDate = now + interval * DAY;
    }
    return ch;
  }

  // ---------- REVIEW ----------
  const delay = Math.max(0, Math.floor((now - (card?.dueDate ?? card?.due ?? now)) / DAY));
  if (rating === "again") { // lapse
    ch.ease = Math.max(floorEase, ease0 - 0.20);
    ch.lapses = lapses0 + 1;
    ch.postLapseInterval = Math.max(minInt, Math.round(interval0 * (s.lapseNewIntervalPct ?? 0)));
    ch.phase = "relearning"; ch.stepIndex = 0; ch.dueDate = now + relearningSteps[0] * MIN;
    if (ch.lapses >= (s.leechThreshold ?? 8)) ch.isLeech = true;
    return ch;
  }
  const mod = s.intervalModifier ?? 1;
  let hard = interval0 * (s.hardFactor ?? 1.2) * mod;
  let good = (interval0 + delay / 2) * ease0 * mod;
  let easy = (interval0 + delay) * ease0 * (s.easyBonus ?? 1.3) * mod;
  good = Math.max(good, interval0 + 1);   // passing must grow ≥ +1 day
  hard = Math.max(hard, interval0);       // hard never below interval (may be flat)
  hard = Math.min(hard, good);            // hard ≤ good
  easy = Math.max(easy, good + 1);        // good ≤ easy
  let chosen = clampIvl(Math.round({ hard, good, easy }[rating]), s);
  chosen = clampIvl(Math.round(fuzzInterval(chosen, rng)), s);
  ch.ease = rating === "hard" ? Math.max(floorEase, ease0 - 0.15) : rating === "easy" ? ease0 + 0.15 : ease0;
  ch.phase = "review"; ch.interval = chosen; ch.reps = reps0 + 1; ch.dueDate = now + chosen * DAY;
  return ch;
}
// Preview the next due timestamp for a grade without committing (fuzz-free preview).
const projectDue = (prev, grade, s) => schedule(prev, grade, s, Date.now(), () => 0.5).dueDate;

// Mastery study-loop queue mechanics. Given the current queue (front = current
// card just answered), decide re-insertion: graduated cards leave; un-graduated
// (learning/relearning) cards go back in 2–3 ahead (or the end if ≤2 remain).
// A per-card re-insert cap guards against pathological infinite loops (leeches).
const MAX_REINSERTS = 12;
function requeue(queue, id, graduated, counts) {
  const rest = queue.slice(1);
  if (graduated) return { queue: rest, counts };
  const n = (counts[id] || 0) + 1;
  const c2 = { ...counts, [id]: n };
  if (n > MAX_REINSERTS) return { queue: rest, counts: c2 };       // safety: stop looping
  if (rest.length <= 2) return { queue: [...rest, id], counts: c2 };
  const p = Math.min(2 + Math.floor(Math.random() * 2), rest.length); // 2–3 ahead
  return { queue: [...rest.slice(0, p), id, ...rest.slice(p)], counts: c2 };
}
function fmtUntil(due) {
  const min = Math.max(1, Math.round((due - Date.now()) / MIN));
  if (min < 60) return `${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day > 1 ? "s" : ""}`;
  if (day < 365) return `${Math.round(day / 30)} mo`;
  return `${(day / 365).toFixed(1)} yr`;
}
const isDue = (srs, id) => { const e = srs[id]; return !e || (e.dueDate ?? e.due ?? 0) <= Date.now(); };
const dueCount = (deck, srs) => [...deck.cards, ...deck.gaps].filter((x) => isDue(srs, x.id)).length;
// Round-robin interleave of several already-ordered lists into one mixed list,
// so a mixed study queue alternates types instead of grouping them.
function interleave(lists) {
  const arrs = lists.filter((l) => l && l.length);
  const out = [];
  for (let i = 0; arrs.some((a) => i < a.length); i++) {
    for (const a of arrs) if (i < a.length) out.push(a[i]);
  }
  return out;
}

const DEFAULT_PROFILE = { username: "Guest", email: "", picture: null, password: "", loggedIn: false };
const DEFAULT_PREFS = { notifications: true, sound: false, autoPlay: false };
const APP_VERSION = "1.0.0";

const blankProg = () => ({ again: 0, easy: 0, good: 0, hard: 0, reviews: 0, gapCorrect: 0, gapTotal: 0, quizCorrect: 0, quizTotal: 0, lastStudied: null });

// Desktop convenience: pressing Space during a study session triggers "Next".
// Ignored while typing in a field (so spaces still work in gap inputs).
function useSpaceShortcut(onSpace) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      onSpace();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSpace]);
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
export default function App() {
  // ===== IndexedDB store is the SINGLE SOURCE OF TRUTH for domain data =====
  const { loading, folders, decks, occlusions, srs, meta, writers } = useMedHubStore();

  // Non-domain app state lives in the store's meta key/value table (persisted
  // granularly via writers.setMeta). Theme stays in localStorage so it can apply
  // before the DB resolves (no flash).
  const srsSettings = meta.srsSettings || DEFAULT_SETTINGS;
  const profile = meta.profile || DEFAULT_PROFILE;
  const prefs = meta.prefs || DEFAULT_PREFS;
  const progress = meta.progress || {};
  const lastProg = meta.lastProg || {};
  const studyActivity = meta.studyActivity || {};
  const metaSetter = (key, current) => (u) => writers.setMeta(key, typeof u === "function" ? u(current) : u);
  const setSrsSettings = metaSetter("srsSettings", srsSettings);
  const setProfile = metaSetter("profile", profile);
  const setPrefs = metaSetter("prefs", prefs);

  // ---- ephemeral / session UI state (stays in React) ----
  // THEME (Option A — one global theme): the platform ThemeProvider owns the
  // mode ('light'|'dark'|'system'), persists it, and flips `dark` on <html>.
  // The flashcards theme control reads/writes THAT context, so it can never
  // desync from the rest of the app (the old local copy wrote the same
  // localStorage key but the provider never saw same-tab changes).
  const { theme, setTheme, isDark: dark } = useTheme();
  const [openProjectId, setOpenProjectId] = useState(null);
  const [session, setSession] = useState(null);
  const [editor, setEditor] = useState(null);
  const [gapEditor, setGapEditor] = useState(null);
  const [occEditor, setOccEditor] = useState(null);
  const [occStudy, setOccStudy] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // drives the top-edge progress bar
  useEffect(() => { const t = setTimeout(() => setIsLoading(false), 1400); return () => clearTimeout(t); }, []);
  // Platform session bridge — ONE login for the whole app. AuthProvider owns
  // the Supabase session; flashcards no longer keeps its own copy. (Renamed
  // destructure: `session` here is the STUDY session state above.)
  const { session: platformSession, signOut: platformSignOut } = useAuth();
  const auth = platformSession
    ? { access_token: platformSession.access_token, user: { id: platformSession.user.id, email: platformSession.user.email } }
    : null;
  const [toast, setToast] = useState(null);
  const welcomedRef = useRef(false);
  const toastTimer = useRef(null);
  function showWelcome(name) {
    if (welcomedRef.current) return;
    welcomedRef.current = true;
    setToast(`Welcome, ${name || "back"}!`);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  // ("System Default" OS-sync now lives in ThemeProvider — no local copy.)

  // ONE-TIME legacy mock cleanup (first-run seeding is gone — users start
  // empty). Guarded by the persisted `legacySeedPurged` meta flag so it never
  // runs twice, and it removes ONLY rows still matching the old seed's
  // id + title + card-id signature: anything the user created, renamed, or
  // added cards into is kept. Deletions go through `writers`, so the cloud
  // outbox gets tombstones and pull-merge can't resurrect the mock rows on
  // another device.
  const purgeRanRef = useRef(false);
  useEffect(() => {
    if (loading || purgeRanRef.current || meta.legacySeedPurged) return;
    purgeRanRef.current = true;
    (async () => {
      const purgedDecks = new Set();
      for (const seed of LEGACY_SEED.decks) {
        const deck = decks.find((d) => d.id === seed.id);
        if (!deck || deck.title !== seed.title) continue;          // renamed or absent → keep
        const cardIds = (deck.cards || []).map((c) => c.id);
        if (cardIds.some((id) => !seed.cardIds.includes(id))) continue; // user added cards → keep
        await writers.deleteProject(seed.id);                      // cascades locally + tombstones to cloud
        purgedDecks.add(seed.id);
      }
      for (const seed of LEGACY_SEED.folders) {
        const folder = folders.find((f) => f.id === seed.id);
        if (!folder || folder.title !== seed.title) continue;      // renamed or absent → keep
        const stillHasDecks = decks.some((d) => d.folderId === seed.id && !purgedDecks.has(d.id));
        if (stillHasDecks) continue;                               // user content inside → keep
        await writers.hardDeleteFolder(seed.id);
      }
      await writers.setMeta("legacySeedPurged", true);             // never run again
    })();
  }, [loading, meta.legacySeedPurged, folders, decks, writers]);

  // ---- Supabase auth — shared platform session (AuthProvider) ----
  // Sign-in/up go through the shared client; AuthProvider's onAuthStateChange
  // then updates `platformSession` app-wide, so there's nothing to store here.
  async function finishAuth(data, fallbackEmail, username) {
    const token = data.access_token || data.session?.access_token;
    const user = data.user || data.session?.user || data;
    if (!token) return { ok: false, needsConfirm: true, error: "Account created — confirm your email, then log in." };
    const emailAddr = user.email || fallbackEmail;
    const emailLocal = (emailAddr || "").split("@")[0];
    const name = (username && username.trim()) || (profile.username && profile.username !== "Guest" ? profile.username : emailLocal);
    setProfile((p) => ({ ...p, email: emailAddr, username: name || p.username, loggedIn: true }));
    showWelcome(name);
    return { ok: true };
  }
  async function signIn(email, password) {
    if (!email || !password) return { ok: false, error: "Enter your email and password." };
    try { return await finishAuth(await sb.signIn(email, password), email); }
    catch (e) { return { ok: false, error: e.message }; }
  }
  async function signUp(email, password, username) {
    if (!email || !password) return { ok: false, error: "Enter your email and password." };
    try { return await finishAuth(await sb.signUp(email, password), email, username); }
    catch (e) { return { ok: false, error: e.message }; }
  }
  // Signs out of the WHOLE platform (single identity) — ProtectedRoute then
  // redirects to /login, which is the correct single-session behavior.
  function signOut() { platformSignOut(); setProfile((p) => ({ ...p, loggedIn: false })); }

  // On load: welcome an already-authenticated user once.
  useEffect(() => {
    if (!auth?.access_token) return;
    const emailLocal = (auth.user?.email || "").split("@")[0];
    showWelcome(profile.username && profile.username !== "Guest" ? profile.username : emailLocal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deckOf = (id) => decks.find((d) => d.id === id) || null;
  // rating ∈ {again,hard,good,easy}. schedule() → ONE granular patchCard write.
  // srs is DERIVED from the flashcard rows, so it updates reactively after the
  // write. Returns the changes so the study queue can read the new phase.
  const review = (id, grade) => {
    const changes = schedule(srs[id], grade, srsSettings);
    writers.patchCard(id, changes);   // single IndexedDB write
    return changes;
  };
  const recordLast = (deckId, mode, summary) =>
    writers.setMeta("lastProg", { ...lastProg, [deckId]: { ...(lastProg[deckId] || {}), [mode]: { ...summary, when: Date.now() } } });
  const dueOf = (id) => srs[id]?.dueDate ?? srs[id]?.due ?? 0;
  const sortByDue = (items) => [...items].sort((a, b) => dueOf(a.id) - dueOf(b.id));

  // progress / stats → meta (small aggregate maps; one setMeta write each)
  const bump = (deckId, fn) => {
    const cur = progress[deckId] || blankProg();
    writers.setMeta("progress", { ...progress, [deckId]: { ...cur, ...fn(cur), lastStudied: Date.now() } });
  };
  const bumpActivity = () => { const k = dayKey(new Date()); writers.setMeta("studyActivity", { ...studyActivity, [k]: (studyActivity[k] || 0) + 1 }); };
  const recordFlip = (id, grade) => { bump(id, (c) => ({ [grade]: (c[grade] || 0) + 1, reviews: c.reviews + 1 })); bumpActivity(); };
  const recordQuiz = (id, ok) => { bump(id, (c) => ({ quizTotal: c.quizTotal + 1, quizCorrect: c.quizCorrect + (ok ? 1 : 0) })); bumpActivity(); };

  // sessions — mastery study-loop: a DYNAMIC QUEUE of card ids (SM-2 ordered).
  function startSession(deckId, mode, opts) {
    const deck = deckOf(deckId);
    const base = { deckId, mode, done: false, reinserts: {} };
    // opts.all → "Study anyway": mixed queue includes EVERYTHING, not just due
    // items (used by the caught-up state; SM-2 scheduling itself unchanged).
    const includeAll = !!opts?.all;
    if (mode === "flip") {
      const cards = sortByDue(deck.cards);
      setSession({ ...base, flipped: false, results: { again: 0, hard: 0, good: 0, easy: 0 }, cards, queue: cards.map((c) => c.id), total: cards.length, graduated: 0 });
    } else if (mode === "gap") {
      const cards = sortByDue(deck.gaps);
      setSession({ ...base, revealed: false, results: { again: 0, hard: 0, good: 0, easy: 0 }, cards, queue: cards.map((c) => c.id), total: cards.length, graduated: 0 });
    } else if (mode === "quiz") {
      const quiz = [...buildQuiz(deck)].sort((a, b) => dueOf(a.id) - dueOf(b.id));
      setSession({ ...base, selected: null, answered: false, correct: 0, quiz, queue: quiz.map((q) => q.id), total: quiz.length, graduated: 0 });
    } else if (mode === "mixed") {
      // Mixed Study Room: interleave DUE items across the SM-2 types (cards,
      // gaps, MCQs) into ONE queue. Each entry carries its `type`; MixedView
      // dispatches the right per-item UI. Occlusion image boards are NOT
      // SM-2-scheduled in this app, so they aren't part of the due queue.
      const dueCards = sortByDue(deck.cards).filter((c) => includeAll || isDue(srs, c.id)).map((c) => ({ type: "flip", id: c.id }));
      const dueGaps = sortByDue(deck.gaps).filter((g) => includeAll || isDue(srs, g.id)).map((g) => ({ type: "gap", id: g.id }));
      const quizItems = [...buildQuiz(deck)].sort((a, b) => dueOf(a.id) - dueOf(b.id));
      const quizById = {};
      const dueQuiz = quizItems.filter((q) => { quizById[q.id] = q; return includeAll || isDue(srs, q.id); }).map((q) => ({ type: "quiz", id: q.id }));
      const queue = interleave([dueCards, dueGaps, dueQuiz]);
      setSession({ ...base, queue, index: 0, total: queue.length, quizById, results: { again: 0, hard: 0, good: 0, easy: 0 }, correct: 0, flipped: false, revealed: false, selected: null, answered: false, caughtUp: queue.length === 0 });
    }
  }
  const endSession = () => setSession(null);

  // ===== mutations — every one is a single granular IndexedDB write =====
  // folders
  const createFolder = (title, description = "") => writers.createFolder({ title, description, iconKey: "book" });
  const renameFolder = (folderId, title) => writers.patchFolder(folderId, { title });
  const setFolderDesc = (folderId, description) => writers.patchFolder(folderId, { description });
  const togglePinFolder = (folderId) => writers.patchFolder(folderId, { pinned: !folders.find((f) => f.id === folderId)?.pinned });
  function deleteFolder(folderId) {  // soft delete → "Deleted files" trash
    writers.softDeleteFolder(folderId);
    if (openProjectId && decks.some((d) => d.id === openProjectId && d.folderId === folderId)) setOpenProjectId(null);
  }
  const restoreFolder = (folderId) => writers.restoreFolder(folderId);
  function purgeFolder(folderId) {   // permanent cascade (projects/cards/gaps/mcqs/occlusions+assets)
    if (typeof window !== "undefined" && !window.confirm("Are you sure you want to permanently delete this? This action cannot be undone.")) return;
    const victims = new Set(decks.filter((d) => d.folderId === folderId).map((d) => d.id));
    writers.purgeFolder(folderId);   // repo frees occlusion Blob assets transactionally
    // prune orphan stats for the removed decks
    const np = { ...progress }, nl = { ...lastProg }; victims.forEach((id) => { delete np[id]; delete nl[id]; });
    writers.setMeta("progress", np); writers.setMeta("lastProg", nl);
    if (victims.has(openProjectId)) setOpenProjectId(null);
  }

  // projects (decks)
  async function createDeck(title, description, folderId = null, open = true) {
    const palette = ACCENTS[decks.length % ACCENTS.length];
    const p = await writers.createProject({ title, description, folderId: folderId || null, iconKey: "folder", ...palette, pinned: false });
    if (open) setOpenProjectId(p.id);   // use the repo-assigned id
  }
  // Import a .medhub project → granular writes (new ids; images keyed by projectId).
  function importProjectData(data) {
    const src = data?.deck || data;
    if (!src || (!Array.isArray(src.cards) && !Array.isArray(src.gaps))) return false;
    const palette = ACCENTS[decks.length % ACCENTS.length];
    (async () => {
      const p = await writers.createProject({
        folderId: null, title: src.title || "Imported project", description: src.description || "",
        iconKey: src.iconKey || "folder",
        accent: src.accent || palette.accent, soft: src.soft || palette.soft, text: src.text || palette.text, pinned: false,
      });
      if (src.cards?.length) await writers.bulkPutCards(p.id, src.cards.map((c) => ({ q: c.q, a: c.a })));
      if (src.gaps?.length) await writers.bulkPutGaps(p.id, src.gaps.map((g) => ({ text: g.text })));
      if (src.mcqs?.length) await writers.bulkPutMcqs(p.id, src.mcqs.map(({ id, ...m }) => m));
      for (const o of (data?.occlusions || [])) await writers.putOcclusion(p.id, { title: o.title, assetId: o.assetId, shapes: o.shapes });
    })();
    return true;
  }
  const openProjectById = (deckId) => { writers.patchProject(deckId, { lastOpened: Date.now() }); setOpenProjectId(deckId); };
  const togglePinDeck = (deckId) => writers.patchProject(deckId, { pinned: !decks.find((d) => d.id === deckId)?.pinned });
  const renameDeck = (deckId, title) => writers.patchProject(deckId, { title });
  const setDeckDesc = (deckId, description) => writers.patchProject(deckId, { description });
  const setDeckFolder = (deckId, folderId) => writers.patchProject(deckId, { folderId: folderId || null });
  const deleteDeck = (deckId) => {  // cascade (repo) + free this deck's image Blobs
    occlusions.forEach((o) => { if (o.projectId === deckId && o.assetId) assetRepo.remove(o.assetId); });
    writers.deleteProject(deckId);
    setOpenProjectId(null);
  };
  // cards — write to IndexedDB ONCE on save (new → create, existing → patch)
  const upsertCard = (deckId, card) => {
    const exists = deckOf(deckId)?.cards.some((c) => c.id === card.id);
    if (exists) writers.patchCard(card.id, { q: card.q, a: card.a });
    else writers.createCard(deckId, { q: card.q, a: card.a });
  };
  const deleteCard = (deckId, cardId) => writers.deleteCard(cardId);
  const addCards = (deckId, cards) => writers.bulkPutCards(deckId, cards.map((c) => ({ q: c.q, a: c.a })));
  // gaps
  const upsertGap = (deckId, gap) => {
    const exists = deckOf(deckId)?.gaps.some((g) => g.id === gap.id);
    if (exists) writers.patchGap(gap.id, { text: gap.text });
    else writers.createGap(deckId, { text: gap.text });
  };
  const deleteGap = (deckId, gapId) => writers.deleteGap(gapId);
  const addGaps = (deckId, gaps) => writers.bulkPutGaps(deckId, gaps.map((g) => ({ text: g.text })));
  // mcqs
  const importMcqs = (deckId, mcqs) => {
    const valid = (mcqs || []).filter((m) => m && m.q && Array.isArray(m.options) && m.options.length >= 2 && m.answer != null);
    if (valid.length) writers.bulkPutMcqs(deckId, valid.map(({ id, ...m }) => m));
  };
  const deleteMcq = (deckId, mcqId) => writers.deleteMcq(mcqId);
  // occlusions (images stored as Blob assets; record carries assetId + projectId)
  function saveOcc(occ) {
    writers.putOcclusion(occ.projectId, { id: occ.id, title: occ.title, assetId: occ.assetId, shapes: occ.shapes });
    setOccEditor(null);
  }
  const deleteOcc = (id) => {
    const gone = occlusions.find((o) => o.id === id);
    if (gone?.assetId) assetRepo.remove(gone.assetId);   // free the image Blob
    writers.deleteOcclusion(id);
  };

  // ---- full-screen flows ----
  // Background cloud sync: pull-merge on mount, then flush the durable outbox;
  // re-verifies on `online` events. Silent — SyncBadge is the only surface.
  useEffect(() => startSync(), []);

  const wrap = (node) => <ThemeCtx.Provider value={dark}><TopProgressBar loading={isLoading} />{node}<Toast text={toast} /><SyncBadge /></ThemeCtx.Provider>;

  // Async-safe gate: render a loader until the first IndexedDB read resolves.
  if (loading) return wrap(<Shell><div className="flex min-h-[40vh] items-center justify-center text-sm text-med-text">Loading your library…</div></Shell>);

  if (showSettings) return wrap(<Shell><Header inStudy onBack={() => setShowSettings(false)} backLabel="Back" /><SettingsView profile={profile} setProfile={setProfile} auth={auth} onSignIn={signIn} onSignUp={signUp} onSignOut={signOut} theme={theme} setTheme={setTheme} settings={srsSettings} setSettings={setSrsSettings} prefs={prefs} setPrefs={setPrefs} /></Shell>);

  if (session) {
    const deck = deckOf(session.deckId);
    const total = session.total ?? (session.mode === "quiz" ? session.quiz.length : session.cards?.length ?? 0);
    return wrap(
      <Shell>
        {/* Focus Study Mode: minimal top bar (Exit + progress only) */}
        <Header inStudy minimal onBack={endSession} backLabel="Exit" />
        {session.done ? <CompleteView session={session} deck={deck} total={total} onRestart={() => startSession(session.deckId, session.mode)} onHome={endSession} />
          : session.mode === "mixed" ? <MixedView deck={deck} session={session} setSession={setSession} srs={srs} settings={srsSettings} onReview={review} onRecordFlip={recordFlip} onRecordQuiz={recordQuiz} onFinish={recordLast} onHome={endSession} />
          : session.mode === "flip" ? <StudyView deck={deck} session={session} setSession={setSession} srs={srs} settings={srsSettings} onReview={review} onRecord={recordFlip} onFinish={recordLast} />
          : session.mode === "gap" ? <GapView deck={deck} session={session} setSession={setSession} srs={srs} settings={srsSettings} onReview={review} onRecord={recordFlip} onFinish={recordLast} />
          : <QuizView deck={deck} session={session} setSession={setSession} onReview={review} onRecord={recordQuiz} onFinish={recordLast} />}
      </Shell>
    );
  }
  if (occStudy) return wrap(<Shell><Header inStudy minimal onBack={() => setOccStudy(null)} backLabel="Exit" /><OcclusionStudy cards={occStudy.cards} /></Shell>);
  if (occEditor) return wrap(<Shell><Header inStudy onBack={() => setOccEditor(null)} backLabel="Back" /><OcclusionEditor initial={occEditor} onCancel={() => setOccEditor(null)} onSave={saveOcc} /></Shell>);

  // ---- main: single library tab (files → projects → project sections) ----
  const openProject = openProjectId ? deckOf(openProjectId) : null;
  return wrap(
    <Shell>
      {/* Global Settings gear only on the Library view, not inside a project */}
      <Header onSettings={openProject ? undefined : () => setShowSettings(true)} />

      {openProject ? (
        <ProjectView
          deck={openProject} occlusions={occlusions.filter((o) => o.projectId === openProject.id)}
          progress={progress} lastProg={lastProg}
          onBack={() => setOpenProjectId(null)} onRename={renameDeck} onSetDesc={setDeckDesc}
          srs={srs}
          onStudy={(mode, opts) => startSession(openProject.id, mode, opts)}
          onSaveCard={upsertCard} onBulkCards={addCards} onEditCard={(card) => setEditor({ deckId: openProject.id, card })} onDeleteCard={deleteCard}
          onSaveGap={upsertGap} onBulkGaps={addGaps} onEditGap={(gap) => setGapEditor({ deckId: openProject.id, gap })} onDeleteGap={deleteGap}
          onImportMcqs={importMcqs} onDeleteMcq={deleteMcq}
          onNewImage={() => setOccEditor(blankOcc(openProject.id))} onEditImage={(o) => setOccEditor(o)} onDeleteImage={deleteOcc} onStudyImages={(cards) => setOccStudy({ cards })}
        />
      ) : (
        <LibraryView
          folders={folders} decks={decks} occlusions={occlusions} srs={srs} progress={progress}
          onOpen={openProjectById} onCreateProject={createDeck} onRenameProject={renameDeck} onDeleteProject={deleteDeck} onPinProject={togglePinDeck} onSetFolder={setDeckFolder}
          onCreateFolder={createFolder} onRenameFolder={renameFolder} onSetFolderDesc={setFolderDesc} onDeleteFolder={deleteFolder} onRestoreFolder={restoreFolder} onPurgeFolder={purgeFolder} onPinFolder={togglePinFolder}
          onImportProject={importProjectData}
        />
      )}

      {editor && <EditorModal decks={decks} editor={editor} onClose={() => setEditor(null)} onSave={(deckId, card) => { upsertCard(deckId, card); setEditor(null); }} onBulk={(deckId, cards) => { addCards(deckId, cards); setEditor(null); }} />}
      {gapEditor && <GapEditorModal decks={decks} editor={gapEditor} onClose={() => setGapEditor(null)} onSave={(deckId, gap) => { upsertGap(deckId, gap); setGapEditor(null); }} onBulk={(deckId, gaps) => { addGaps(deckId, gaps); setGapEditor(null); }} />}
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Layout & shared
// ---------------------------------------------------------------------------
// Global dark-mode contrast fix. Scoped under `.dark`, these rules remap the
// low-contrast slate utilities (and white card surfaces) to high-contrast values
// so headings, labels, inputs and helper text are all readable in dark mode,
// without changing anything in light mode.
// ---------------------------------------------------------------------------
// Brand design system — "Med Hub" palette + Public Sans.
// Injected globally (light AND dark) so the custom utilities below work in the
// single-file app exactly like the standalone tailwind.config.js would in a
// real build. Mirrors index.css / tailwind.config.js.
// ---------------------------------------------------------------------------
const BRAND_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;600&display=swap');
:root{
  --med-bg:#F7F9FA;     /* 60% background */
  --med-primary:#1B98E0;/* 30% headings / topics / icons */
  --med-accent:#E83151; /* 10% keywords / primary buttons */
  --med-text:#61636b;   /* body text */
  --med-lines:#C9A86A;  /* dividers / borders */
}
body{
  background-color:var(--med-bg);
  color:var(--med-text);
  font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,sans-serif;
  font-weight:400; /* Normal — heavier, crisper body for readability (was 300 Light) */
}
.font-sans{ font-family:'Public Sans',ui-sans-serif,system-ui,-apple-system,sans-serif; }
/* Readability: retire hairline weights — Light/Thin render as Normal (400) */
.font-light,.font-thin{ font-weight:400 !important; }
/* Brand palette utilities (usable like Tailwind classes) */
.bg-med-bg{ background-color:var(--med-bg); }
.bg-med-primary{ background-color:var(--med-primary); }
.bg-med-accent{ background-color:var(--med-accent); }
.bg-med-text{ background-color:var(--med-text); }    /* neutral grey — e.g. "Good" stat */
.bg-med-lines{ background-color:var(--med-lines); }  /* gold — "Easy" rating */
.bg-med-primary-soft{ background-color:#E8F4FC; }   /* primary tint (Good box) */
.bg-med-accent-soft{ background-color:#FCE9ED; }    /* accent tint (Again box) */
.bg-med-text-soft{ background-color:#EDF0F2; }      /* neutral tint (Hard box) */
.bg-med-lines-soft{ background-color:#F4ECDB; }     /* gold tint (Easy box) */
.text-med-primary{ color:var(--med-primary); }
.text-med-accent{ color:var(--med-accent); }
.text-med-text{ color:var(--med-text); }
.text-med-lines{ color:var(--med-lines); }          /* gold — "Easy" rating */
.text-med-muted{ color:#7c7f87; }                   /* secondary body text */
.text-med-subtle{ color:#9aa0a8; }                  /* tertiary / placeholder */
.border-med-lines{ border-color:var(--med-lines); }
.border-med-primary{ border-color:var(--med-primary); }
.border-med-accent{ border-color:var(--med-accent); }
.border-med-text{ border-color:var(--med-text); }
/* Solid-primary gradient stops (deck accents render as one flat brand color) */
.from-med-primary{ --tw-gradient-from:var(--med-primary) var(--tw-gradient-from-position); --tw-gradient-to:var(--med-primary) var(--tw-gradient-to-position); --tw-gradient-stops:var(--tw-gradient-from),var(--tw-gradient-to); }
.to-med-primary{ --tw-gradient-to:var(--med-primary) var(--tw-gradient-to-position); }
.hover\\:bg-med-accent:hover{ background-color:var(--med-accent); }
.hover\\:text-med-primary:hover{ color:var(--med-primary); }
.hover\\:border-med-primary:hover{ border-color:var(--med-primary); }

/* Top-edge indeterminate progress bar -------------------------------------- */
.medbar-track{ position:fixed; top:0; left:0; right:0; height:2px; z-index:9999; overflow:hidden; pointer-events:none; }
.medbar-fill{
  position:absolute; top:0; left:0; height:100%; width:40%;
  background:var(--med-primary); border-radius:0 9999px 9999px 0;
  box-shadow:0 0 10px 1px rgba(27,152,224,0.75), 0 0 4px 0 rgba(27,152,224,0.95);
  animation:medbar-indeterminate 1.1s cubic-bezier(.65,.05,.36,1) infinite;
}
/* bright glowing head at the leading edge */
.medbar-fill::after{
  content:""; position:absolute; right:0; top:-1px; height:4px; width:24px;
  border-radius:9999px; background:#ffffff; opacity:.65; filter:blur(3px);
}
@keyframes medbar-indeterminate{
  0%{ transform:translateX(-100%) scaleX(.6); }
  50%{ transform:translateX(80%) scaleX(1); }
  100%{ transform:translateX(250%) scaleX(.6); }
}
`;
const DARK_CSS = `
/* surfaces */
.dark .bg-white { background-color:#1e293b !important; }
.dark .bg-white\\/95 { background-color:rgba(15,23,42,0.95) !important; }
.dark .bg-slate-50 { background-color:#0e172a !important; }
.dark .bg-slate-100 { background-color:#1e293b !important; }
.dark .bg-slate-200 { background-color:#334155 !important; }
.dark .bg-indigo-50\\/40 { background-color:rgba(30,27,75,0.45) !important; }
.dark .bg-indigo-50 { background-color:rgba(30,27,75,0.55) !important; }
/* borders */
.dark .border-slate-100 { border-color:#334155 !important; }
.dark .border-slate-200 { border-color:#334155 !important; }
.dark .border-slate-300 { border-color:#475569 !important; }
.dark .border-indigo-200 { border-color:#3730a3 !important; }
/* 1. headings/titles → near-white   2/4. labels & helper text → slate-200/300 */
.dark .text-slate-900 { color:#f8fafc !important; }
.dark .text-slate-800 { color:#e2e8f0 !important; }
.dark .text-slate-700 { color:#e2e8f0 !important; }
.dark .text-slate-600 { color:#cbd5e1 !important; }
.dark .text-slate-500 { color:#cbd5e1 !important; }
.dark .text-slate-400 { color:#cbd5e1 !important; }
/* 3. inputs: bright values, muted-but-legible placeholders */
.dark input, .dark textarea, .dark select { color:#f8fafc !important; }
.dark input::placeholder, .dark textarea::placeholder { color:#94a3b8; }
.dark select option { background-color:#1e293b; color:#f8fafc; }
/* "Hard" rating (neutral gray = med-text #61636b). In light mode it's dark gray
   on a near-white #EDF0F2 tint; on dark surfaces that pairing turns into washed
   grey-on-near-white and fails to read. Keep it in the SAME gray family (a
   darkened tint of #61636b, NOT an unrelated slate) with near-white text.
   Central token fix → also corrects the CompleteView "Hard" stat box and any
   other med-text-soft surface. Only the Hard rating uses these tokens, so the
   Again/Good/Easy buttons are unaffected. */
.dark .bg-med-text-soft { background-color:#3a3c42 !important; } /* dark tint of the med-text gray */
.dark .border-med-text  { border-color:#7c7f87 !important; }     /* lighter gray → still reads as "gray rating" */
.dark .text-med-text    { color:#f1f5f9 !important; }            /* slate-100 → ~10:1 on #3a3c42, AA pass */
`;
// ---------------------------------------------------------------------------
// STRICT PALETTE ENFORCEMENT — remaps every leftover Tailwind default color
// onto the 5-color Med Hub system, in LIGHT mode. Injected after the base
// utilities (DOM order) so it wins; dark-mode rules (.dark .x !important) keep
// higher specificity and still take over in dark mode.
//   primary #1B98E0 · accent #E83151 · lines #C9A86A · text #61636b · bg #F7F9FA
// ---------------------------------------------------------------------------
const PALETTE_CSS = `
/* ---- PRIMARY: brand-family hues → #1B98E0 ---- */
.text-indigo-700,.text-indigo-600,.text-indigo-500,
.text-violet-600,.text-sky-700,.text-sky-600,.text-sky-500,
.text-fuchsia-600,.text-emerald-700,.text-emerald-600,.text-emerald-500,
.text-amber-300{ color:#1B98E0 !important; }
.bg-indigo-600,.bg-indigo-500,.bg-indigo-400,.bg-sky-400,
.bg-emerald-500,.bg-emerald-400,.bg-emerald-200,.bg-amber-400,
.fill-indigo-500{ background-color:#1B98E0 !important; }
.fill-indigo-500{ fill:#1B98E0 !important; }
/* primary soft tints (badges, soft chips, hover surfaces) */
.bg-indigo-50,.bg-indigo-50\\/40,.bg-violet-50,.bg-sky-50,.bg-sky-100,.bg-sky-200,
.bg-fuchsia-50,.bg-amber-50,.bg-emerald-50,.bg-emerald-100,.bg-indigo-400\\/30{ background-color:#E8F4FC !important; }
/* primary borders / rings (active + success states) */
.border-indigo-500,.border-indigo-400,.border-indigo-300,.border-indigo-200,
.border-emerald-500,.border-emerald-300,.border-emerald-200,.border-sky-200{ border-color:#1B98E0 !important; }
.ring-indigo-200,.ring-indigo-100,.ring-amber-300{ --tw-ring-color:rgba(27,152,224,0.25) !important; }
/* primary gradient stops → solid #1B98E0 */
.from-indigo-500,.from-amber-400,.from-amber-500{ --tw-gradient-from:#1B98E0 var(--tw-gradient-from-position) !important; --tw-gradient-to:#1B98E0 var(--tw-gradient-to-position) !important; --tw-gradient-stops:var(--tw-gradient-from),var(--tw-gradient-to) !important; }
.to-violet-600,.to-orange-500,.to-orange-600,.to-indigo-600,.to-blue-600,.to-teal-600{ --tw-gradient-to:#1B98E0 var(--tw-gradient-to-position) !important; }
.shadow-amber-200{ --tw-shadow-color:rgba(27,152,224,0.30) !important; --tw-shadow:var(--tw-shadow-colored) !important; }

/* ---- ACCENT: warnings / destructive / important → #E83151 ---- */
.text-rose-700,.text-rose-600,.text-rose-500,.text-rose-400,.text-amber-600{ color:#E83151 !important; }
.bg-rose-700,.bg-rose-600,.bg-rose-500,.bg-rose-400,.bg-amber-500{ background-color:#E83151 !important; }
.bg-rose-100,.bg-rose-50{ background-color:#FCE9ED !important; }
.border-rose-400,.border-rose-300,.border-rose-200{ border-color:#E83151 !important; }
.ring-rose-100{ --tw-ring-color:rgba(232,49,81,0.25) !important; }
.from-rose-500{ --tw-gradient-from:#E83151 var(--tw-gradient-from-position) !important; --tw-gradient-to:#E83151 var(--tw-gradient-to-position) !important; --tw-gradient-stops:var(--tw-gradient-from),var(--tw-gradient-to) !important; }
.to-pink-600{ --tw-gradient-to:#E83151 var(--tw-gradient-to-position) !important; }
.hover\\:bg-rose-700:hover,.hover\\:bg-rose-700:hover{ background-color:#C82743 !important; }

/* ---- NEUTRALS: slate → background / lines / body-text scale ---- */
/* headings/titles → primary; strong+regular body → #61636b; muted scale below */
.text-slate-900{ color:#1B98E0 !important; }
.text-slate-800,.text-slate-700,.text-slate-600{ color:#61636b !important; }
.text-slate-500{ color:#7c7f87 !important; }
.text-slate-400{ color:#9aa0a8 !important; }
/* keep typed input/textarea/select values in body color, not heading-blue */
input,textarea,select{ color:#61636b !important; }
/* app surfaces */
.bg-slate-50{ background-color:#F7F9FA !important; }
.bg-slate-100{ background-color:#EDF0F2 !important; }
.bg-slate-200{ background-color:#E1E5E9 !important; }
.bg-slate-300{ background-color:#CFD4D9 !important; }
/* all light borders/dividers/input outlines → lines #C9A86A */
.border-slate-100,.border-slate-200,.border-slate-300{ border-color:#C9A86A !important; }
/* light Shell background gradient → flat #F7F9FA */
.from-slate-50{ --tw-gradient-from:#F7F9FA var(--tw-gradient-from-position) !important; --tw-gradient-stops:var(--tw-gradient-from),var(--tw-gradient-to) !important; }
.to-slate-100{ --tw-gradient-to:#F7F9FA var(--tw-gradient-to-position) !important; }

/* ---- INTERACTION STATES: keep hover / focus / disabled on-palette ---- */
/* primary states */
.hover\\:text-indigo-600:hover,.hover\\:text-indigo-500:hover{ color:#1B98E0 !important; }
.hover\\:bg-indigo-500:hover{ background-color:#1B98E0 !important; }
.hover\\:bg-indigo-50:hover,.hover\\:bg-sky-200:hover,.hover\\:bg-emerald-100:hover,.hover\\:bg-emerald-200:hover{ background-color:#E8F4FC !important; }
.hover\\:border-indigo-300:hover{ border-color:#1B98E0 !important; }
.focus\\:border-indigo-400:focus{ border-color:#1B98E0 !important; }
.focus\\:ring-indigo-100:focus{ --tw-ring-color:rgba(27,152,224,0.25) !important; }
/* accent states (destructive / critical) */
.hover\\:text-rose-600:hover,.hover\\:text-rose-400:hover{ color:#E83151 !important; }
.hover\\:bg-rose-700:hover,.hover\\:bg-rose-200:hover,.hover\\:bg-amber-600:hover{ background-color:#C82743 !important; }
.hover\\:bg-rose-50:hover,.hover\\:bg-rose-950:hover{ background-color:#FCE9ED !important; }
/* neutral slate states → headings / body / lines */
.hover\\:text-slate-900:hover{ color:#1B98E0 !important; }
.hover\\:text-slate-700:hover,.hover\\:text-slate-600:hover{ color:#61636b !important; }
.hover\\:bg-slate-50:hover,.hover\\:bg-slate-100:hover{ background-color:#EDF0F2 !important; }
.hover\\:border-slate-500:hover{ border-color:#C9A86A !important; }
.disabled\\:text-slate-500:disabled{ color:#9aa0a8 !important; }
.disabled\\:bg-slate-50:disabled{ background-color:#F7F9FA !important; }
/* very muted text → soft body grey */
.text-slate-300{ color:#b3b8bf !important; }
`;
// Floating one-time welcome toast (auto-dismissed by the parent timer).
// Tiny non-blocking sync indicator (bottom-left; bottom-right is study CTAs).
// Renders nothing when idle — sync stays silent unless something is pending.
function SyncBadge() {
  const [s, setS] = useState("idle");
  const [parked, setParked] = useState(0);   // # of failed items, from sync state
  const [busy, setBusy] = useState(false);    // retry in flight (debounces taps)

  useEffect(() => onSyncStatus((st, pk) => {
    setS(st);
    setParked(pk ?? 0);
    // Re-enable the button once the flush resolves (any non-syncing state).
    // Driven by the SAME sync state, so the badge can't show "failed" after a
    // real success — success flips s→"idle" and this whole badge unmounts.
    if (st !== "syncing") setBusy(false);
  }), []);

  if (s === "idle") return null;
  const isError = s === "error";
  const retrying = busy || s === "syncing";   // spinner/disabled source of truth
  const showRetry = parked > 0;               // button ONLY when items are parked

  const label =
    s === "syncing" ? "Syncing…" :
    s === "offline" ? "Offline — changes saved on this device" :
    isError ? "Sync failed" :
    "Sync pending — will retry";

  const onRetry = () => {
    if (retrying) return;                      // no parallel flushes on rapid taps
    setBusy(true);                             // immediate lockout (covers the pre-"syncing" gap)
    retryParked();                             // engine coalesces + guards flushing
  };

  return (
    <div className={
      "fixed bottom-4 left-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 whitespace-nowrap rounded-full border py-1 pl-3 pr-1 text-xs font-medium text-white shadow-xl ring-1 " +
      (showRetry ? "pointer-events-auto " : "pointer-events-none ") +
      (isError ? "border-rose-400/30 bg-rose-900 ring-rose-400/20" : "border-white/15 bg-slate-900 ring-white/10")
    }>
      <span>{label}{isError && parked > 0 ? ` · ${parked}` : ""}</span>
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          aria-label={retrying ? "Retrying failed syncs" : `Retry ${parked} failed sync${parked === 1 ? "" : "s"}`}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-2.5 font-semibold text-med-primary transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-med-primary focus-visible:ring-offset-1 focus-visible:ring-offset-transparent disabled:opacity-60"
        >
          {retrying
            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            : <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
          <span>{retrying ? "Retrying…" : "Retry"}</span>
        </button>
      )}
    </div>
  );
}

function Toast({ text }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-xl ring-1 ring-white/10">
        <Sparkles className="h-4 w-4 text-amber-300" /> {text}
      </div>
    </div>
  );
}
// Ultra-thin, fixed top-edge progress bar for page transitions / loading.
// Indeterminate sweep with a glowing head (styles live in BRAND_CSS).
function TopProgressBar({ loading }) {
  if (!loading) return null;
  return (
    <div className="medbar-track" role="progressbar" aria-busy="true" aria-label="Loading">
      <div className="medbar-fill" />
    </div>
  );
}
function Shell({ children }) {
  const dark = useContext(ThemeCtx);
  return (
    <div className={`min-h-screen w-full font-sans ${dark ? "dark bg-[#0e172a] text-slate-100" : "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800"}`}>
      <style>{BRAND_CSS}</style>
      <style>{PALETTE_CSS}</style>
      {dark && <style>{DARK_CSS}</style>}
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">{children}</div>
    </div>
  );
}
// Header. Three modes:
//  • browse  : logo (left) + Settings (right)
//  • inStudy : a consistent top-left Back/Exit button (+ small label unless minimal)
//  • minimal : Focus Study Mode — ONLY the Back/Exit button, hiding the logo/settings
//              to give the flashcards maximum screen real-estate (progress bar follows).
function Header({ inStudy, onBack, onSettings, minimal, backLabel = "Exit" }) {
  const dark = useContext(ThemeCtx);
  // Generic / body text → med-text + Public Sans Light. Borders → med-lines.
  const backBtn = (
    <button onClick={onBack} title={backLabel} className={`flex items-center gap-1.5 rounded-lg border border-med-lines px-3 py-2 text-sm font-medium shadow-sm transition active:scale-95 ${dark ? "bg-slate-800 text-slate-100 hover:bg-slate-700" : "bg-white text-med-text hover:bg-slate-50"}`}><ArrowLeft className="h-4 w-4" /> {backLabel}</button>
  );
  if (inStudy) {
    return (
      <header className="mb-5 flex items-center gap-3">
        {backBtn}
        {!minimal && <span className="text-sm font-semibold text-med-primary">Med Hub</span>}
      </header>
    );
  }
  return (
    <header className="relative mb-6 flex h-10 items-center justify-end">
      {/* Title is absolutely centered so the right-side buttons don't shift it off-center */}
      {/* Brand wordmark → primary blue, Public Sans SemiBold */}
      <h1 className="absolute left-1/2 -translate-x-1/2 text-lg font-semibold tracking-tight text-med-primary">Med Hub</h1>
      <div className="flex gap-2">
        {onSettings && <button onClick={onSettings} title="Settings" className={`flex items-center justify-center rounded-lg border border-med-lines px-2.5 py-2 shadow-sm transition ${dark ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-white text-med-text hover:bg-slate-50 hover:text-med-primary"}`}><SettingsIcon className="h-4 w-4" /></button>}
      </div>
    </header>
  );
}
function Collapsible({ title, titleNode, subtitle, defaultOpen = true, right, children }) {
  const [open, setOpen] = useState(defaultOpen);
  // NOTE: no `overflow-hidden` here — it would clip the Settings dropdown menus
  // rendered from the header `right` slot. Corners are kept rounded via rounded-2xl.
  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 ease-in-out hover:shadow-md hover:border-med-primary">
      <div className="relative flex items-center justify-between gap-3 px-5 py-4">
        {titleNode ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button onClick={() => setOpen((o) => !o)} className="shrink-0"><ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} /></button>
            <div className="min-w-0">{titleNode}{subtitle && <span className="block text-xs text-slate-400">{subtitle}</span>}</div>
          </div>
        ) : (
          <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? "" : "-rotate-90"}`} />
            <span className="min-w-0"><span className="block truncate font-semibold text-slate-900">{title}</span>{subtitle && <span className="block text-xs text-slate-400">{subtitle}</span>}</span>
          </button>
        )}
        {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
      </div>
      {open && <div className="border-t border-slate-100 p-5">{children}</div>}
    </div>
  );
}
// Folder header (no icon). Rename is driven only from the menu (clickToEdit=false).
function FolderTitle({ folder, onRename, editing, onEditingChange }) {
  if (!folder) return <span className="font-semibold text-slate-500">Deleted files</span>;
  return (
    <span className="flex items-center gap-2">
      {onRename ? <EditableTitle value={folder.title} onChange={(t) => onRename(folder.id, t)} editing={editing} onEditingChange={onEditingChange} clickToEdit={false} className="font-semibold text-slate-900" /> : <span className="font-semibold text-slate-900">{folder.title}</span>}
      {folder.pinned && <Pin className="h-3.5 w-3.5 fill-indigo-500 text-indigo-500" />}
    </span>
  );
}
// EditableTitle: controlled editing (driven by a menu) and, when clickToEdit is
// true, also click-to-edit. When clickToEdit is false the name is plain text and
// can only be edited via the parent (e.g. the Settings menu → Rename).
function EditableTitle({ value, onChange, className = "", editing: cEditing, onEditingChange, clickToEdit = true }) {
  const [iEditing, setIEditing] = useState(false);
  const editing = cEditing !== undefined ? cEditing : iEditing;
  const setEditing = (v) => { onEditingChange ? onEditingChange(v) : setIEditing(v); };
  const [v, setV] = useState(value);
  useEffect(() => { if (editing) setV(value); }, [editing]);
  function commit() { onChange((v || "").trim() || value); setEditing(false); }
  if (editing) return <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }} className={`rounded-md border border-indigo-300 bg-white px-2 py-0.5 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-100 ${className}`} />;
  if (!clickToEdit) return <span className={className}>{value}</span>;
  return <button title="Click to rename" onClick={() => { setV(value); setEditing(true); }} className={`rounded-md text-left decoration-dotted decoration-slate-300 underline-offset-4 hover:underline ${className}`}>{value}</button>;
}
// Inline editable description (empty allowed). Click to edit, blur/Enter to save.
function InlineDesc({ value, onSave, placeholder = "Add a description…", className = "" }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value || "");
  useEffect(() => { if (editing) setV(value || ""); }, [editing]);
  function commit() { onSave((v || "").trim()); setEditing(false); }
  if (editing) return <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }} placeholder={placeholder} className={`w-full max-w-lg rounded-md border border-indigo-300 bg-white px-2 py-1 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-indigo-100 ${className}`} />;
  return <button onClick={() => setEditing(true)} className={`text-left text-sm decoration-dotted decoration-slate-300 underline-offset-4 hover:underline ${value ? "text-slate-500" : "text-slate-400"} ${className}`}>{value || placeholder}</button>;
}
// Clean dropdown menu (settings icon → overlay of actions). Closes on outside click.
function Menu({ items, align = "right" }) {
  const dark = useContext(ThemeCtx);
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} title="Options" className={`flex items-center justify-center rounded-lg border p-1.5 transition ${dark ? "border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}><SettingsIcon className="h-4 w-4" /></button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div onClick={(e) => e.stopPropagation()} className={`absolute z-50 mt-1 w-48 overflow-hidden rounded-xl border py-1 shadow-lg ${align === "right" ? "right-0" : "left-0"} ${dark ? "border-slate-600 bg-slate-800" : "border-slate-200 bg-white"}`}>
            {items.map((it, i) => (
              <button key={i} onClick={() => { setOpen(false); it.onClick(); }} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${it.danger ? "text-rose-600 hover:bg-rose-50" : dark ? "text-slate-200 hover:bg-slate-700" : "text-slate-700 hover:bg-slate-50"}`}>
                {it.icon && <it.icon className="h-4 w-4" />} {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
// Textarea that grows to fit its content (no inner scrollbar).
function AutoTextarea({ value, onChange, className = "", minRows = 2, innerRef, ...rest }) {
  const localRef = useRef(null);
  const ref = innerRef || localRef;
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  }, [value, ref]);
  return <textarea ref={ref} rows={minRows} value={value} onChange={onChange} className={`resize-none overflow-hidden ${className}`} {...rest} />;
}
function Field({ label, hint, children }) {
  return <label className="mb-3 block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}</label>;
}

// ---------------------------------------------------------------------------
// Card form
// ---------------------------------------------------------------------------
function CardForm({ initial, accent, onCancel, onSave, onBulk }) {
  const [q, setQ] = useState(initial.q);
  const [a, setA] = useState(initial.a);
  const [importErr, setImportErr] = useState(null);
  const valid = q.trim() && a.trim();
  function save() { if (!valid) return; onSave({ id: initial.id, q: q.trim(), a: a.trim() }); }
  // Cmd/Ctrl + Enter saves while typing.
  const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); } };
  function handleCsv(file) {
    if (!file) return;
    readText(file, (text) => {
      const cards = csvToCards(text);
      if (cards.length) onBulk(cards);
      else { setImportErr("No valid rows. Expected 2 columns: Question, Answer."); setTimeout(() => setImportErr(null), 4000); }
    });
  }
  return (
    <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-5 shadow-sm">
      {/* dir="auto": Arabic card text aligns right natively, English stays left */}
      <Field label="Question"><AutoTextarea dir="auto" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} minRows={2} placeholder="What do you want to be asked?" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none transition-shadow duration-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></Field>
      <Field label="Answer"><AutoTextarea dir="auto" value={a} onChange={(e) => setA(e.target.value)} onKeyDown={onKey} minRows={3} placeholder="The full answer shown when the card is flipped." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none transition-shadow duration-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></Field>

      <div className="mt-4 flex items-center gap-2">
        <button disabled={!valid} onClick={save} className={`flex items-center gap-1.5 rounded-lg bg-gradient-to-r ${accent} px-4 py-2 text-sm font-semibold text-white shadow transition active:scale-95 ${valid ? "hover:opacity-90" : "cursor-not-allowed opacity-40"}`}><Save className="h-4 w-4" /> Save card</button>
        <button onClick={onCancel} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /> Cancel</button>
        <span className="ml-auto hidden text-xs text-slate-400 sm:inline">⌘/Ctrl + Enter to save</span>
      </div>

      {onBulk && (
        <div className="mt-4 border-t border-indigo-200 pt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Or bulk import</p>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600">
            <Upload className="h-4 w-4 shrink-0" /> Upload a <span className="font-mono">.csv</span> — columns: Question, Answer
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { handleCsv(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {importErr && <p className="mt-1 text-xs font-medium text-rose-500">{importErr}</p>}
        </div>
      )}
    </div>
  );
}
function EditorModal({ decks, editor, onClose, onSave, onBulk }) {
  const [deckId, setDeckId] = useState(editor.deckId || decks[0]?.id);
  const isEdit = decks.some((d) => d.cards.some((c) => c.id === editor.card.id));
  if (!decks.length) return null;
  return (
    <ModalShell title={isEdit ? "Edit card" : "Add card"} onClose={onClose}>
      <Field label="Deck"><select value={deckId} onChange={(e) => setDeckId(e.target.value)} disabled={isEdit} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-500">{decks.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>
      <CardForm initial={editor.card} accent="from-indigo-500 to-violet-600" onCancel={onClose} onSave={(card) => onSave(deckId, card)} onBulk={isEdit ? null : (cards) => onBulk(deckId, cards)} />
    </ModalShell>
  );
}
function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="mt-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-slate-900">{title}</h3><button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flip study (SM-2 grading)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// FlipCard3D — premium 3D flip with the transforms LAYERED so they never
// fight: OUTER motion.div owns hover/tap scale, INNER motion.div owns the
// rotateY flip (a single element can't carry both without one clobbering the
// other). Faces: both backface-hidden and the back face PERMANENTLY rotated
// 180° — without that the revealed answer renders mirrored, which is
// glaringly wrong with Arabic text. Under prefers-reduced-motion the 3D flip
// becomes a simple cross-fade (no rotation anywhere, so no mirror risk).
// UI-only: click/flip state stays in the caller.
// ---------------------------------------------------------------------------
function FlipCard3D({ flipped, onFlip, front, back, frontClass = "", backClass = "" }) {
  const reduced = useReducedMotion();
  if (reduced) {
    return (
      <div className="mx-auto w-full max-w-2xl cursor-pointer select-none" onClick={onFlip}>
        <div className="grid w-full">
          <motion.div className={`${frontClass} ${flipped ? "pointer-events-none" : ""}`} style={{ gridArea: "1 / 1" }} animate={{ opacity: flipped ? 0 : 1 }} transition={{ duration: 0.2 }} aria-hidden={flipped}>{front}</motion.div>
          <motion.div className={`${backClass} ${flipped ? "" : "pointer-events-none"}`} style={{ gridArea: "1 / 1" }} initial={false} animate={{ opacity: flipped ? 1 : 0 }} transition={{ duration: 0.2 }} aria-hidden={!flipped}>{back}</motion.div>
        </div>
      </div>
    );
  }
  return (
    <motion.div
      className="mx-auto w-full max-w-2xl cursor-pointer select-none"
      style={{ perspective: 1600 }}
      onClick={onFlip}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.99 }}
    >
      <motion.div
        className="grid w-full"
        style={{ transformStyle: "preserve-3d" }}
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className={frontClass} style={{ gridArea: "1 / 1", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>{front}</div>
        <div className={backClass} style={{ gridArea: "1 / 1", backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>{back}</div>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// SHARED SM-2 review primitives — used by BOTH flip (StudyView) and gap
// (GapView) so the grading logic, buttons, tokens, and shortcuts stay in ONE
// place. Any future fix here applies to every card-style mode automatically.
// ---------------------------------------------------------------------------
// Grade the whole card once, schedule via SM-2, and advance the queue.
// `resetPatch` is the per-mode pre-next reset (flip → {flipped:false},
// gap → {revealed:false}).
function gradeCard({ id, key, deck, session, setSession, onReview, onRecord, onFinish, mode, resetPatch }) {
  const total = session.total || 1;
  const changes = onReview(id, key);                   // SM-2 → persists, returns new state
  onRecord(deck.id, key);
  const graduated = changes.phase === "review";
  const { queue, counts } = requeue(session.queue, id, graduated, session.reinserts || {});
  const results = { ...session.results, [key]: (session.results?.[key] || 0) + 1 };
  const graduatedCount = session.graduated + (graduated ? 1 : 0);
  if (queue.length === 0) {
    setSession({ ...session, results, queue, reinserts: counts, graduated: graduatedCount, done: true });
    onFinish(deck.id, mode, { again: results.again || 0, hard: results.hard || 0, good: results.good || 0, easy: results.easy || 0, total });
  } else {
    setSession({ ...session, results, reinserts: counts, graduated: graduatedCount, ...resetPatch });
    setTimeout(() => setSession((s) => (s ? { ...s, queue } : s)), 180);
  }
}

// The four SM-2 rating buttons (Again / Hard / Good / Easy). Colors + order come
// ONLY from ratingStyles.js. `prev` drives each button's projected-due hint.
function RatingButtons({ prev, settings, onGrade }) {
  const grades = RATING_ORDER.map((key) => ({ key, label: RATING_META[key].label }));
  return (
    <div>
      <p className="mb-3 text-center text-sm text-slate-500 dark:text-slate-300">How well did you recall this? (SM-2 schedules the next review)</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {grades.map((g) => <button key={g.key} onClick={() => onGrade(g.key)} className={`flex flex-col items-center rounded-xl border px-4 py-3 font-semibold transition hover:opacity-90 active:scale-95 ${softBgClass(g.key)} ${borderClass(g.key)} ${textClass(g.key)}`}><span>{g.label}</span><span className="text-xs font-normal opacity-70">{fmtUntil(projectDue(prev, g.key, settings))}</span></button>)}
      </div>
    </div>
  );
}

function StudyView({ deck, session, setSession, srs, settings, onReview, onRecord, onFinish }) {
  const card = deck.cards.find((c) => c.id === session.queue[0]);
  const total = session.total || 1;
  const pct = Math.round((session.graduated / total) * 100);
  const prev = card ? srs[card.id] : null;
  const grade = (key) => { if (card) gradeCard({ id: card.id, key, deck, session, setSession, onReview, onRecord, onFinish, mode: "flip", resetPatch: { flipped: false } }); };
  // Space: reveal the answer, then advance (graded "Good").
  useSpaceShortcut(() => { if (!session.flipped) setSession({ ...session, flipped: true }); else grade("good"); });
  if (!card) return null;
  return (
    <div className="pb-40">
      <ProgressBar deck={deck} index={session.graduated} total={total} pct={pct} />
      <FlipCard3D
        flipped={session.flipped}
        onFlip={() => setSession({ ...session, flipped: !session.flipped })}
        frontClass="flex h-auto min-h-[14rem] flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl"
        backClass={`flex h-auto min-h-[14rem] flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200 bg-gradient-to-br ${deck.accent} p-8 text-center shadow-xl`}
        front={
          <>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${deck.soft} ${deck.text} dark:text-[#63C4F1]`}>Question</span>
            <p dir="auto" className="h-auto text-xl font-medium leading-relaxed text-slate-900 sm:text-2xl dark:text-slate-50"><Md text={card.q} /></p>
            <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-300"><RotateCcw className="h-3.5 w-3.5" /> Tap to reveal answer</span>
          </>
        }
        back={
          <>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white dark:text-white">Answer</span>
            <p dir="auto" className="h-auto text-lg font-medium leading-relaxed text-white sm:text-xl dark:font-semibold dark:text-white"><Md text={card.a} /></p>
          </>
        }
      />
      <div className="mx-auto mt-5 flex w-full max-w-2xl items-center justify-center text-xs text-slate-400">{session.queue.length} card{session.queue.length === 1 ? "" : "s"} left this round · {session.graduated}/{total} learned</div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-4px_24px_rgba(15,23,42,0.07)] backdrop-blur">
        <div className="mx-auto w-full max-w-2xl">
          {session.flipped
            ? <RatingButtons prev={prev} settings={settings} onGrade={grade} />
            : <p className="py-3 text-center text-sm text-slate-400">Read the question, then tap the card to reveal the answer.</p>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gaps — two-box editor (learning box + derived answer), multi-blank study
// ---------------------------------------------------------------------------
function GapForm({ initial, onCancel, onSave, onBulk }) {
  const [text, setText] = useState(initial.text || "");
  const [importErr, setImportErr] = useState(null);
  const taRef = useRef(null);
  const parsed = parseGaps(text);
  const answer = stripGaps(text);
  const valid = text.trim() && parsed.count > 0;
  function save() { if (!valid) return; onSave({ id: initial.id, text: text.trim() }); }
  // Cmd/Ctrl + Enter saves; double-click still toggles a gap.
  const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); save(); } };
  function handleFile(file) {
    if (!file) return;
    readText(file, (raw) => {
      const gaps = linesToGaps(raw);
      if (gaps.length) onBulk(gaps);
      else { setImportErr("No lines with {{gaps}} found. One sentence per line, e.g. The {{heart}} pumps {{blood}}."); setTimeout(() => setImportErr(null), 5000); }
    });
  }
  // Double-tap / double-click a word to toggle it as a gap.
  function toggleGapAtCursor() {
    const el = taRef.current; if (!el) return;
    const v = el.value;
    let a = el.selectionStart, b = el.selectionEnd;
    if (a === b) { // no selection: expand to the word under the caret
      while (a > 0 && /\S/.test(v[a - 1])) a--;
      while (b < v.length && /\S/.test(v[b])) b++;
    }
    let word = v.slice(a, b);
    if (!word.trim()) return;
    // If already wrapped as {{...}}, unwrap; otherwise wrap.
    const wrapped = word.startsWith("{{") && word.endsWith("}}");
    const next = wrapped ? v.slice(0, a) + word.slice(2, -2) + v.slice(b) : v.slice(0, a) + "{{" + word + "}}" + v.slice(b);
    setText(next);
  }
  return (
    <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-5 shadow-sm">
      <Field label="Learning box" hint="Double-tap a word to make it a gap, or wrap it yourself in double braces: The {{heart}} pumps {{blood}}.">
        <AutoTextarea dir="auto" innerRef={taRef} value={text} onChange={(e) => setText(e.target.value)} onDoubleClick={toggleGapAtCursor} onKeyDown={onKey} minRows={3} placeholder="The answer goes here — double-tap a word to hide it." className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
      </Field>
      <Field label="Answer (full text, no gaps)">
        <div className="min-h-[3rem] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{answer || <span className="text-slate-400">The complete sentence will appear here.</span>}</div>
      </Field>
      <p className="mb-3 text-xs text-slate-400">{parsed.count} gap{parsed.count === 1 ? "" : "s"} detected.</p>
      <div className="flex items-center gap-2">
        <button disabled={!valid} onClick={save} className={`flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow transition active:scale-95 ${valid ? "hover:opacity-90" : "cursor-not-allowed opacity-40"}`}><Save className="h-4 w-4" /> Save gap</button>
        <button onClick={onCancel} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /> Cancel</button>
        <span className="ml-auto hidden text-xs text-slate-400 sm:inline">⌘/Ctrl + Enter to save</span>
      </div>

      {onBulk && (
        <div className="mt-4 border-t border-indigo-200 pt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Or bulk import</p>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600">
            <Upload className="h-4 w-4 shrink-0" /> Upload <span className="font-mono">.txt</span> / <span className="font-mono">.csv</span> — one gap sentence per line
            <input type="file" accept=".txt,.csv,text/plain,text/csv" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {importErr && <p className="mt-1 text-xs font-medium text-rose-500">{importErr}</p>}
        </div>
      )}
    </div>
  );
}
function GapEditorModal({ decks, editor, onClose, onSave, onBulk }) {
  const [deckId, setDeckId] = useState(editor.deckId || decks[0]?.id);
  const isEdit = decks.some((d) => d.gaps.some((g) => g.id === editor.gap.id));
  if (!decks.length) return null;
  return (
    <ModalShell title={isEdit ? "Edit gap" : "Add gap"} onClose={onClose}>
      <Field label="Deck"><select value={deckId} onChange={(e) => setDeckId(e.target.value)} disabled={isEdit} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-500">{decks.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>
      <GapForm initial={editor.gap} onCancel={onClose} onSave={(gap) => onSave(deckId, gap)} onBulk={isEdit ? null : (gaps) => onBulk(deckId, gaps)} />
    </ModalShell>
  );
}
// Cloze study: Reveal → Rate (SM-2), identical flow to StudyView. No typing /
// validation — the whole sentence's gaps reveal together, then the card is
// rated ONCE with the shared RatingButtons.
function GapView({ deck, session, setSession, srs, settings, onReview, onRecord, onFinish }) {
  const total = session.total || 1;
  const card = deck.gaps.find((g) => g.id === session.queue[0]);
  const pct = Math.round((session.graduated / total) * 100);
  const parsed = card ? parseGaps(card.text) : { segments: [], answers: [], count: 0 };
  const prev = card ? srs[card.id] : null;
  const reveal = () => { if (card && !session.revealed) setSession({ ...session, revealed: true }); };
  const grade = (key) => { if (card) gradeCard({ id: card.id, key, deck, session, setSession, onReview, onRecord, onFinish, mode: "gap", resetPatch: { revealed: false } }); };
  // Space: reveal ALL gaps, then advance (graded "Good") — same as flip cards.
  useSpaceShortcut(() => { if (!session.revealed) reveal(); else grade("good"); });
  if (!card) return null;
  return (
    <div className="pb-40">
      <ProgressBar deck={deck} index={session.graduated} total={total} pct={pct} label="Gaps" />
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl dark:border-white/10 dark:bg-white/5">
          <span className={`mb-5 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${deck.soft} ${deck.text} dark:text-[#63C4F1]`}>Fill the gap{parsed.count > 1 ? "s" : ""}</span>
          <p dir="auto" className="text-xl font-medium leading-relaxed text-slate-900 sm:text-2xl dark:text-slate-50">
            {parsed.segments.map((s, i) => {
              if (s.type === "text") return <Md key={i} text={s.value} />;
              // Pre-reveal: neutral placeholder that keeps sentence flow (RTL-safe).
              // Post-reveal: EVERY gap filled at once, tinted with the med-primary
              // accent (readable in dark mode via the lighter primary tint).
              return session.revealed
                ? <span key={i} className="mx-1 rounded-md bg-med-primary-soft px-2 py-0.5 font-bold text-med-primary dark:bg-[#1B98E0]/20 dark:text-[#63C4F1]">{s.answer}</span>
                : <span key={i} className="mx-1 align-middle font-semibold tracking-wide text-med-subtle">[ … ]</span>;
            })}
          </p>
        </div>
        <div className="mx-auto mt-5 flex w-full max-w-2xl items-center justify-center text-xs text-slate-400">{session.queue.length} gap{session.queue.length === 1 ? "" : "s"} left this round · {session.graduated}/{total} mastered</div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-4px_24px_rgba(15,23,42,0.07)] backdrop-blur dark:border-white/10">
        <div className="mx-auto w-full max-w-2xl">
          {session.revealed
            ? <RatingButtons prev={prev} settings={settings} onGrade={grade} />
            : <button onClick={reveal} className={`flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${deck.accent} px-4 py-3 font-semibold text-white shadow-md transition hover:opacity-90 active:scale-95`}><Lightbulb className="h-4 w-4" /> Reveal answer{parsed.count > 1 ? "s" : ""}</button>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------
function QuizView({ deck, session, setSession, onReview, onRecord, onFinish }) {
  const total = session.total || 1;
  const item = session.quiz.find((q) => q.id === session.queue[0]);
  const pct = Math.round((session.graduated / total) * 100);
  const letters = ["A", "B", "C", "D"];
  function choose(opt) {
    if (session.answered || !item) return;
    const correct = opt === item.answer;
    const changes = onReview(item.id, correct ? "good" : "again");   // wrong = Forgot
    onRecord(deck.id, correct);
    setSession({ ...session, selected: opt, answered: true, correct: session.correct + (correct ? 1 : 0), lastGraduated: changes.phase === "review" });
  }
  function next() {
    const { queue, counts } = requeue(session.queue, item.id, !!session.lastGraduated, session.reinserts || {});
    const graduated = session.graduated + (session.lastGraduated ? 1 : 0);
    if (queue.length === 0) { setSession({ ...session, queue, reinserts: counts, graduated, done: true }); onFinish(deck.id, "quiz", { correct: session.correct, total }); }
    else setSession({ ...session, queue, reinserts: counts, graduated, selected: null, answered: false, lastGraduated: false });
  }
  // Space: advance once an option has been chosen.
  useSpaceShortcut(() => { if (session.answered) next(); });
  if (!item) return null;
  return (
    <div>
      <ProgressBar deck={deck} index={session.graduated} total={total} pct={pct} label="Quiz" />
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
          <span className={`mb-4 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${deck.soft} ${deck.text}`}>{session.graduated + 1} of {total}</span>
          <p className="text-xl font-medium leading-relaxed text-slate-900 sm:text-2xl"><Md text={item.q} /></p>
          <div className="mt-6 space-y-3">
            {item.options.map((opt, i) => {
              const isAnswer = opt === item.answer; const isPicked = session.selected === opt;
              let cls = "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40";
              if (session.answered) { if (isAnswer) cls = "border-emerald-300 bg-emerald-50"; else if (isPicked) cls = "border-rose-300 bg-rose-50"; else cls = "border-slate-200 bg-white opacity-60"; }
              return (
                <button key={i} onClick={() => choose(opt)} disabled={session.answered} className={`flex w-full items-start gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition ${cls}`}>
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-500">{letters[i]}</span>
                  <span className="flex-1 text-slate-800"><Md text={opt} /></span>
                  {session.answered && isAnswer && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
                  {session.answered && isPicked && !isAnswer && <XCircle className="h-5 w-5 shrink-0 text-rose-600" />}
                </button>
              );
            })}
          </div>
          {session.answered && <div className="mt-6"><button onClick={next} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white shadow-md transition hover:bg-slate-800 active:scale-95">{session.queue.length <= 1 && session.lastGraduated ? "Finish quiz" : "Next question"}</button></div>}
        </div>
        <div className="mx-auto mt-5 flex w-full max-w-2xl items-center justify-center text-xs text-slate-400">{session.queue.length} question{session.queue.length === 1 ? "" : "s"} left this round · {session.graduated}/{total} mastered</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Images tab — occlusion: solid shapes, draw + MOVE in editor
// ---------------------------------------------------------------------------
// Renders an occlusion image from its Blob asset (assetId). Falls back to a
// legacy base64 `image` if a record hasn't been migrated yet. The object URL is
// created lazily and revoked on unmount by useAsset.
function OcclusionImage({ assetId, image, ...props }) {
  const url = useAsset(assetId);
  const src = url || image || null;
  if (!src) return <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-300"><ImageIcon className="h-6 w-6" /></div>;
  return <img src={src} alt="" {...props} />;
}
function OccRow({ occ, editing, onEdit, onDelete, onStudy }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-14 w-14 overflow-hidden rounded-lg border border-slate-200"><OcclusionImage assetId={occ.assetId} image={occ.image} className="h-14 w-14 object-cover" /></div>
        <div className="min-w-0"><p className="truncate font-medium text-slate-900">{occ.title || "Untitled"}</p><p className="text-xs text-slate-400">{occ.shapes.length} cover {occ.shapes.length === 1 ? "shape" : "shapes"}</p></div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button onClick={() => onStudy([occ])} disabled={occ.shapes.length === 0} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white shadow transition active:scale-95 ${occ.shapes.length === 0 ? "cursor-not-allowed bg-slate-300" : "bg-gradient-to-r from-indigo-500 to-violet-600 hover:opacity-90"}`}><Eye className="h-4 w-4" /> Study</button>
        {editing && <button onClick={() => onEdit(occ)} className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"><Pencil className="h-4 w-4" /></button>}
        {editing && <button onClick={() => onDelete(occ.id)} className="rounded-lg border border-slate-200 p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>}
      </div>
    </div>
  );
}
function OcclusionEditor({ initial, onCancel, onSave }) {
  const [title, setTitle] = useState(initial.title || "");
  const [assetId, setAssetId] = useState(initial.assetId || null);
  const url = useAsset(assetId) || initial.image || null;   // legacy base64 fallback
  // Store a picked File as a Blob in IndexedDB; keep only the returned id.
  const pickImage = (file) => {
    if (!file) return;
    assetRepo.putFile(file).then((id) => {
      const old = assetId;
      setAssetId(id);
      setShapes([]);
      if (old && old !== id) assetRepo.remove(old);          // free the replaced Blob
    });
  };
  const [shapes, setShapes] = useState(initial.shapes || []);
  const [draft, setDraft] = useState(null);
  const areaRef = useRef(null);
  const startRef = useRef(null);
  const moveRef = useRef(null);

  // Works for both mouse and touch (press & hold to draw on mobile).
  const ptXY = (e) => (e.touches && e.touches[0]) ? e.touches[0] : (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e;
  const pos = (e) => { const r = areaRef.current.getBoundingClientRect(); const p = ptXY(e); return { x: Math.min(Math.max((p.clientX - r.left) / r.width, 0), 1), y: Math.min(Math.max((p.clientY - r.top) / r.height, 0), 1) }; };
  function areaDown(e) { if (!url) return; if (e.cancelable) e.preventDefault(); startRef.current = pos(e); setDraft({ ...startRef.current, w: 0, h: 0 }); }
  function shapeDown(e, s) { e.stopPropagation(); const p = pos(e); moveRef.current = { id: s.id, dx: p.x - s.x, dy: p.y - s.y }; }
  function move(e) {
    if (moveRef.current || startRef.current) { if (e.cancelable) e.preventDefault(); }
    if (moveRef.current) { const p = pos(e); const mv = moveRef.current; setShapes((list) => list.map((x) => x.id === mv.id ? { ...x, x: Math.min(Math.max(p.x - mv.dx, 0), 1 - x.w), y: Math.min(Math.max(p.y - mv.dy, 0), 1 - x.h) } : x)); return; }
    if (startRef.current) { const p = pos(e); const s = startRef.current; setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }); }
  }
  function up() {
    if (moveRef.current) { moveRef.current = null; return; }
    if (draft && draft.w > 0.02 && draft.h > 0.02) setShapes((sh) => [...sh, { id: newId(), ...draft }]);
    startRef.current = null; setDraft(null);
  }
  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold tracking-tight text-slate-900">{initial.title ? "Edit image card" : "New image card"}</h2>
      <p className="mb-5 text-sm text-slate-500">Press &amp; hold and drag on the image to draw a cover shape (works on touch). Drag a shape to move it; tap its ✕ to delete.</p>
      <div className="max-w-md">
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Brain lobes diagram" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></Field>
      </div>
      {!url ? (
        <label className="flex max-w-md cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-slate-400 transition hover:border-indigo-300 hover:text-indigo-500"><Upload className="h-8 w-8" /><span className="text-sm font-medium">Tap to upload an image</span><input type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} /></label>
      ) : (
        <div>
          <div
            ref={areaRef}
            onMouseDown={areaDown} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
            onTouchStart={areaDown} onTouchMove={move} onTouchEnd={up} onTouchCancel={up}
            style={{ touchAction: "none" }}
            className="relative inline-block max-w-full cursor-crosshair select-none overflow-hidden rounded-xl border border-slate-200 shadow-sm"
          >
            <img src={url} alt="" draggable={false} className="block max-h-[60vh] max-w-full" />
            {shapes.map((s) => (
              <div key={s.id} onMouseDown={(e) => shapeDown(e, s)} onTouchStart={(e) => shapeDown(e, s)} style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%` }} className="absolute cursor-move touch-none rounded-sm bg-indigo-600 ring-2 ring-white">
                <button onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onClick={() => setShapes((sh) => sh.filter((x) => x.id !== s.id))} className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 text-rose-600 shadow hover:bg-rose-50"><X className="h-3 w-3" /></button>
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/70"><Move className="h-3.5 w-3.5" /></span>
              </div>
            ))}
            {draft && <div style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }} className="absolute rounded-sm border-2 border-dashed border-indigo-500 bg-indigo-400/30" />}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span>{shapes.length} cover {shapes.length === 1 ? "shape" : "shapes"}</span>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50"><Upload className="h-3.5 w-3.5" /> Replace image<input type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} /></label>
            {shapes.length > 0 && <button onClick={() => setShapes([])} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50"><Trash2 className="h-3.5 w-3.5" /> Clear shapes</button>}
          </div>
        </div>
      )}
      <div className="mt-6 flex gap-2">
        <button disabled={!url} onClick={() => onSave({ id: initial.id, title: title.trim() || "Untitled", assetId, ...(assetId ? {} : (initial.image ? { image: initial.image } : {})), shapes, projectId: initial.projectId ?? null })} className={`flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition active:scale-95 ${url ? "hover:opacity-90" : "cursor-not-allowed opacity-40"}`}><Save className="h-4 w-4" /> Save image card</button>
        <button onClick={onCancel} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /> Cancel</button>
      </div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// Mixed Study Room — ONE interleaved queue of DUE items across the SM-2 types
// (flashcards, cloze gaps, MCQs). A thin polymorphic dispatcher renders each
// item by its `type`; ratings flow through the SAME review()/schedule() + sync
// as every other mode. The SM-2 algorithm itself is untouched. (Occlusion image
// boards aren't SM-2-scheduled, so they're studied from their own tab, not here.)
// ---------------------------------------------------------------------------
function MixedProgress({ index, total }) {
  const pct = total ? Math.round((index / total) * 100) : 0;
  return (
    <div className="mx-auto mb-6 w-full max-w-2xl">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-400"><span>Mixed review</span><span>{Math.min(index + 1, total)} / {total}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"><div className="h-full rounded-full bg-med-primary transition-all" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function AllCaughtUp({ onHome }) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-xl dark:border-white/10 dark:bg-white/5">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-med-primary to-[#0f5e8c] text-white shadow-lg"><CheckCircle2 className="h-8 w-8" /></div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">All caught up!</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Nothing is due for review right now. Come back later, or add more questions to study.</p>
        <button onClick={onHome} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-med-primary px-5 py-3 font-semibold text-white shadow-md transition hover:opacity-90 active:scale-95"><ArrowLeft className="h-4 w-4" /> Back to project</button>
      </div>
    </div>
  );
}

function MixedView({ deck, session, setSession, srs, settings, onReview, onRecordFlip, onRecordQuiz, onFinish, onHome }) {
  const total = session.total || 0;
  if (session.caughtUp || total === 0) return <AllCaughtUp onHome={onHome} />;
  const item = session.queue[session.index];
  if (!item) return <AllCaughtUp onHome={onHome} />;
  const prev = srs[item.id];

  // Advance to the next item, or finish. Carries the freshly-updated tallies.
  function step(results, correct) {
    const next = session.index + 1;
    if (next >= session.queue.length) {
      setSession({ ...session, results, correct, index: next, done: true });
      onFinish(deck.id, "mixed", { again: results.again || 0, hard: results.hard || 0, good: results.good || 0, easy: results.easy || 0, total });
    } else {
      setSession({ ...session, results, correct, index: next, flipped: false, revealed: false, selected: null, answered: false });
    }
  }
  // flashcards + gaps: manual SM-2 rating via the shared RatingButtons.
  function rate(key) {
    onReview(item.id, key);
    onRecordFlip(deck.id, key);
    step({ ...session.results, [key]: (session.results[key] || 0) + 1 }, session.correct);
  }
  // quiz: auto-grade (correct → good, wrong → again), same as QuizView.
  const quiz = item.type === "quiz" ? session.quizById[item.id] : null;
  function choose(opt) {
    if (session.answered) return;
    const ok = opt === quiz.answer;
    onReview(item.id, ok ? "good" : "again");
    onRecordQuiz(deck.id, ok);
    setSession({ ...session, selected: opt, answered: true, results: { ...session.results, [ok ? "good" : "again"]: (session.results[ok ? "good" : "again"] || 0) + 1 }, correct: session.correct + (ok ? 1 : 0) });
  }

  const kindLabel = item.type === "flip" ? "Flashcard" : item.type === "gap" ? "Fill the gap" : "Quiz";
  return (
    <div className="pb-40">
      <MixedProgress index={session.index} total={total} />
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl dark:border-white/10 dark:bg-white/5">
          <span className="mb-5 inline-block rounded-full bg-med-primary-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-med-primary dark:bg-[#1B98E0]/20 dark:text-[#63C4F1]">{kindLabel}</span>

          {item.type === "flip" && (() => {
            const card = deck.cards.find((c) => c.id === item.id);
            if (!card) return null;
            return (
              <>
                <p dir="auto" className="text-xl font-medium leading-relaxed text-slate-900 sm:text-2xl dark:text-slate-50"><Md text={card.q} /></p>
                {session.revealed && <p dir="auto" className="mt-4 border-t border-slate-100 pt-4 text-lg leading-relaxed text-med-primary dark:border-white/10 dark:text-[#63C4F1]"><Md text={card.a} /></p>}
              </>
            );
          })()}

          {item.type === "gap" && (() => {
            const gap = deck.gaps.find((g) => g.id === item.id);
            if (!gap) return null;
            const parsed = parseGaps(gap.text);
            return (
              <p dir="auto" className="text-xl font-medium leading-relaxed text-slate-900 sm:text-2xl dark:text-slate-50">
                {parsed.segments.map((s, i) => s.type === "text"
                  ? <Md key={i} text={s.value} />
                  : session.revealed
                    ? <span key={i} className="mx-1 rounded-md bg-med-primary-soft px-2 py-0.5 font-bold text-med-primary dark:bg-[#1B98E0]/20 dark:text-[#63C4F1]">{s.answer}</span>
                    : <span key={i} className="mx-1 align-middle font-semibold text-med-subtle">[ … ]</span>)}
              </p>
            );
          })()}

          {item.type === "quiz" && quiz && (
            <>
              <p dir="auto" className="text-lg font-semibold leading-relaxed text-slate-900 sm:text-xl dark:text-slate-50">{quiz.q}</p>
              <div className="mt-4 space-y-2.5">
                {quiz.options.map((opt, i) => {
                  const chosen = session.selected === opt;
                  const correct = session.answered && opt === quiz.answer;
                  const wrong = session.answered && chosen && opt !== quiz.answer;
                  return (
                    <button key={i} dir="auto" onClick={() => choose(opt)} disabled={session.answered}
                      className={`flex w-full items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm transition ${correct ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15" : wrong ? "border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-500/15" : "border-slate-200 bg-white text-slate-800 hover:border-med-primary dark:border-white/15 dark:bg-white/5 dark:text-slate-200"}`}>
                      <span className="flex-1">{opt}</span>
                      {correct && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                      {wrong && <XCircle className="h-5 w-5 text-rose-500" />}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-4px_24px_rgba(15,23,42,0.07)] backdrop-blur dark:border-white/10">
        <div className="mx-auto w-full max-w-2xl">
          {(item.type === "flip" || item.type === "gap") && (session.revealed
            ? <RatingButtons prev={prev} settings={settings} onGrade={rate} />
            : <button onClick={() => setSession({ ...session, revealed: true, flipped: true })} className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${deck.accent} px-4 py-3 font-semibold text-white shadow-md transition hover:opacity-90 active:scale-95`}><Lightbulb className="h-4 w-4" /> Reveal answer</button>)}
          {item.type === "quiz" && (session.answered
            ? <button onClick={() => step(session.results, session.correct)} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white shadow-md transition hover:bg-slate-800 active:scale-95 dark:bg-white/10">{session.index + 1 >= total ? "Finish" : "Next"}</button>
            : <p className="py-3 text-center text-sm text-slate-400">Choose the correct answer.</p>)}
        </div>
      </div>
    </div>
  );
}

function OcclusionStudy({ cards }) {
  // Anki "Hide All, Guess One": flatten so 1 shape = 1 study card.
  const items = cards.flatMap((card) => card.shapes.map((s) => ({ card, shapeId: s.id })));
  const [index, setIndex] = useState(0);
  const total = items.length;
  if (total === 0) return <p className="mx-auto max-w-3xl rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">No cover shapes to study yet — add some in the image editor.</p>;
  const i = Math.min(index, total - 1);
  const item = items[i];
  return (
    <div>
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-sm"><span className="font-semibold text-slate-700">{item.card.title || "Untitled"}</span><span className="text-slate-400">Card {i + 1} of {total}</span></div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-600 transition-all duration-500" style={{ width: `${Math.round((i / total) * 100)}%` }} /></div>
      </div>
      <OcclusionCard key={i} card={item.card} targetId={item.shapeId} onNext={() => setIndex((n) => Math.min(total - 1, n + 1))} />
      <StudyNav index={i} total={total} onPrev={() => setIndex((n) => Math.max(0, n - 1))} onNext={() => setIndex((n) => Math.min(total - 1, n + 1))} />
    </div>
  );
}
function OcclusionCard({ card, targetId, onNext }) {
  const [revealed, setRevealed] = useState(false);
  // Space: reveal the target, then advance to the next shape-card.
  useSpaceShortcut(() => { if (!revealed) setRevealed(true); else onNext && onNext(); });
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
        <div className="relative inline-block w-full select-none overflow-hidden rounded-xl">
          <OcclusionImage assetId={card.assetId} image={card.image} draggable={false} className="block w-full" />
          {card.shapes.map((s) => {
            const style = { left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%` };
            if (s.id === targetId) {
              // Active target — SOLID, opaque amber (no animation). Revealed → outline marker only.
              return revealed
                ? <div key={s.id} style={style} className="pointer-events-none absolute rounded-sm border-2 border-dashed border-emerald-500" />
                : <button key={s.id} onClick={() => setRevealed(true)} title="Click to reveal this answer" style={style} className="absolute rounded-sm bg-amber-500 ring-2 ring-amber-300 transition hover:bg-amber-600" />;
            }
            // Context shapes — SOLID, opaque indigo so the text stays fully hidden.
            return <div key={s.id} style={style} className="pointer-events-none absolute rounded-sm bg-indigo-600 ring-2 ring-white" />;
          })}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-slate-400">{revealed ? "Answer revealed" : "Guess the highlighted box"}</span>
          <div className="flex gap-2">
            <button onClick={() => setRevealed(false)} disabled={!revealed} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition enabled:hover:bg-slate-50 disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" /> Cover</button>
            <button onClick={() => setRevealed(true)} disabled={revealed} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-1.5 text-sm font-semibold text-white shadow transition enabled:hover:opacity-90 disabled:opacity-50"><Eye className="h-3.5 w-3.5" /> Reveal</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-deck last-progress summary (shown on each deck card)
// ---------------------------------------------------------------------------
function fmtWhen(ts) { return ts ? new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : null; }

// Local date key (YYYY-MM-DD) used by the study-activity tracker.
const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

// ---------------------------------------------------------------------------
// Library  (single tab → Files (folders) → Projects (decks))
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// MasteryRing — compact SVG donut for the project list. The % derives from
// the SAME `progress` press-tallies that fed the (now removed) in-project
// DeckProgress bars: mastery = (good + easy) / total reviews — so the number
// out here can never disagree with what the inside view used to show.
// Never-studied / empty deck → 0% (guarded, never NaN).
// ---------------------------------------------------------------------------
const masteryPct = (p) => {
  const reviews = p?.reviews || 0;
  return reviews ? Math.round((((p.good || 0) + (p.easy || 0)) / reviews) * 100) : 0;
};
function MasteryRing({ pct }) {
  const r = 15.5;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center" role="img" aria-label={`${pct}% mastery`} title={`${pct}% mastery`}>
      <svg viewBox="0 0 40 40" className="h-10 w-10 -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4.5" className="stroke-slate-200 dark:stroke-white/10" />
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4.5" strokeLinecap="round" stroke="#1B98E0" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="absolute text-[9px] font-bold leading-none text-slate-600">{pct}%</span>
    </span>
  );
}

function ProjectCard({ deck, imageCount, srs, prog, onOpen, onRename, onDelete, onPin, onExport, onMove }) {
  const [renaming, setRenaming] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const due = dueCount(deck, srs);
  return (
    <div className={`w-full rounded-2xl border bg-white shadow-sm transition-all duration-300 ease-in-out hover:shadow-md hover:border-med-primary ${deck.pinned ? "border-indigo-200 ring-1 ring-indigo-100" : "border-slate-200"}`}>
      {/* Full-width row: name + description · stats · actions */}
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
        {/* Name + description */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <EditableTitle value={deck.title} onChange={(t) => onRename(deck.id, t)} editing={renaming} onEditingChange={setRenaming} clickToEdit={false} className="truncate font-semibold text-slate-900" />
            {deck.pinned && <Pin className="h-4 w-4 shrink-0 fill-indigo-500 text-indigo-500" />}
          </div>
          {deck.description && <p className="mt-0.5 truncate text-xs text-slate-500">{deck.description}</p>}
        </div>
        {/* Stats */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 sm:shrink-0">
          <MasteryRing pct={masteryPct(prog)} />
          <span className="flex items-center gap-1" title="Flashcards"><Layers className="h-3.5 w-3.5" />{deck.cards.length}</span>
          <span className="flex items-center gap-1" title="Gaps"><AlignLeft className="h-3.5 w-3.5" />{deck.gaps.length}</span>
          <span className="flex items-center gap-1" title="Images"><ImageIcon className="h-3.5 w-3.5" />{imageCount}</span>
          <span className="flex items-center gap-1 text-indigo-500" title="Cards due"><Clock className="h-3.5 w-3.5" />{due} due</span>
        </div>
        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => onOpen(deck.id)} className={`flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${deck.accent} px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:opacity-90 active:scale-95`}><BookOpen className="h-4 w-4" /> Open project</button>
          <Menu items={[
            { label: deck.pinned ? "Unpin" : "Pin to top", icon: deck.pinned ? PinOff : Pin, onClick: () => onPin(deck.id) },
            { label: "Rename Project", icon: Pencil, onClick: () => setRenaming(true) },
            { label: "Move to…", icon: FolderInput, onClick: () => onMove(deck.id) },
            { label: "Export Project", icon: Download, onClick: () => onExport(deck.id) },
            { label: "Delete Project", icon: Trash2, danger: true, onClick: () => setConfirmDel(true) },
          ]} />
        </div>
      </div>
      {confirmDel && (
        <div className="mx-5 mb-4 flex items-center justify-between gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          <span>Delete this project?</span>
          <span className="flex gap-1.5">
            <button onClick={() => onDelete(deck.id)} className="rounded-md bg-rose-600 px-2 py-1 font-semibold text-white hover:bg-rose-700">Delete</button>
            <button onClick={() => setConfirmDel(false)} className="rounded-md border border-rose-200 bg-white px-2 py-1 font-medium text-rose-600 hover:bg-rose-50">Cancel</button>
          </span>
        </div>
      )}
    </div>
  );
}
function LibraryView({ folders, decks, occlusions, srs, progress, onOpen, onCreateProject, onRenameProject, onDeleteProject, onPinProject, onSetFolder, onCreateFolder, onRenameFolder, onSetFolderDesc, onDeleteFolder, onRestoreFolder, onPurgeFolder, onPinFolder, onImportProject }) {
  const dark = useContext(ThemeCtx);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [renameFolderId, setRenameFolderId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null); // folder pending inline delete-confirm
  const [importMsg, setImportMsg] = useState(null);
  const [movingProjectId, setMovingProjectId] = useState(null); // project being moved
  const [moveTarget, setMoveTarget] = useState("");             // chosen folderId ("" = Uncategorized)
  function openMove(deckId) { const d = decks.find((x) => x.id === deckId); setMoveTarget(d?.folderId || ""); setMovingProjectId(deckId); }
  function saveMove() { onSetFolder(movingProjectId, moveTarget || null); setMovingProjectId(null); }
  const exportDeck = (deckId) => { const d = decks.find((x) => x.id === deckId); if (d) exportProject(d, occlusions.filter((o) => o.projectId === deckId)); };
  function handleImport(file) {
    if (!file) return;
    readText(file, (text) => {
      try { const data = JSON.parse(text); const ok = onImportProject(data); setImportMsg(ok ? { ok: true, text: "Project imported." } : { ok: false, text: "Not a valid .medhub project file." }); }
      catch { setImportMsg({ ok: false, text: "Could not read that file (invalid JSON)." }); }
      setTimeout(() => setImportMsg(null), 4000);
    });
  }
  const [query, setQuery] = useState("");
  const [fname, setFname] = useState("");
  const [fdesc, setFdesc] = useState("");
  const [pname, setPname] = useState("");
  const [pdesc, setPdesc] = useState("");
  const [pfolder, setPfolder] = useState("");
  const imgCount = (deckId) => occlusions.filter((o) => o.projectId === deckId).length;

  // Sort: pinned first, then most-recently-opened first.
  const sortItems = (items) => [...items].sort((a, b) => ((b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)) || ((b.lastOpened || 0) - (a.lastOpened || 0)));
  const recency = (folderId) => decks.filter((d) => d.folderId === folderId).reduce((m, d) => Math.max(m, d.lastOpened || 0), 0);
  // ACTIVE library: only non-deleted folders (the "Deleted files" trash is rendered separately).
  const groups = folders
    .filter((f) => !f.deleted)
    .map((folder) => ({ folder, items: decks.filter((d) => d.folderId === folder.id) }))
    .sort((a, b) => ((b.folder.pinned ? 1 : 0) - (a.folder.pinned ? 1 : 0)) || (recency(b.folder.id) - recency(a.folder.id)));

  // TRASH: soft-deleted folders (each with its projects) + any loose/orphaned projects.
  const deletedFolderGroups = folders
    .filter((f) => f.deleted)
    .sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0))
    .map((folder) => ({ folder, items: decks.filter((d) => d.folderId === folder.id) }));
  const looseTrashed = decks.filter((d) => !d.folderId || !folders.some((f) => f.id === d.folderId));
  const trashCount = deletedFolderGroups.length + looseTrashed.length;

  // Live search: match project titles/descriptions; a file whose name matches keeps all its projects.
  const q = query.trim().toLowerCase();
  const matchDeck = (d) => !q || d.title.toLowerCase().includes(q) || (d.description || "").toLowerCase().includes(q);
  const visibleGroups = groups.map((g) => {
    const folderMatch = q && g.folder && g.folder.title.toLowerCase().includes(q);
    const items = q ? (folderMatch ? g.items : g.items.filter(matchDeck)) : g.items;
    return { ...g, items, _hide: q && !folderMatch && items.length === 0 };
  }).filter((g) => !g._hide);

  function submitFolder() { if (!fname.trim()) return; onCreateFolder(fname.trim(), fdesc.trim()); setFname(""); setFdesc(""); setCreatingFolder(false); }
  // open=false → save & close, but stay on the folder view (no auto-navigate).
  function submitProject() { if (!pname.trim()) return; onCreateProject(pname.trim(), pdesc.trim() || "Custom project.", pfolder || null, false); setPname(""); setPdesc(""); setPfolder(""); setCreatingProject(false); }
  // Open the project form pre-selected for a specific file.
  function openProjectForm(folderId) { setPfolder(folderId || ""); setPname(""); setPdesc(""); setCreatingFolder(false); setCreatingProject(true); }
  // Shared styling so the folder "+" button matches the Settings dropdown button.
  const iconBtn = `flex items-center justify-center rounded-lg border p-1.5 transition ${dark ? "border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`;
  const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
          <label title="Import a .medhub project" className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95">
            <FileUp className="h-4 w-4" /> Import project
            <input type="file" accept=".medhub,application/json" className="hidden" onChange={(e) => { handleImport(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <button onClick={() => { setCreatingFolder((v) => !v); setCreatingProject(false); }} className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-600 shadow-sm transition hover:bg-indigo-50 active:scale-95"><FolderPlus className="h-4 w-4" /> New file</button>
      </div>
      {importMsg && <p className={`mb-4 text-sm font-medium ${importMsg.ok ? "text-emerald-600" : "text-rose-500"}`}>{importMsg.text}</p>}

      {/* Search bar */}
      <div className="mb-6">
        <div className={`flex items-center gap-2 rounded-xl border px-3 shadow-sm ${dark ? "border-slate-600 bg-slate-800" : "border-slate-200 bg-white"} focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100`}>
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects by name or description…" className={`w-full bg-transparent py-2.5 text-sm outline-none ${dark ? "text-slate-100" : "text-slate-900"}`} />
          {query && <button onClick={() => setQuery("")} className="shrink-0 rounded-md p-1 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>}
        </div>
      </div>

      {creatingFolder && (
        <div className="mb-6 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-5">
          <Field label="File name"><input value={fname} onChange={(e) => setFname(e.target.value)} placeholder="e.g. Pharmacology" className={inputCls} /></Field>
          <Field label="Description (optional)"><input value={fdesc} onChange={(e) => setFdesc(e.target.value)} placeholder="What's in this file?" className={inputCls} /></Field>
          <div className="flex gap-2">
            <button disabled={!fname.trim()} onClick={submitFolder} className={`flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow transition active:scale-95 ${fname.trim() ? "hover:opacity-90" : "cursor-not-allowed opacity-40"}`}><Plus className="h-4 w-4" /> Create file</button>
            <button onClick={() => setCreatingFolder(false)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /> Cancel</button>
          </div>
        </div>
      )}

      {creatingProject && (
        <div className="mb-6 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-5">
          <Field label="Project name"><input autoFocus value={pname} onChange={(e) => setPname(e.target.value)} placeholder="e.g. Lecture 3: Cranial Nerves" className={inputCls} /></Field>
          <Field label="Description (optional)"><input value={pdesc} onChange={(e) => setPdesc(e.target.value)} placeholder="What's this project about?" className={inputCls} /></Field>
          <div className="flex gap-2">
            <button disabled={!pname.trim()} onClick={submitProject} className={`flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow transition active:scale-95 ${pname.trim() ? "hover:opacity-90" : "cursor-not-allowed opacity-40"}`}><Plus className="h-4 w-4" /> Create project</button>
            <button onClick={() => setCreatingProject(false)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /> Cancel</button>
          </div>
        </div>
      )}

      {q && visibleGroups.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">No projects match “{query}”.</p>}
      {!q && groups.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
          <Layers className="mx-auto h-8 w-8 text-med-primary" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-slate-700">No decks yet — create your first!</p>
          <p className="mt-1 text-sm text-slate-400">Use “New file” above to build flashcards, gap sentences, a quiz, or an image-occlusion board.</p>
        </div>
      )}

      {visibleGroups.map((g) => (
        <Collapsible
          // Files are COLLAPSED by default; a search auto-expands them so matches show.
          key={`${g.folder?.id || "uncat"}-${q ? "search" : "browse"}`}
          defaultOpen={!!q}
          titleNode={<FolderTitle folder={g.folder} onRename={g.folder ? onRenameFolder : null} editing={g.folder ? renameFolderId === g.folder.id : undefined} onEditingChange={g.folder ? ((v) => setRenameFolderId(v ? g.folder.id : null)) : undefined} />}
          subtitle={`${g.items.length} ${g.items.length === 1 ? "project" : "projects"}`}
          right={g.folder ? (
            <>
              <button onClick={() => openProjectForm(g.folder.id)} title="New project in this file" className={iconBtn}><Plus className="h-4 w-4" /></button>
              <Menu items={[
                { label: g.folder.pinned ? "Unpin" : "Pin to top", icon: g.folder.pinned ? PinOff : Pin, onClick: () => onPinFolder(g.folder.id) },
                { label: "Rename Folder", icon: Pencil, onClick: () => setRenameFolderId(g.folder.id) },
              ]} />
              {/* Inline delete confirmation on the row */}
              {confirmDeleteId === g.folder.id ? (
                <span className="flex items-center gap-1.5">
                  <button onClick={() => setConfirmDeleteId(null)} className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${dark ? "border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>Cancel</button>
                  <button onClick={() => { onDeleteFolder(g.folder.id); setConfirmDeleteId(null); }} title="Moves the folder and its projects to Deleted files" className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                </span>
              ) : (
                <button onClick={() => setConfirmDeleteId(g.folder.id)} title="Delete file" className={`flex items-center justify-center rounded-lg border p-1.5 text-slate-400 transition ${dark ? "border-slate-600 bg-slate-800 hover:bg-rose-950 hover:text-rose-400" : "border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-600"}`}><Trash2 className="h-4 w-4" /></button>
              )}
            </>
          ) : null}
        >
          {g.folder && <div className="mb-3"><InlineDesc value={g.folder.description} onSave={(t) => onSetFolderDesc(g.folder.id, t)} placeholder="Add a file description…" /></div>}
          {g.items.length === 0 ? <p className="text-sm text-slate-400">No projects in this file yet. Use the file's “+” button above to add one.</p> : (
            <div className="flex flex-col gap-3">
              {sortItems(g.items).map((deck) => <ProjectCard key={deck.id} deck={deck} imageCount={imgCount(deck.id)} srs={srs} prog={progress[deck.id]} onOpen={onOpen} onRename={onRenameProject} onDelete={onDeleteProject} onPin={onPinProject} onExport={exportDeck} onMove={openMove} />)}
            </div>
          )}
        </Collapsible>
      ))}

      {/* Deleted files (trash) — soft-deleted folders + loose projects, restorable */}
      {trashCount > 0 && (
        <Collapsible
          key="deleted-files"
          defaultOpen={false}
          titleNode={<span className="flex items-center gap-2 font-semibold text-slate-500"><Trash2 className="h-4 w-4" /> Deleted files</span>}
          subtitle={`${trashCount} item${trashCount === 1 ? "" : "s"}`}
        >
          <div className="space-y-4">
            {deletedFolderGroups.map(({ folder, items }) => (
              <div key={folder.id} className="rounded-xl border border-med-lines bg-slate-50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Folder className="h-4 w-4" />{folder.title}<span className="text-xs font-normal text-slate-400">· {items.length} project{items.length === 1 ? "" : "s"}</span></span>
                  <span className="flex items-center gap-1.5">
                    <button onClick={() => onRestoreFolder(folder.id)} className="flex items-center gap-1.5 rounded-lg border border-med-lines bg-white px-3 py-1.5 text-xs font-semibold text-med-text transition hover:bg-[#F7F9FA] hover:shadow-sm"><RotateCcw className="h-3.5 w-3.5" /> Restore</button>
                    <button onClick={(e) => { e.stopPropagation(); onPurgeFolder(folder.id); }} title="Permanently delete this folder and its projects" className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700"><Trash2 className="h-3.5 w-3.5" /> Delete forever</button>
                  </span>
                </div>
                {items.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {sortItems(items).map((deck) => <ProjectCard key={deck.id} deck={deck} imageCount={imgCount(deck.id)} srs={srs} prog={progress[deck.id]} onOpen={onOpen} onRename={onRenameProject} onDelete={onDeleteProject} onPin={onPinProject} onExport={exportDeck} onMove={openMove} />)}
                  </div>
                )}
              </div>
            ))}
            {looseTrashed.length > 0 && (
              <div className="flex flex-col gap-3">
                {sortItems(looseTrashed).map((deck) => <ProjectCard key={deck.id} deck={deck} imageCount={imgCount(deck.id)} srs={srs} prog={progress[deck.id]} onOpen={onOpen} onRename={onRenameProject} onDelete={onDeleteProject} onPin={onPinProject} onExport={exportDeck} onMove={openMove} />)}
              </div>
            )}
          </div>
        </Collapsible>
      )}

      {/* Move project to another file */}
      {movingProjectId && (
        <ModalShell title="Move project to…" onClose={() => setMovingProjectId(null)}>
          <Field label="File">
            <select value={moveTarget} onChange={(e) => setMoveTarget(e.target.value)} className={inputCls}>
              <option value="">Deleted files</option>
              {folders.filter((f) => !f.deleted).map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </Field>
          <div className="mt-2 flex gap-2">
            <button onClick={saveMove} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:opacity-90"><Save className="h-4 w-4" /> Save</button>
            <button onClick={() => setMovingProjectId(null)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /> Cancel</button>
          </div>
        </ModalShell>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project view  (open a project → collapsible sections for each study mode)
// ---------------------------------------------------------------------------
// iOS-style "Edit / Done" toggle for a section header.
function EditToggle({ editing, onToggle }) {
  return editing
    ? <button onClick={onToggle} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"><CheckCircle2 className="h-4 w-4" /> Done</button>
    : <button onClick={onToggle} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"><Pencil className="h-4 w-4" /> Edit</button>;
}
// Static (non-collapsible) section card: header + always-visible content. No chevron.
function Section({ icon: Icon, title, subtitle, accent, action, children }) {
  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <span className="flex min-w-0 items-center gap-3">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${accent} text-white`}><Icon className="h-4 w-4" /></span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-slate-900">{title}</span>
            {subtitle && <span className="block text-xs text-slate-400">{subtitle}</span>}
          </span>
        </span>
        {action && <div className="flex shrink-0 gap-2">{action}</div>}
      </div>
      <div className="border-t border-slate-100 p-5">{children}</div>
    </div>
  );
}
// ---------------------------------------------------------------------------
// Unified Project Dashboard — one screen, four tabs (Study Room + Creation Hub
// merged). Tabs stay MOUNTED and toggle with CSS `hidden` so each tab's form
// draft + edit-mode survive switching away and back. The SM-2 study session is
// root state (App), so it persists independently while you edit.
// ---------------------------------------------------------------------------
const PROJECT_TABS = [
  { key: "flip",   label: "Flashcards",    icon: Layers },
  { key: "gap",    label: "Fill the Gaps", icon: AlignLeft },
  { key: "quiz",   label: "Quiz (MCQs)",   icon: ListChecks },
  { key: "images", label: "Images",        icon: ImageIcon },
];

// Sticky, horizontally-scrollable tab switcher (same nav pattern as the portal:
// LTR scroll, hidden scrollbar, ≥44px targets, no-shrink items).
function StudyLauncher({ label, icon: Icon, accent, count, ready = true, onStudy, disabledHint }) {
  const can = ready && count > 0;
  return (
    <button onClick={onStudy} disabled={!can}
      className={`mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-md transition active:scale-95 ${can ? `bg-gradient-to-r ${accent} hover:opacity-90` : "cursor-not-allowed bg-slate-300 dark:bg-white/10 dark:text-slate-400"}`}>
      <Icon className="h-4 w-4" /> {can ? `Study ${label}` : (disabledHint || "Nothing to study yet")}
    </button>
  );
}

// Friendly, on-brand empty state shown when a tab has no items yet.
function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 py-12 text-center dark:border-white/10 dark:bg-white/5">
      <div className="mb-3 rounded-2xl bg-med-primary-soft p-3 dark:bg-[#1B98E0]/20"><Icon className="h-6 w-6 text-med-primary dark:text-[#63C4F1]" /></div>
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
}
const panelCard = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5";
const listRow = "flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5";

function FlashcardsPanel({ deck, prog, last, adding, onStudy, onSaveCard, onBulkCards, onEditCard, onDeleteCard }) {
  const [editing, setEditing] = useState(false);
  const [formKey, setFormKey] = useState(0);       // bump = reset draft AFTER a save/cancel only
  const reset = () => setFormKey((k) => k + 1);
  return (
    <div className="space-y-5">
      <div className={panelCard}>
        <StudyLauncher label="flashcards" icon={BookOpen} accent={deck.accent} count={deck.cards.length} onStudy={() => onStudy("flip")} disabledHint="Add a card to study" />
      </div>
      {/* Creation form: hidden (not unmounted) when not adding, so a half-typed
          card survives collapsing/reopening the creation hub. */}
      <div className={adding ? "" : "hidden"}>
        <CardForm key={formKey} initial={blankCard()} accent={deck.accent}
          onSave={(card) => { onSaveCard(deck.id, card); reset(); }}
          onBulk={(cards) => { onBulkCards(deck.id, cards); reset(); }}
          onCancel={reset} />
      </div>
      {deck.cards.length === 0
        ? <EmptyState icon={Layers} title="No flashcards yet" hint="Create your first card above — question on the front, answer on the back." />
        : (
          <div>
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{deck.cards.length} card{deck.cards.length === 1 ? "" : "s"}</p><EditToggle editing={editing} onToggle={() => setEditing((v) => !v)} /></div>
            <div className="space-y-2">
              {deck.cards.map((card, i) => (
                <div key={card.id} className={listRow}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-200 text-[11px] font-semibold text-slate-500">{i + 1}</span><p className="truncate text-sm font-medium text-slate-800">{card.q}</p></div>
                    <p className="truncate pl-7 text-xs text-slate-500">{card.a}</p>
                  </div>
                  {editing && (
                    <div className="flex shrink-0 gap-1.5">
                      <button onClick={() => onEditCard(card)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:text-slate-900"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => onDeleteCard(deck.id, card.id)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}

function GapsPanel({ deck, prog, last, adding, onStudy, onSaveGap, onBulkGaps, onEditGap, onDeleteGap }) {
  const [editing, setEditing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const reset = () => setFormKey((k) => k + 1);
  return (
    <div className="space-y-5">
      <div className={panelCard}>
        <StudyLauncher label="the gaps" icon={AlignLeft} accent={deck.accent} count={deck.gaps.length} onStudy={() => onStudy("gap")} disabledHint="Add a gap to study" />
      </div>
      <div className={adding ? "" : "hidden"}>
        <GapForm key={formKey} initial={blankGap()}
          onSave={(gap) => { onSaveGap(deck.id, gap); reset(); }}
          onBulk={(gaps) => { onBulkGaps(deck.id, gaps); reset(); }}
          onCancel={reset} />
      </div>
      {deck.gaps.length === 0
        ? <EmptyState icon={AlignLeft} title="No gaps yet" hint="Type a sentence above and double-tap a word (or wrap it in {{braces}}) to hide it." />
        : (
          <div>
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{deck.gaps.length} gap{deck.gaps.length === 1 ? "" : "s"}</p><EditToggle editing={editing} onToggle={() => setEditing((v) => !v)} /></div>
            <div className="space-y-2">
              {deck.gaps.map((gap) => { const parsed = parseGaps(gap.text); return (
                <div key={gap.id} className={listRow}>
                  <p dir="auto" className="min-w-0 flex-1 text-sm text-slate-700">{parsed.segments.map((s, i) => s.type === "text" ? <span key={i}>{s.value}</span> : <span key={i} className="mx-0.5 rounded bg-med-primary-soft px-1.5 py-0.5 font-semibold text-med-primary dark:bg-[#1B98E0]/20 dark:text-[#63C4F1]">{s.answer}</span>)}</p>
                  {editing && (
                    <div className="flex shrink-0 gap-1.5">
                      <button onClick={() => onEditGap(gap)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:text-slate-900"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => onDeleteGap(deck.id, gap.id)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </div>
              ); })}
            </div>
          </div>
        )}
    </div>
  );
}

// Inline single-MCQ creator (self-resets on save; stays mounted so the draft
// survives tab switches). Bulk CSV import kept alongside.
function McqForm({ accent, onSave, onImportCsv }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);
  const [msg, setMsg] = useState(null);
  const filled = opts.map((o) => o.trim()).filter(Boolean);
  const valid = q.trim() && filled.length >= 2 && opts[correct]?.trim();
  function save() {
    if (!valid) return;
    onSave({ q: q.trim(), options: opts.map((o) => o.trim()).filter(Boolean), answer: opts[correct].trim() });
    setQ(""); setOpts(["", "", "", ""]); setCorrect(0);
  }
  function csv(file) {
    if (!file) return;
    readText(file, (text) => {
      const parsed = csvToMcqs(text);
      if (parsed.length) { onImportCsv(parsed); setMsg({ ok: true, text: `Imported ${parsed.length} question${parsed.length === 1 ? "" : "s"}.` }); }
      else setMsg({ ok: false, text: "No valid rows. Expected: Question, Option A, B, C, D, Correct Answer." });
      setTimeout(() => setMsg(null), 4000);
    });
  }
  return (
    <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 p-5 shadow-sm">
      <Field label="Question"><AutoTextarea dir="auto" value={q} onChange={(e) => setQ(e.target.value)} minRows={2} placeholder="The question to ask." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></Field>
      <p className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Options (tap the circle to mark the correct one)</p>
      <div className="space-y-2">
        {opts.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <button type="button" onClick={() => setCorrect(i)} aria-label={`Mark option ${i + 1} correct`} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${correct === i ? "border-med-primary bg-med-primary text-white" : "border-slate-300 text-transparent"}`}><Check className="h-3 w-3" /></button>
            <input dir="auto" value={o} onChange={(e) => setOpts((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button disabled={!valid} onClick={save} className={`flex items-center gap-1.5 rounded-lg bg-gradient-to-r ${accent} px-4 py-2 text-sm font-semibold text-white shadow transition active:scale-95 ${valid ? "hover:opacity-90" : "cursor-not-allowed opacity-40"}`}><Save className="h-4 w-4" /> Save question</button>
        <label title="Import MCQs from a .csv file" className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"><Upload className="h-4 w-4" /> Import CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { csv(e.target.files?.[0]); e.target.value = ""; }} /></label>
      </div>
      {msg && <p className={`mt-2 text-xs font-medium ${msg.ok ? "text-emerald-600" : "text-rose-500"}`}>{msg.text}</p>}
    </div>
  );
}

function QuizPanel({ deck, prog, last, adding, onStudy, onImportMcqs, onDeleteMcq }) {
  const [editing, setEditing] = useState(false);
  const mcqs = deck.mcqs || [];
  return (
    <div className="space-y-5">
      <div className={panelCard}>
        <StudyLauncher label="quiz" icon={ListChecks} accent={deck.accent} count={mcqs.length} ready={canQuiz(deck)} onStudy={() => onStudy("quiz")} disabledHint="Add a question to start" />
      </div>
      <div className={adding ? "" : "hidden"}>
        <McqForm accent={deck.accent} onSave={(m) => onImportMcqs(deck.id, [m])} onImportCsv={(list) => onImportMcqs(deck.id, list)} />
      </div>
      {mcqs.length === 0
        ? <EmptyState icon={ListChecks} title="No quiz questions yet" hint="Write a question with options above, or bulk-import a CSV." />
        : (
          <div>
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{mcqs.length} question{mcqs.length === 1 ? "" : "s"}</p><EditToggle editing={editing} onToggle={() => setEditing((v) => !v)} /></div>
            <div className="space-y-2">
              {mcqs.map((m, i) => (
                <div key={m.id} className={listRow}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-200 text-[11px] font-semibold text-slate-500">{i + 1}</span><p className="truncate text-sm font-medium text-slate-800">{m.q}</p></div>
                    <p className="truncate pl-7 text-xs text-slate-500">{m.options.length} options · answer: <span className="font-medium text-emerald-600">{m.answer}</span></p>
                  </div>
                  {editing && <button onClick={() => onDeleteMcq(deck.id, m.id)} className="shrink-0 rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}

function ImagesPanel({ deck, occlusions, adding, onStudyImages, onNewImage, onEditImage, onDeleteImage }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="space-y-5">
      <div className={panelCard}>
        <p className="text-sm text-slate-500 dark:text-slate-300">{occlusions.length} image card{occlusions.length === 1 ? "" : "s"} · cover words on a picture, then reveal them one by one.</p>
        <StudyLauncher label="images" icon={Eye} accent={deck.accent} count={occlusions.length} onStudy={() => onStudyImages(occlusions)} disabledHint="Create an image card to study" />
      </div>
      <div className={adding ? "" : "hidden"}>
        <button onClick={onNewImage} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-4 text-sm font-semibold text-med-primary transition hover:border-indigo-300 dark:border-white/10 dark:bg-white/5 dark:text-[#63C4F1]"><Plus className="h-4 w-4" /> New image card</button>
      </div>
      {occlusions.length === 0
        ? <EmptyState icon={ImageIcon} title="No image cards yet" hint="Upload an image and draw boxes over the words you want to hide." />
        : <div className="space-y-3">{occlusions.map((occ) => <OccRow key={occ.id} occ={occ} editing onEdit={onEditImage} onDelete={onDeleteImage} onStudy={onStudyImages} />)}</div>}
    </div>
  );
}

function ProjectView({ deck, occlusions, progress, lastProg, srs, onBack, onRename, onSetDesc, onStudy, onSaveCard, onBulkCards, onEditCard, onDeleteCard, onSaveGap, onBulkGaps, onEditGap, onDeleteGap, onImportMcqs, onDeleteMcq, onNewImage, onEditImage, onDeleteImage, onStudyImages }) {
  const [renaming, setRenaming] = useState(false);
  const [activeTab, setActiveTab] = useState("flip");
  const [isAdding, setIsAdding] = useState(false);   // creation hub open?
  const p = progress[deck.id] || blankProg();
  const counts = { flip: deck.cards?.length || 0, gap: deck.gaps?.length || 0, quiz: (deck.mcqs || []).length, images: occlusions?.length || 0 };
  const totalItems = counts.flip + counts.gap + counts.quiz + counts.images;
  // Due count for the mixed launcher — same isDue() the mixed queue uses, so
  // the number on the launcher always matches the session it starts.
  const sm2Total = counts.flip + counts.gap + counts.quiz;
  const sm2Due = [...(deck.cards || []), ...(deck.gaps || []), ...(deck.mcqs || [])].filter((x) => isDue(srs || {}, x.id)).length;
  // Project-level empty state takes over ONLY when the whole project is empty
  // AND the user hasn't opened the creation hub. Once content exists (or they're
  // adding), the tabbed dashboard + per-tab empty states apply.
  const showProjectEmpty = totalItems === 0 && !isAdding;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 rounded-xl border border-med-lines bg-white px-4 py-2 text-sm font-medium text-med-text shadow-sm transition-all hover:bg-[#F7F9FA] hover:shadow-md active:scale-95"><ArrowLeft className="h-4 w-4" /> Back to files</button>
        {/* Populated only: a sleek "+" that toggles the creation hub
            (draft-safe: forms are hidden, not unmounted). The old "Study Room"
            header button is gone — the launcher card below owns studying. */}
        <div className="flex items-center gap-2">
          {(totalItems > 0 || isAdding) && (
            <button onClick={() => setIsAdding((v) => !v)} aria-pressed={isAdding} title={isAdding ? "Close creation hub" : "Add new question"} className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border shadow-sm transition active:scale-95 ${isAdding ? "border-med-primary bg-med-primary/10 text-med-primary" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-slate-300"}`}><Plus className={`h-5 w-5 transition-transform ${isAdding ? "rotate-45" : ""}`} /></button>
          )}
        </div>
      </div>

      <div className="mb-5 min-w-0">
        <div className="flex items-center gap-2">
          <EditableTitle value={deck.title} onChange={(t) => onRename(deck.id, t)} editing={renaming} onEditingChange={setRenaming} clickToEdit={false} className="text-2xl font-bold tracking-tight text-slate-900" />
          <button onClick={() => setRenaming(true)} title="Rename project" className="rounded-lg border border-slate-200 p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
        </div>
        <div className="mt-1"><InlineDesc value={deck.description} onSave={(t) => onSetDesc(deck.id, t)} placeholder="Add a project description…" /></div>
      </div>

      {showProjectEmpty ? (
        /* Brand-new project: hide mode dropdown, Study, and forms; ONE prominent
           centered action to create the first question. */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 py-16 text-center dark:border-white/10 dark:bg-white/5">
          <div className="mb-4 rounded-2xl bg-med-primary-soft p-4 dark:bg-[#1B98E0]/20"><Layers className="h-7 w-7 text-med-primary dark:text-[#63C4F1]" /></div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">This project is empty</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">Add flashcards, gaps, quiz questions, or an image card to start studying.</p>
          <button onClick={() => setIsAdding(true)} className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-med-primary px-6 py-3 font-semibold text-white shadow-md transition hover:opacity-90 active:scale-95"><Plus className="h-4 w-4" /> Add Questions</button>
        </div>
      ) : (
        <>
          {/* Mixed-study launcher — deliberately NOT auto-started on mount:
              one tap keeps the user in control, never dumps them into an
              empty session, and doubles as the re-start entry point after a
              finished/exited review. */}
          {sm2Total > 0 ? (
            sm2Due > 0 ? (
              <button
                onClick={() => onStudy("mixed")}
                className="mb-5 flex w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-med-primary to-[#1577B0] px-6 py-5 text-left shadow-lg transition hover:opacity-95 active:scale-[0.99]"
              >
                <span>
                  <span className="block text-lg font-bold text-white">{sm2Due} item{sm2Due === 1 ? "" : "s"} due — Start review</span>
                  <span className="mt-0.5 block text-sm text-white/80">Flashcards, gaps &amp; quiz questions, interleaved by SM-2 priority.</span>
                </span>
                <Brain className="h-8 w-8 shrink-0 text-white/90" aria-hidden="true" />
              </button>
            ) : (
              <div className="mb-5 flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-800">All caught up ✅</p>
                  <p className="mt-0.5 text-sm text-slate-500">Nothing is due right now — SM-2 will bring items back when it's time.</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => onStudy("mixed", { all: true })} className="rounded-xl bg-med-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-95">Study anyway</button>
                  <button onClick={() => setIsAdding(true)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">Add items</button>
                </div>
              </div>
            )
          ) : (
            <div className="mb-5 rounded-2xl border border-dashed border-slate-300 px-6 py-4 text-sm text-slate-500">
              This project has image cards only — pick <span className="font-semibold">Images</span> in the Mode menu below to practice them (image boards aren't SM-2-scheduled).
            </div>
          )}

          {/* Mode dropdown — native <select> for keyboard + screen-reader
              behavior. Panels stay MOUNTED and are only CSS-hidden, so drafts
              and edit-modes survive switches. */}
          <div className="mb-4 flex items-center gap-2">
            <label htmlFor="fc-mode-select" className="text-sm font-medium text-slate-600 dark:text-slate-300">Mode:</label>
            <div className="relative">
              <select
                id="fc-mode-select"
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value)}
                className="min-h-[44px] appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-4 pr-10 text-sm font-semibold text-slate-700 shadow-sm outline-none transition focus:border-med-primary focus:ring-2 focus:ring-med-primary/25"
              >
                <option value="flip">Flashcards ({counts.flip})</option>
                <option value="gap">Gaps ({counts.gap})</option>
                <option value="quiz">Quiz ({counts.quiz})</option>
                <option value="images">Images ({counts.images})</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            </div>
          </div>

          <div className={activeTab === "flip" ? "" : "hidden"}>
            <FlashcardsPanel deck={deck} prog={p} last={lastProg[deck.id]?.flip} adding={isAdding} onStudy={onStudy} onSaveCard={onSaveCard} onBulkCards={onBulkCards} onEditCard={onEditCard} onDeleteCard={onDeleteCard} />
          </div>
          <div className={activeTab === "gap" ? "" : "hidden"}>
            <GapsPanel deck={deck} prog={p} last={lastProg[deck.id]?.gap} adding={isAdding} onStudy={onStudy} onSaveGap={onSaveGap} onBulkGaps={onBulkGaps} onEditGap={onEditGap} onDeleteGap={onDeleteGap} />
          </div>
          <div className={activeTab === "quiz" ? "" : "hidden"}>
            <QuizPanel deck={deck} prog={p} last={lastProg[deck.id]?.quiz} adding={isAdding} onStudy={onStudy} onImportMcqs={onImportMcqs} onDeleteMcq={onDeleteMcq} />
          </div>
          <div className={activeTab === "images" ? "" : "hidden"}>
            <ImagesPanel deck={deck} occlusions={occlusions} adding={isAdding} onStudyImages={onStudyImages} onNewImage={onNewImage} onEditImage={onEditImage} onDeleteImage={onDeleteImage} />
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings screen
// ---------------------------------------------------------------------------
function SettingsCard({ icon: Icon, title, subtitle, children }) {
  const dark = useContext(ThemeCtx);
  return (
    <section className={`mb-5 overflow-hidden rounded-2xl border shadow-sm ${dark ? "border-slate-700 bg-slate-800/60" : "border-slate-200 bg-white"}`}>
      <div className={`flex items-center gap-3 border-b px-5 py-4 ${dark ? "border-slate-700" : "border-slate-100"}`}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white"><Icon className="h-4 w-4" /></div>
        <div><h3 className={`font-semibold ${dark ? "text-white" : "text-slate-900"}`}>{title}</h3>{subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}</div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
function SettingRow({ label, hint, children }) {
  const dark = useContext(ThemeCtx);
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 py-2.5 ${dark ? "text-slate-200" : "text-slate-700"}`}>
      <div className="min-w-0"><p className="text-sm font-medium">{label}</p>{hint && <p className="text-xs text-slate-400">{hint}</p>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
function Toggle({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-indigo-600" : "bg-slate-300"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[1.375rem]" : "left-0.5"}`} />
    </button>
  );
}
function NumberBox({ value, onChange, min = 0, suffix }) {
  const dark = useContext(ThemeCtx);
  return (
    <div className="flex items-center gap-1.5">
      <input type="number" min={min} value={value} onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))} className={`w-20 rounded-lg border px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 ${dark ? "border-slate-600 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`} />
      {suffix && <span className="text-xs text-slate-400">{suffix}</span>}
    </div>
  );
}
function AccountField({ icon: Icon, label, type = "text", value, onChange, placeholder, trailing, error }) {
  const dark = useContext(ThemeCtx);
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <div className={`flex items-center gap-2 rounded-lg border px-3 ${error ? "border-rose-300 focus-within:border-rose-400 focus-within:ring-rose-100" : dark ? "border-slate-600 bg-slate-900 focus-within:border-indigo-400 focus-within:ring-indigo-100" : "border-slate-200 bg-white focus-within:border-indigo-400 focus-within:ring-indigo-100"} focus-within:ring-2`}>
        <Icon className={`h-4 w-4 shrink-0 ${error ? "text-rose-400" : "text-slate-400"}`} />
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`w-full bg-transparent py-2 text-sm outline-none ${dark ? "text-slate-100" : "text-slate-900"}`} />
        {trailing}
      </div>
      {error && <span className="mt-1 block text-xs font-medium text-rose-500">{error}</span>}
    </label>
  );
}
// Frontend username-uniqueness placeholder. Replace with a Supabase query, e.g.:
//   const { data } = await supabase.from("profiles").select("id").eq("username", u).maybeSingle();
//   return !!data;  // taken if a row exists
const RESERVED_USERNAMES = ["admin", "root", "medhub", "support", "guest"];
async function isUsernameTaken(u) {
  return RESERVED_USERNAMES.includes(u.trim().toLowerCase());
}
function friendlyAuthError(msg) {
  const m = (msg || "").toLowerCase();
  if (m.includes("already") || m.includes("registered") || m.includes("exists")) return "Email already in use — try logging in instead.";
  if (m.includes("invalid") || m.includes("credential")) return "Invalid email or password.";
  if (m.includes("confirm")) return msg; // "confirm your email" guidance
  if (m.includes("network") || m.includes("fetch")) return "Can't reach the server. Check your connection.";
  return msg || "Something went wrong. Please try again.";
}
function ConnStatus({ conn }) {
  return (
    <div className="mb-3 flex items-center gap-1.5 text-xs font-medium">
      <span className={`h-2 w-2 rounded-full ${conn === "ok" ? "bg-emerald-500" : conn === "fail" ? "bg-rose-500" : "bg-amber-400"}`} />
      <span className="text-slate-400">Supabase: {conn === "ok" ? "Connected" : conn === "fail" ? "Unreachable from here" : "Checking…"}</span>
    </div>
  );
}
function SettingsView({ profile, setProfile, auth, onSignIn, onSignUp, onSignOut, theme, setTheme, settings, setSettings, prefs, setPrefs }) {
  const dark = useContext(ThemeCtx);
  const signedIn = !!auth?.access_token;

  // ----- live connection check -----
  const [conn, setConn] = useState("checking"); // checking | ok | fail
  useEffect(() => { let on = true; sb.ping().then((ok) => on && setConn(ok ? "ok" : "fail")); return () => { on = false; }; }, []);

  // ===== Logged-OUT: dedicated auth card state =====
  const [isSignUp, setIsSignUp] = useState(false); // Log in vs. Sign up toggle
  const [authName, setAuthName] = useState("");    // username (sign up only)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showAuthPw, setShowAuthPw] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authNote, setAuthNote] = useState(null); // non-error guidance (e.g. confirm email)
  const emailValid = isValidEmail(email);
  function switchMode(signUp) { setIsSignUp(signUp); setAuthError(null); setAuthNote(null); }
  // Social OAuth (Google) — redirects to Supabase's authorize endpoint.
  function oauth(provider) {
    setAuthError(null); setAuthNote(null);
    try { sb.signInWithOAuth(provider); }
    catch (e) { setAuthError(friendlyAuthError(e?.message)); }
  }
  async function submitAuth() {
    setAuthError(null); setAuthNote(null);
    if (isSignUp && !authName.trim()) { setAuthError("Enter a username."); return; }
    if (!emailValid) { setAuthError("Enter a valid email address."); return; }
    if (!password) { setAuthError("Enter your password."); return; }
    setAuthBusy(true);
    const res = isSignUp ? await onSignUp(email, password, authName.trim()) : await onSignIn(email, password);
    setAuthBusy(false);
    if (res?.ok) { setEmail(""); setPassword(""); setAuthName(""); }
    else if (res?.needsConfirm) setAuthNote(res.error);
    else setAuthError(friendlyAuthError(res?.error));
  }

  // ===== Logged-IN: profile management state =====
  const [username, setUsername] = useState(profile.username && profile.username !== "Guest" ? profile.username : "");
  const [picture, setPicture] = useState(profile.picture || null);
  const [usernameError, setUsernameError] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  useEffect(() => {
    setUsername(profile.username && profile.username !== "Guest" ? profile.username : "");
    setPicture(profile.picture || null);
  }, [profile.username, profile.picture, signedIn]);
  const accountEmail = auth?.user?.email || profile.email || "";
  const dirty = username.trim() !== (profile.username === "Guest" ? "" : (profile.username || "")) || picture !== (profile.picture || null);
  async function saveProfile() {
    const u = username.trim();
    setUsernameError(null);
    if (!u) { setUsernameError("Username can't be empty."); return; }
    if (u.length < 3) { setUsernameError("Username must be at least 3 characters."); return; }
    setSavingProfile(true);
    // FRONTEND uniqueness check — swap isUsernameTaken() for a Supabase query later.
    const taken = u.toLowerCase() !== (profile.username || "").toLowerCase() && await isUsernameTaken(u);
    setSavingProfile(false);
    if (taken) { setUsernameError("Username already taken."); return; }
    setProfile((p) => ({ ...p, username: u, picture, email: accountEmail }));
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800);
  }

  // ----- Change password (behind a toggle) -----
  const [showPwPanel, setShowPwPanel] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  async function updatePassword() {
    setPwMsg(null);
    if (newPw.length < 6) { setPwMsg({ ok: false, text: "Password must be at least 6 characters." }); return; }
    if (newPw !== confirmPw) { setPwMsg({ ok: false, text: "Passwords don't match." }); return; }
    // Real impl (Supabase): await supabase.auth.updateUser({ password: newPw })
    setProfile((p) => ({ ...p, password: newPw }));
    setNewPw(""); setConfirmPw(""); setShowPwPanel(false);
    setPwMsg({ ok: true, text: "Password updated." }); setTimeout(() => setPwMsg(null), 2500);
  }

  const setStep = (i, v) => setSettings((s) => { const steps = [...(s.learningStepsMin || [1, 10])]; steps[i] = Math.max(1, v); return { ...s, learningStepsMin: steps }; });
  const upd = (k, v) => setSettings((s) => ({ ...s, [k]: v }));
  const themeOpts = [{ key: "light", label: "Light", icon: Sun }, { key: "dark", label: "Dark", icon: Moon }, { key: "system", label: "System", icon: Monitor }];
  const steps = settings.learningStepsMin || [1, 10];

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className={`mb-1 text-2xl font-bold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>Settings</h2>
      <p className="mb-6 text-sm text-slate-400">Account, appearance, and your spaced-repetition algorithm.</p>

      {/* 1a. Logged OUT → Authentication card with Log in / Sign up tabs */}
      {!signedIn ? (
        <SettingsCard icon={LogIn} title={isSignUp ? "Create your account" : "Log in to Med Hub"} subtitle="Sync your library and progress to the cloud.">
          <ConnStatus conn={conn} />

          {/* Tabs */}
          <div className={`mb-4 grid grid-cols-2 gap-1 rounded-xl border p-1 ${dark ? "border-slate-700 bg-slate-900/50" : "border-slate-200 bg-slate-50"}`}>
            <button onClick={() => switchMode(false)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${!isSignUp ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow" : "text-slate-500 hover:text-slate-700"}`}>Log in</button>
            <button onClick={() => switchMode(true)} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${isSignUp ? "bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow" : "text-slate-500 hover:text-slate-700"}`}>Sign up</button>
          </div>

          {/* Social login (OAuth) */}
          <div className="mb-4">
            <button onClick={() => oauth("google")} className={`flex w-full items-center justify-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-semibold shadow-sm transition active:scale-[0.99] ${dark ? "border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
              Continue with Google
            </button>
          </div>

          {/* OR divider */}
          <div className="mb-4 flex items-center gap-3">
            <span className={`h-px flex-1 ${dark ? "bg-slate-700" : "bg-slate-200"}`} />
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">or</span>
            <span className={`h-px flex-1 ${dark ? "bg-slate-700" : "bg-slate-200"}`} />
          </div>

          {isSignUp && <AccountField icon={AtSign} label="Username" value={authName} onChange={(v) => { setAuthName(v); setAuthError(null); }} placeholder="e.g. abdo_med" />}
          <AccountField icon={Mail} label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" error={email && !emailValid ? "Enter a valid email, e.g. name@example.com" : null} />
          <AccountField icon={Lock} label="Password" type={showAuthPw ? "text" : "password"} value={password} onChange={setPassword} placeholder="••••••••"
            trailing={<button onClick={() => setShowAuthPw((s) => !s)} className="shrink-0 text-slate-400 hover:text-slate-600">{showAuthPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>} />

          {authError && <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-rose-500"><XCircle className="h-4 w-4 shrink-0" /> {authError}</p>}
          {authNote && <p className="mb-2 text-sm font-medium text-amber-600">{authNote}</p>}

          <button disabled={authBusy} onClick={submitAuth} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-50">
            {authBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : (isSignUp ? <User className="h-4 w-4" /> : <LogIn className="h-4 w-4" />)} {isSignUp ? "Sign up" : "Log in"}
          </button>
        </SettingsCard>
      ) : (
        /* 1b. Logged IN → Profile management card only */
        <SettingsCard icon={User} title="Account & Profile" subtitle="Manage your photo, username, and password.">
          <ConnStatus conn={conn} />

          {/* Avatar */}
          <div className="mb-4 flex items-center gap-4">
            <div className="relative">
              {picture
                ? <img src={picture} alt="" className="h-16 w-16 rounded-full object-cover ring-2 ring-indigo-200" />
                : <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-2xl font-bold text-white">{(username || accountEmail || "U")[0].toUpperCase()}</div>}
              <label className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-indigo-600 text-white shadow ring-2 ring-white hover:bg-indigo-500" title="Upload photo">
                <Camera className="h-3.5 w-3.5" />
                <input type="file" accept="image/*" className="hidden" onChange={(e) => readImage(e.target.files?.[0], (d) => setPicture(d))} />
              </label>
            </div>
            <div className="min-w-0">
              <p className={`truncate font-semibold ${dark ? "text-white" : "text-slate-900"}`}>{username || "Set a username"}</p>
              <p className="truncate text-xs text-slate-400">{accountEmail}</p>
              {picture && <button onClick={() => setPicture(null)} className="mt-1 text-xs font-medium text-rose-500 hover:underline">Remove photo</button>}
            </div>
          </div>

          <AccountField icon={AtSign} label="Username" value={username} onChange={(v) => { setUsername(v); setUsernameError(null); }} placeholder="e.g. abdo_med" error={usernameError} />

          {/* Read-only email */}
          <label className="mb-3 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Email (read-only)</span>
            <div className={`flex items-center gap-2 rounded-lg border px-3 ${dark ? "border-slate-700 bg-slate-900/60" : "border-slate-200 bg-slate-50"}`}>
              <Mail className="h-4 w-4 shrink-0 text-slate-400" />
              <span className={`flex-1 truncate py-2 text-sm ${dark ? "text-slate-300" : "text-slate-600"}`}>{accountEmail}</span>
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            </div>
          </label>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={saveProfile} disabled={!dirty || savingProfile} className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-md transition active:scale-95 ${dirty && !savingProfile ? "bg-gradient-to-r from-indigo-500 to-violet-600 hover:opacity-90" : "cursor-not-allowed bg-slate-300"}`}>{savingProfile ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save profile</button>
            {savedFlash && <span className="flex items-center gap-1 text-sm font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
            {dirty && !savedFlash && <span className="text-xs text-slate-400">Unsaved changes</span>}
          </div>

          {/* Change password — behind a toggle */}
          <div className={`mt-4 rounded-xl border p-3 ${dark ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-slate-50"}`}>
            <button onClick={() => { setShowPwPanel((v) => !v); setPwMsg(null); }} className="flex w-full items-center justify-between text-sm font-semibold text-slate-600">
              <span className="flex items-center gap-1.5"><Lock className="h-4 w-4" /> Change password</span>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showPwPanel ? "" : "-rotate-90"}`} />
            </button>
            {showPwPanel && (
              <div className="mt-3">
                <AccountField icon={Lock} label="New password" type={showNewPw ? "text" : "password"} value={newPw} onChange={setNewPw} placeholder="At least 6 characters"
                  trailing={<button onClick={() => setShowNewPw((s) => !s)} className="shrink-0 text-slate-400 hover:text-slate-600">{showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>} />
                <AccountField icon={Lock} label="Confirm new password" type={showNewPw ? "text" : "password"} value={confirmPw} onChange={setConfirmPw} placeholder="Re-enter password" />
                <button onClick={updatePassword} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:opacity-90"><CheckCircle2 className="h-4 w-4" /> Update password</button>
              </div>
            )}
            {pwMsg && <p className={`mt-2 text-xs font-medium ${pwMsg.ok ? "text-emerald-600" : "text-rose-500"}`}>{pwMsg.text}</p>}
          </div>
        </SettingsCard>
      )}

      {/* 2. Appearance & Theme */}
      <SettingsCard icon={dark ? Moon : Sun} title="Appearance" subtitle="System syncs with your device theme">
        <div className="grid grid-cols-3 gap-2">
          {themeOpts.map((o) => { const Icon = o.icon; const active = theme === o.key; return (
            <button key={o.key} onClick={() => setTheme(o.key)} className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${active ? "border-indigo-500 bg-indigo-50 text-indigo-700" : dark ? "border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-500" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"}`}>
              <Icon className="h-5 w-5" /> {o.label}
            </button>
          ); })}
        </div>
      </SettingsCard>

      {/* 3. SM-2 Algorithm Customization */}
      <SettingsCard icon={Gauge} title="Spaced Repetition (SM-2)" subtitle="Learning steps run in minutes; after graduation the Ease Factor takes over.">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Learning steps — sub-day (minutes)</p>
        <SettingRow label="Hard / Again step" hint="Shown again after this many minutes when failed."><NumberBox value={steps[0]} onChange={(v) => setStep(0, v)} min={1} suffix="min" /></SettingRow>
        <SettingRow label="Good step" hint="Next short step before graduating to days."><NumberBox value={steps[1] ?? 10} onChange={(v) => setStep(1, v)} min={1} suffix="min" /></SettingRow>

        <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Graduation — base intervals (days)</p>
        <SettingRow label="Good graduating interval" hint="Interval when a card leaves the learning phase."><NumberBox value={settings.graduatingIntervalDays} onChange={(v) => upd("graduatingIntervalDays", Math.max(1, v))} min={1} suffix="days" /></SettingRow>
        <SettingRow label="Easy interval" hint="Interval when answered Easy from learning."><NumberBox value={settings.easyIntervalDays} onChange={(v) => upd("easyIntervalDays", Math.max(1, v))} min={1} suffix="days" /></SettingRow>

        <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Review phase — Ease Factor</p>
        <SettingRow label="Starting ease" hint="Initial multiplier (Anki default 2.5)."><NumberBox value={settings.startingEase} onChange={(v) => upd("startingEase", Math.max(1.3, v))} min={1.3} suffix="×" /></SettingRow>
        <SettingRow label="Easy bonus" hint="Extra multiplier for Easy in review."><NumberBox value={settings.easyBonus} onChange={(v) => upd("easyBonus", Math.max(1, v))} min={1} suffix="×" /></SettingRow>

        <div className={`mt-4 rounded-xl p-3 text-xs leading-relaxed ${dark ? "bg-slate-900 text-slate-300" : "bg-indigo-50 text-slate-600"}`}>
          <span className="font-semibold">How it flows:</span> a new card steps through {steps[0]} min → {steps[1] ?? 10} min, then graduates to {settings.graduatingIntervalDays} day(s). From there each “Good” multiplies by the ease (≈{settings.startingEase}×), so it grows {settings.graduatingIntervalDays} → {Math.round(settings.graduatingIntervalDays * settings.startingEase)} → {Math.round(settings.graduatingIntervalDays * settings.startingEase * settings.startingEase)} days, etc. A “Hard” lapse drops it back into the {steps[0]}-minute step.
          <button onClick={() => setSettings(DEFAULT_SETTINGS)} className="ml-1 mt-2 inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-500 transition hover:bg-white/60"><RefreshCw className="h-3 w-3" /> Reset defaults</button>
        </div>
      </SettingsCard>

      {/* 4. General */}
      <SettingsCard icon={Bell} title="General">
        <SettingRow label="Notifications" hint="Daily review reminders (placeholder)."><Toggle checked={prefs.notifications} onChange={(v) => setPrefs((p) => ({ ...p, notifications: v }))} /></SettingRow>
        <SettingRow label="Sound effects"><Toggle checked={prefs.sound} onChange={(v) => setPrefs((p) => ({ ...p, sound: v }))} /></SettingRow>
        <SettingRow label="Auto-play next card"><Toggle checked={prefs.autoPlay} onChange={(v) => setPrefs((p) => ({ ...p, autoPlay: v }))} /></SettingRow>
        <div className={`mt-2 border-t pt-3 ${dark ? "border-slate-700" : "border-slate-100"}`}>
          <SettingRow label="App version"><span className="text-sm text-slate-400">{APP_VERSION}</span></SettingRow>
          <SettingRow label="About" hint="Med Hub — flashcards, gaps, quizzes & image occlusion."><Info className="h-4 w-4 text-slate-400" /></SettingRow>
        </div>
      </SettingsCard>

      {/* Log out — bottom of settings */}
      <button onClick={onSignOut} disabled={!signedIn} className={`mb-2 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition active:scale-[0.99] ${signedIn ? "border-rose-200 bg-white text-rose-600 hover:bg-rose-50" : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"}`}>
        <LogOut className="h-4 w-4" /> {signedIn ? "Log out" : "Not signed in"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------
function ProgressBar({ deck, index, total, pct, label }) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between text-sm"><span className="font-semibold text-slate-700">{deck.title}{label ? ` · ${label}` : ""}</span><span className="text-slate-400">Card {index + 1} of {total}</span></div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full bg-gradient-to-r ${deck.accent} transition-all duration-500`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
// Free Previous/Next navigation (consistent across Flashcards, Gaps, Quiz).
function StudyNav({ index, total, onPrev, onNext }) {
  const btn = "flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="mx-auto mt-5 flex w-full max-w-2xl items-center justify-between gap-3">
      <button onClick={onPrev} disabled={index === 0} className={btn}><ChevronLeft className="h-4 w-4" /> Previous</button>
      <span className="text-xs text-slate-400">{index + 1} / {total}</span>
      <button onClick={onNext} disabled={index >= total - 1} className={btn}>Next <ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}
function CompleteView({ session, deck, total, onRestart, onHome }) {
  const mode = session.mode;
  // Flip AND gap modes → all four SM-2 ratings (from RATING_ORDER, so it can't
  // go stale). Both now use the shared Reveal→Rate flow. Quiz keeps correct/missed.
  const stats = (mode === "flip" || mode === "gap" || mode === "mixed")
    ? RATING_ORDER.map((r) => ({ label: RATING_META[r].label, value: session.results?.[r] || 0, color: textClass(r), bg: softBgClass(r) }))
    : [{ label: "Correct", value: session.correct, color: "text-emerald-600", bg: "bg-emerald-50" }, { label: "Missed", value: total - session.correct, color: "text-rose-600", bg: "bg-rose-50" }, { label: "Total", value: total, color: "text-slate-700", bg: "bg-slate-50" }];
  const titles = { flip: "Study Complete!", gap: "Gaps Complete!", quiz: "Quiz Complete!", mixed: "Session Complete!" };
  const nouns = { flip: "cards", gap: "gaps", quiz: "questions", mixed: "reviews" };
  return (
    <div className="mx-auto max-w-xl text-center">
      <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-200"><Trophy className="h-8 w-8" /></div>
        <h2 className="text-2xl font-bold text-slate-900">{titles[mode]}</h2>
        <p className="mt-2 text-sm text-slate-500">You finished all {total} {nouns[mode]} in <span className="font-medium text-slate-700">{deck.title}</span>.</p>
        <div className={`mt-7 grid gap-3 ${stats.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>{stats.map((s) => <div key={s.label} className={`rounded-xl ${s.bg} p-4`}><div className={`text-2xl font-bold ${s.color}`}>{s.value}</div><div className="text-xs font-medium text-slate-500">{s.label}</div></div>)}</div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button onClick={onRestart} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3 font-semibold text-white shadow-md transition hover:opacity-90 active:scale-95"><RotateCcw className="h-4 w-4" /> Try again</button>
          <button onClick={onHome} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"><CheckCircle2 className="h-4 w-4" /> Done</button>
        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400"><Sparkles className="h-3.5 w-3.5" /> Reviews scheduled with SM-2 · saved to Progress.</p>
      </div>
    </div>
  );
}

// =============================================================================
// UNIFIED STUDY ROOM ADAPTERS — additive exports ONLY (nothing above changed).
// UnifiedStudyRoom.jsx renders one pane per mode for a single deck, keeping
// all panes MOUNTED (CSS-hidden) so each session survives tab switches.
// The wiring below mirrors the root component's closures 1:1, and everything
// that matters (StudyView/GapView/QuizView SM-2 grading, schedule(), writers'
// outbox enqueue) is the SAME code the module already runs — not a rewrite.
// =============================================================================

// Chrome: the same theme context + palette/dark CSS the module's Shell
// injects, minus Shell's page container (the room owns its own layout).
export function StudyRoomChrome({ children }) {
  const { isDark } = useTheme();
  return (
    <ThemeCtx.Provider value={isDark}>
      <style>{BRAND_CSS}</style>
      <style>{PALETTE_CSS}</style>
      {isDark && <style>{DARK_CSS}</style>}
      <div className={isDark ? "dark text-slate-100" : "text-slate-800"}>{children}</div>
    </ThemeCtx.Provider>
  );
}

// One deck+mode study pane. mode: "flip" | "gap" | "quiz".
// Owns its session state locally, so four panes coexist independently —
// unlike the root component's single-session model.
export function StudyPane({ deckId, mode }) {
  const navigate = useNavigate();
  const { loading, decks, srs, meta, writers } = useMedHubStore();
  const srsSettings = meta.srsSettings || DEFAULT_SETTINGS;
  const progress = meta.progress || {};
  const studyActivity = meta.studyActivity || {};
  const lastProg = meta.lastProg || {};
  const [session, setSession] = useState(null);
  const startedRef = useRef(false);

  const deck = decks.find((d) => d.id === deckId) || null;

  // ---- same wiring as the root component's helpers (fresh closures so the
  // originals stay untouched; identical semantics) ----
  const review = (id, grade) => { const changes = schedule(srs[id], grade, srsSettings); writers.patchCard(id, changes); return changes; };
  const dueOf = (id) => srs[id]?.dueDate ?? srs[id]?.due ?? 0;
  const sortByDue = (items) => [...items].sort((a, b) => dueOf(a.id) - dueOf(b.id));
  const bump = (dId, fn) => { const cur = progress[dId] || blankProg(); writers.setMeta("progress", { ...progress, [dId]: { ...cur, ...fn(cur), lastStudied: Date.now() } }); };
  const bumpActivity = () => { const k = dayKey(new Date()); writers.setMeta("studyActivity", { ...studyActivity, [k]: (studyActivity[k] || 0) + 1 }); };
  const recordFlip = (id, grade) => { bump(id, (c) => ({ [grade]: (c[grade] || 0) + 1, reviews: c.reviews + 1 })); bumpActivity(); };
  const recordQuiz = (id, ok) => { bump(id, (c) => ({ quizTotal: c.quizTotal + 1, quizCorrect: c.quizCorrect + (ok ? 1 : 0) })); bumpActivity(); };
  const recordLast = (dId, m, summary) => writers.setMeta("lastProg", { ...lastProg, [dId]: { ...(lastProg[dId] || {}), [m]: { ...summary, when: Date.now() } } });

  function start() {
    const base = { deckId, mode, done: false, reinserts: {} };
    if (mode === "flip") {
      const cards = sortByDue(deck.cards);
      setSession({ ...base, flipped: false, results: { again: 0, hard: 0, good: 0, easy: 0 }, cards, queue: cards.map((c) => c.id), total: cards.length, graduated: 0 });
    } else if (mode === "gap") {
      const cards = sortByDue(deck.gaps);
      setSession({ ...base, revealed: false, typed: [], correct: 0, cards, queue: cards.map((c) => c.id), total: cards.length, graduated: 0 });
    } else {
      const quiz = [...buildQuiz(deck)].sort((a, b) => dueOf(a.id) - dueOf(b.id));
      setSession({ ...base, selected: null, answered: false, correct: 0, quiz, queue: quiz.map((q) => q.id), total: quiz.length, graduated: 0 });
    }
  }

  // Start exactly once when the deck is available. NEVER restarts on tab
  // switches — the pane stays mounted, so the session (card 7/20, answers,
  // reveals) persists until the room itself unmounts.
  useEffect(() => {
    if (loading || !deck || startedRef.current) return;
    startedRef.current = true;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, deck]);

  if (loading || !deck || !session) return null;

  const total = mode === "quiz" ? session.quiz.length : session.cards.length;
  if (session.done) {
    return <CompleteView session={session} deck={deck} total={total} onRestart={start} onHome={() => navigate("/flashcards")} />;
  }
  if (mode === "flip") return <StudyView deck={deck} session={session} setSession={setSession} srs={srs} settings={srsSettings} onReview={review} onRecord={recordFlip} onFinish={recordLast} />;
  if (mode === "gap") return <GapView deck={deck} session={session} setSession={setSession} srs={srs} settings={srsSettings} onReview={review} onRecord={recordFlip} onFinish={recordLast} />;
  return <QuizView deck={deck} session={session} setSession={setSession} onReview={review} onRecord={recordQuiz} onFinish={recordLast} />;
}

// Image-occlusion pane: same flatten-and-study component the module uses,
// fed the deck's boards (its index state lives inside and survives hiding).
export function OcclusionPane({ deckId }) {
  const { loading, occlusions } = useMedHubStore();
  if (loading) return null;
  const cards = occlusions.filter((o) => o.projectId === deckId && (o.shapes?.length || 0) > 0);
  if (!cards.length) return null;
  return <OcclusionStudy cards={cards} />;
}
