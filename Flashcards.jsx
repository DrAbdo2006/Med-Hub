import { useState, useRef, useEffect, createContext, useContext } from "react";
import {
  BookOpen,
  Brain,
  HeartPulse,
  ArrowLeft,
  RotateCcw,
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
const INITIAL_FOLDERS = [
  { id: "fa", title: "Anatomy", iconKey: "brain" },
  { id: "fp", title: "Physiology", iconKey: "heart" },
];
const INITIAL_DECKS = [
  {
    id: "an1", folderId: "fa", title: "Lecture 1: Neuroanatomy",
    description: "Cranial nerves, hemispheres, and cortical lobes.",
    iconKey: "brain", accent: "from-med-primary to-med-primary", soft: "bg-med-primary-soft", text: "text-med-primary",
    cards: [
      { id: "a1", q: "Which cranial nerve is responsible for the sense of smell?", a: "The olfactory nerve (CN I). It carries sensory information for smell from the nasal epithelium to the olfactory bulb.", image: null },
      { id: "a2", q: "What structure connects the two cerebral hemispheres?", a: "The corpus callosum — a thick band of ~200 million myelinated axons enabling interhemispheric communication.", image: null },
      { id: "a3", q: "Name the four lobes of the cerebral cortex.", a: "Frontal, parietal, temporal, and occipital lobes. (The insula is sometimes considered a fifth, hidden lobe.)", image: null },
    ],
    gaps: [
      { id: "ag1", text: "The {{olfactory}} nerve (CN {{I}}) carries the sense of smell." },
      { id: "ag2", text: "The {{corpus callosum}} connects the two cerebral hemispheres." },
      { id: "ag3", text: "The four cortical lobes are {{frontal}}, {{parietal}}, {{temporal}}, and {{occipital}}." },
    ],
  },
  {
    id: "an2", folderId: "fa", title: "Lecture 2: Brainstem & Limbic System",
    description: "Vital centers and memory structures.",
    iconKey: "brain", accent: "from-med-primary to-med-primary", soft: "bg-med-primary-soft", text: "text-med-primary",
    cards: [
      { id: "a4", q: "Which part of the brainstem regulates basic vital functions like breathing and heart rate?", a: "The medulla oblongata. It houses the cardiac, respiratory, and vasomotor centers controlling autonomic function.", image: null },
      { id: "a5", q: "What is the functional role of the hippocampus?", a: "The hippocampus is essential for forming new declarative (explicit) memories and for spatial navigation.", image: null },
    ],
    gaps: [
      { id: "ag4", text: "The {{medulla oblongata}} regulates breathing and heart rate." },
      { id: "ag5", text: "The {{hippocampus}} is essential for forming new declarative memories." },
    ],
  },
  {
    id: "ph1", folderId: "fp", title: "Lecture 1: Membranes & Hormones",
    description: "Resting potentials and glucose control.",
    iconKey: "heart", accent: "from-med-primary to-med-primary", soft: "bg-med-primary-soft", text: "text-med-primary",
    cards: [
      { id: "p1", q: "What is the normal resting membrane potential of a typical neuron?", a: "Approximately −70 mV, maintained largely by the Na⁺/K⁺-ATPase pump and selective K⁺ permeability.", image: null },
      { id: "p2", q: "Which hormone lowers blood glucose, and where is it produced?", a: "Insulin, produced by the beta cells of the pancreatic islets of Langerhans. It promotes cellular glucose uptake.", image: null },
      { id: "p3", q: "Define cardiac output and give its formula.", a: "Cardiac output = Heart Rate × Stroke Volume. It is the volume of blood pumped by the heart per minute (~5 L/min at rest).", image: null },
    ],
    gaps: [
      { id: "pg1", text: "A typical neuron's resting membrane potential is about {{-70}} mV." },
      { id: "pg2", text: "{{Insulin}} is produced by pancreatic {{beta}} cells and lowers blood glucose." },
      { id: "pg3", text: "Cardiac output = {{heart rate}} × {{stroke volume}}." },
    ],
  },
  {
    id: "ph2", folderId: "fp", title: "Lecture 2: Respiration & Renal",
    description: "Gas exchange and the nephron.",
    iconKey: "heart", accent: "from-med-primary to-med-primary", soft: "bg-med-primary-soft", text: "text-med-primary",
    cards: [
      { id: "p4", q: "What drives oxygen exchange in the alveoli?", a: "Simple diffusion down a partial-pressure gradient — O₂ moves from high alveolar PO₂ into pulmonary capillary blood.", image: null },
      { id: "p5", q: "Which part of the nephron is the primary site of water and solute reabsorption?", a: "The proximal convoluted tubule (PCT), which reabsorbs roughly 65% of filtered Na⁺, water, and most glucose and amino acids.", image: null },
    ],
    gaps: [
      { id: "pg4", text: "Oxygen crosses the alveolar membrane by simple {{diffusion}}." },
      { id: "pg5", text: "The {{proximal convoluted tubule}} reabsorbs ~65% of filtered sodium and water." },
    ],
  },
];

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
// Persistence — saves all decks, gaps, image cards, progress & SM-2 schedule
// so the last progress of each project is restored on the next visit.
// (Wrapped in try/catch: degrades gracefully where storage is unavailable.)
// ---------------------------------------------------------------------------
const STORAGE_KEY = "medhub-state-v1";
function loadSaved() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function saveState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------------------
// Supabase — browser uses the PUBLISHABLE key only (safe to ship with RLS on).
// Dependency-free client over the Auth + REST endpoints so the single file
// runs anywhere; all calls are guarded and the app still works offline.
// SECURITY: never put the secret key here. Enable RLS + policies (SQL below).
// ---------------------------------------------------------------------------
const SUPABASE_URL = "https://nmsvxkcqrodnyrkoooje.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_OLdnNzvHFPFmexXrYxtrGw_ke9uRqNe";
const SESSION_KEY = "medhub-session";
const loadSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
const saveSession = (s) => { try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch {} };

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || "").trim());

const sb = {
  // Lightweight connectivity check against the project's Auth endpoint.
  async ping() {
    try { const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } }); return r.ok; }
    catch { return false; }
  },
  async authPost(path, body) {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error_description || data.msg || data.message || "Authentication failed");
    return data;
  },
  signUp: (email, password) => sb.authPost("signup", { email, password }),
  signIn: (email, password) => sb.authPost("token?grant_type=password", { email, password }),
  // OAuth (Google). With supabase-js this would be:
  //   supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } })
  // Here we redirect the browser to the project's authorize endpoint (same flow).
  signInWithOAuth(provider) {
    if (typeof window === "undefined") return;
    const redirectTo = encodeURIComponent(window.location.origin);
    window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${redirectTo}`;
  },
  async loadState(token, uid) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/app_state?user_id=eq.${uid}&select=data`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return rows?.[0]?.data ?? null;
  },
  async saveCloud(token, uid, data) {
    await fetch(`${SUPABASE_URL}/rest/v1/app_state?on_conflict=user_id`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: uid, data, updated_at: new Date().toISOString() }),
    });
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
const blankOcc = (deckId = null) => ({ id: newId(), title: "", image: null, shapes: [], deckId });
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
const DEFAULT_SETTINGS = {
  learningStepsMin: [1, 10],   // sub-day steps in MINUTES ([Hard/Again, Good, ...])
  graduatingIntervalDays: 1,   // "Good" graduation interval (days)
  easyIntervalDays: 4,         // "Easy" graduation interval (days)
  startingEase: 2.5,           // initial Ease Factor
  easyBonus: 1.3,              // extra multiplier when answering "Easy" in review
  minEase: 1.3,                // ease never drops below this
};

function schedule(prev, grade, s = DEFAULT_SETTINGS) {
  const steps = s.learningStepsMin?.length ? s.learningStepsMin : [1, 10];
  const lastStep = steps.length - 1;
  const now = Date.now();
  const st = prev || { phase: "learning", step: 0, ease: s.startingEase, interval: 0, reps: 0 };

  // ----- LEARNING phase: minute-based steps -----
  if (st.phase === "learning") {
    if (grade === "easy") {
      const interval = Math.max(1, s.easyIntervalDays);
      return { phase: "review", step: 0, ease: s.startingEase, interval, reps: (st.reps || 0) + 1, due: now + interval * DAY };
    }
    if (grade === "good") {
      const next = (st.step || 0) + 1;
      if (next <= lastStep) return { phase: "learning", step: next, ease: st.ease || s.startingEase, interval: 0, reps: st.reps || 0, due: now + steps[next] * MIN };
      const interval = Math.max(1, s.graduatingIntervalDays); // graduate
      return { phase: "review", step: 0, ease: s.startingEase, interval, reps: (st.reps || 0) + 1, due: now + interval * DAY };
    }
    // "hard" / again -> restart at first step
    return { phase: "learning", step: 0, ease: st.ease || s.startingEase, interval: 0, reps: st.reps || 0, due: now + steps[0] * MIN };
  }

  // ----- REVIEW phase: Ease Factor multiplier (classic SM-2) -----
  let ease = st.ease || s.startingEase;
  if (grade === "hard") {
    // lapse: drop ease and send the card back into the minute-based steps
    ease = Math.max(s.minEase, ease - 0.2);
    return { phase: "learning", step: 0, ease, interval: st.interval || 0, reps: 0, due: now + steps[0] * MIN };
  }
  if (grade === "easy") {
    ease = ease + 0.15;
    const interval = Math.max(1, Math.round((st.interval || 1) * ease * s.easyBonus));
    return { phase: "review", step: 0, ease, interval, reps: (st.reps || 0) + 1, due: now + interval * DAY };
  }
  // "good": interval *= ease
  const interval = Math.max(1, Math.round((st.interval || 1) * ease));
  return { phase: "review", step: 0, ease, interval, reps: (st.reps || 0) + 1, due: now + interval * DAY };
}
// Preview the next interval for a grade without committing it.
const projectDue = (prev, grade, s) => schedule(prev, grade, s).due;
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
const isDue = (srs, id) => !srs[id] || srs[id].due <= Date.now();
const dueCount = (deck, srs) => [...deck.cards, ...deck.gaps].filter((x) => isDue(srs, x.id)).length;

const DEFAULT_PROFILE = { username: "Guest", email: "", picture: null, password: "", loggedIn: false };
const DEFAULT_PREFS = { notifications: true, sound: false, autoPlay: false };
const APP_VERSION = "1.0.0";

const blankProg = () => ({ easy: 0, good: 0, hard: 0, reviews: 0, gapCorrect: 0, gapTotal: 0, quizCorrect: 0, quizTotal: 0, lastStudied: null });

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
  const saved = loadSaved();
  const [folders, setFolders] = useState(saved?.folders || INITIAL_FOLDERS);
  const [decks, setDecks] = useState(saved?.decks || INITIAL_DECKS);
  const [occlusions, setOcclusions] = useState(saved?.occlusions || []);
  const [progress, setProgress] = useState(saved?.progress || {}); // all-time cumulative
  const [lastProg, setLastProg] = useState(saved?.lastProg || {}); // most recent session per mode
  const [srs, setSrs] = useState(saved?.srs || {});
  const [studyActivity, setStudyActivity] = useState(saved?.studyActivity || {}); // { 'YYYY-MM-DD': reviewCount }
  const [openProjectId, setOpenProjectId] = useState(null); // currently opened project (deck)
  const [session, setSession] = useState(null);
  const [editor, setEditor] = useState(null); // card add/edit
  const [gapEditor, setGapEditor] = useState(null); // gap add/edit
  const [occEditor, setOccEditor] = useState(null);
  const [occStudy, setOccStudy] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // drives the top-edge progress bar
  // Demo: hide the loading bar shortly after mount. Wire this to real
  // transitions/fetches later (e.g. setIsLoading(true) before a sync, false after).
  useEffect(() => { const t = setTimeout(() => setIsLoading(false), 1400); return () => clearTimeout(t); }, []);

  // ---- settings / account / appearance state ----
  const [srsSettings, setSrsSettings] = useState(saved?.srsSettings || DEFAULT_SETTINGS);
  const [theme, setTheme] = useState(saved?.theme || "system"); // light | dark | system
  const [profile, setProfile] = useState(saved?.profile || DEFAULT_PROFILE);
  const [prefs, setPrefs] = useState(saved?.prefs || DEFAULT_PREFS);
  const [auth, setAuth] = useState(loadSession()); // Supabase session { access_token, user }
  const [systemDark, setSystemDark] = useState(() => typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)").matches : false);
  // One-time welcome toast (per session)
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

  // Keep "System Default" in sync with the OS theme.
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setSystemDark(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  const dark = theme === "dark" || (theme === "system" && systemDark);

  const snapshot = () => ({ folders, decks, occlusions, progress, lastProg, srs, srsSettings, theme, profile, prefs, studyActivity });

  // Persist locally whenever anything changes
  useEffect(() => { saveState(snapshot()); }, [folders, decks, occlusions, progress, lastProg, srs, srsSettings, theme, profile, prefs, studyActivity]);

  // Cloud sync: when signed in, debounce-push the snapshot to Supabase
  useEffect(() => {
    if (!auth?.access_token) return;
    const t = setTimeout(() => { sb.saveCloud(auth.access_token, auth.user.id, snapshot()).catch(() => {}); }, 1200);
    return () => clearTimeout(t);
  }, [auth, folders, decks, occlusions, progress, lastProg, srs, srsSettings, theme, profile, prefs, studyActivity]);

  // Apply a snapshot pulled from the cloud into local state
  function applyRemote(d) {
    if (!d) return;
    if (d.folders) setFolders(d.folders);
    if (d.decks) setDecks(d.decks);
    if (d.occlusions) setOcclusions(d.occlusions);
    if (d.progress) setProgress(d.progress);
    if (d.lastProg) setLastProg(d.lastProg);
    if (d.srs) setSrs(d.srs);
    if (d.srsSettings) setSrsSettings(d.srsSettings);
    if (d.theme) setTheme(d.theme);
    if (d.prefs) setPrefs(d.prefs);
    if (d.studyActivity) setStudyActivity(d.studyActivity);
    if (d.profile) setProfile((p) => ({ ...d.profile, loggedIn: true }));
  }

  // ---- Supabase auth (browser, publishable key) ----
  async function finishAuth(data, fallbackEmail, username) {
    const token = data.access_token || data.session?.access_token;
    const user = data.user || data.session?.user || data;
    if (!token) return { ok: false, needsConfirm: true, error: "Account created — confirm your email, then log in." };
    const session = { access_token: token, refresh_token: data.refresh_token, user: { id: user.id, email: user.email || fallbackEmail } };
    setAuth(session); saveSession(session);
    const emailLocal = (session.user.email || "").split("@")[0];
    const name = (username && username.trim()) || (profile.username && profile.username !== "Guest" ? profile.username : emailLocal);
    setProfile((p) => ({ ...p, email: session.user.email, username: name || p.username, loggedIn: true }));
    try {
      const remote = await sb.loadState(token, session.user.id);
      if (remote) applyRemote(remote); else await sb.saveCloud(token, session.user.id, snapshot());
    } catch {}
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
  function signOut() { setAuth(null); saveSession(null); setProfile((p) => ({ ...p, loggedIn: false })); }

  // On load: if already authenticated, pull the latest cloud snapshot AND welcome once.
  useEffect(() => {
    if (!auth?.access_token) return;
    const emailLocal = (auth.user?.email || "").split("@")[0];
    showWelcome(profile.username && profile.username !== "Guest" ? profile.username : emailLocal);
    sb.loadState(auth.access_token, auth.user.id).then((d) => { if (d) applyRemote(d); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deckOf = (id) => decks.find((d) => d.id === id) || null;
  // grade is "hard" | "good" | "easy" — scheduled with the user's custom settings
  const review = (id, grade) => setSrs((prev) => ({ ...prev, [id]: schedule(prev[id], grade, srsSettings) }));
  // snapshot of the just-finished session, kept per deck per mode
  const recordLast = (deckId, mode, summary) => setLastProg((prev) => ({ ...prev, [deckId]: { ...(prev[deckId] || {}), [mode]: { ...summary, when: Date.now() } } }));
  const sortByDue = (items) => [...items].sort((a, b) => (srs[a.id]?.due || 0) - (srs[b.id]?.due || 0));

  // progress
  const bump = (deckId, changes) => setProgress((prev) => { const cur = prev[deckId] || blankProg(); return { ...prev, [deckId]: { ...cur, ...changes(cur), lastStudied: Date.now() } }; });
  // Heatmap: count one study event per review on today's date.
  const bumpActivity = () => setStudyActivity((a) => { const k = dayKey(new Date()); return { ...a, [k]: (a[k] || 0) + 1 }; });
  const recordFlip = (id, grade) => { bump(id, (c) => ({ [grade]: c[grade] + 1, reviews: c.reviews + 1 })); bumpActivity(); };
  const recordGap = (id, ok) => { bump(id, (c) => ({ gapTotal: c.gapTotal + 1, gapCorrect: c.gapCorrect + (ok ? 1 : 0) })); bumpActivity(); };
  const recordQuiz = (id, ok) => { bump(id, (c) => ({ quizTotal: c.quizTotal + 1, quizCorrect: c.quizCorrect + (ok ? 1 : 0) })); bumpActivity(); };

  // sessions (SM-2 ordered: most-overdue first)
  function startSession(deckId, mode) {
    const deck = deckOf(deckId);
    const base = { deckId, mode, index: 0, done: false };
    if (mode === "flip") setSession({ ...base, flipped: false, results: { hard: 0, good: 0, easy: 0 }, cards: sortByDue(deck.cards) });
    else if (mode === "gap") setSession({ ...base, revealed: false, typed: [], correct: 0, cards: sortByDue(deck.gaps) });
    else if (mode === "quiz") setSession({ ...base, selected: null, answered: false, correct: 0, quiz: [...buildQuiz(deck)].sort((a, b) => (srs[a.id]?.due || 0) - (srs[b.id]?.due || 0)) });
  }
  const endSession = () => setSession(null);

  // folder mutations
  function createFolder(title, description = "") {
    const folder = { id: newId(), title, description, iconKey: "book" };
    setFolders((p) => [...p, folder]);
  }
  const renameFolder = (folderId, title) => setFolders((p) => p.map((f) => (f.id === folderId ? { ...f, title } : f)));
  const setFolderDesc = (folderId, description) => setFolders((p) => p.map((f) => (f.id === folderId ? { ...f, description } : f)));
  const setDeckDesc = (deckId, description) => setDecks((p) => p.map((d) => (d.id === deckId ? { ...d, description } : d)));
  // Soft delete: flag the folder as deleted (with its projects) so it moves to
  // the "Deleted files" trash instead of being erased. Reversible via restore.
  function deleteFolder(folderId) {
    setFolders((p) => p.map((f) => (f.id === folderId ? { ...f, deleted: true, deletedAt: Date.now() } : f)));
    if (openProjectId && decks.some((d) => d.id === openProjectId && d.folderId === folderId)) setOpenProjectId(null);
  }
  // Restore a soft-deleted folder back to the active library.
  function restoreFolder(folderId) {
    setFolders((p) => p.map((f) => (f.id === folderId ? { ...f, deleted: false, deletedAt: undefined } : f)));
  }
  // Permanently remove a folder from the trash AND every project inside it
  // (plus their image occlusions and saved progress). Irreversible.
  function purgeFolder(folderId) {
    const victimIds = decks.filter((d) => d.folderId === folderId).map((d) => d.id);
    const n = victimIds.length;
    const ok = typeof window === "undefined" || window.confirm(
      `Permanently delete this folder?` +
      (n ? `\n\n${n} project${n === 1 ? "" : "s"} will be permanently deleted. This cannot be undone.` : "\n\nThis cannot be undone.")
    );
    if (!ok) return;
    const victims = new Set(victimIds);
    setFolders((p) => p.filter((f) => f.id !== folderId));
    setDecks((p) => p.filter((d) => d.folderId !== folderId));
    setOcclusions((p) => p.filter((o) => !victims.has(o.deckId)));
    setProgress((p) => { const x = { ...p }; victimIds.forEach((id) => delete x[id]); return x; });
    setLastProg((p) => { const x = { ...p }; victimIds.forEach((id) => delete x[id]); return x; });
    if (victims.has(openProjectId)) setOpenProjectId(null);
  }

  // deck (project) / card / gap mutations
  function createDeck(title, description, folderId = null, open = true) {
    const palette = ACCENTS[decks.length % ACCENTS.length];
    const deck = { id: newId(), folderId, title, description, iconKey: "folder", ...palette, cards: [], gaps: [], pinned: false, lastOpened: Date.now() };
    setDecks((p) => [...p, deck]);
    if (open) setOpenProjectId(deck.id);
  }
  // Import a .medhub project: new IDs everywhere to avoid conflicts, then append.
  function importProjectData(data) {
    const src = data?.deck || data;
    if (!src || (!Array.isArray(src.cards) && !Array.isArray(src.gaps))) return false;
    const palette = ACCENTS[decks.length % ACCENTS.length];
    const deckId = newId();
    const deck = {
      id: deckId, folderId: null,
      title: (src.title || "Imported project"),
      description: src.description || "",
      iconKey: src.iconKey || "folder",
      accent: src.accent || palette.accent, soft: src.soft || palette.soft, text: src.text || palette.text,
      cards: (src.cards || []).map((c) => ({ ...c, id: newId() })),
      gaps: (src.gaps || []).map((g) => ({ ...g, id: newId() })),
      mcqs: (src.mcqs || []).map((m) => ({ ...m, id: newId() })),
      pinned: false, lastOpened: Date.now(),
    };
    const occ = (data?.occlusions || []).map((o) => ({ ...o, id: newId(), deckId }));
    setDecks((p) => [...p, deck]);
    if (occ.length) setOcclusions((p) => [...p, ...occ]);
    return true;
  }
  // Opening a project stamps it as most-recently-opened (so it sorts first).
  const openProjectById = (deckId) => { setDecks((p) => p.map((d) => (d.id === deckId ? { ...d, lastOpened: Date.now() } : d))); setOpenProjectId(deckId); };
  const togglePinDeck = (deckId) => setDecks((p) => p.map((d) => (d.id === deckId ? { ...d, pinned: !d.pinned } : d)));
  const togglePinFolder = (folderId) => setFolders((p) => p.map((f) => (f.id === folderId ? { ...f, pinned: !f.pinned } : f)));
  const renameDeck = (deckId, title) => setDecks((p) => p.map((d) => (d.id === deckId ? { ...d, title } : d)));
  const setDeckFolder = (deckId, folderId) => setDecks((p) => p.map((d) => (d.id === deckId ? { ...d, folderId: folderId || null } : d)));
  const deleteDeck = (deckId) => { setDecks((p) => p.filter((d) => d.id !== deckId)); setOcclusions((p) => p.filter((o) => o.deckId !== deckId)); setOpenProjectId(null); };
  const upsertCard = (deckId, card) => setDecks((prev) => prev.map((d) => d.id !== deckId ? d : { ...d, cards: d.cards.some((c) => c.id === card.id) ? d.cards.map((c) => (c.id === card.id ? card : c)) : [...d.cards, card] }));
  const deleteCard = (deckId, cardId) => setDecks((prev) => prev.map((d) => (d.id === deckId ? { ...d, cards: d.cards.filter((c) => c.id !== cardId) } : d)));
  const addCards = (deckId, cards) => setDecks((prev) => prev.map((d) => (d.id === deckId ? { ...d, cards: [...d.cards, ...cards] } : d)));
  const addGaps = (deckId, gaps) => setDecks((prev) => prev.map((d) => (d.id === deckId ? { ...d, gaps: [...d.gaps, ...gaps] } : d)));
  const upsertGap = (deckId, gap) => setDecks((prev) => prev.map((d) => d.id !== deckId ? d : { ...d, gaps: d.gaps.some((g) => g.id === gap.id) ? d.gaps.map((g) => (g.id === gap.id ? gap : g)) : [...d.gaps, gap] }));
  const deleteGap = (deckId, gapId) => setDecks((prev) => prev.map((d) => (d.id === deckId ? { ...d, gaps: d.gaps.filter((g) => g.id !== gapId) } : d)));
  // Bulk-imported MCQs (from CSV). Guard: only accept well-formed MCQs
  // (a question + a non-empty options array + a defined answer) so nothing
  // malformed can land in the Quiz section.
  const importMcqs = (deckId, mcqs) => {
    const valid = (mcqs || []).filter((m) => m && m.q && Array.isArray(m.options) && m.options.length >= 2 && m.answer != null);
    if (!valid.length) return;
    setDecks((prev) => prev.map((d) => (d.id === deckId ? { ...d, mcqs: [...(d.mcqs || []), ...valid] } : d)));
  };
  const deleteMcq = (deckId, mcqId) => setDecks((prev) => prev.map((d) => (d.id === deckId ? { ...d, mcqs: (d.mcqs || []).filter((m) => m.id !== mcqId) } : d)));

  function saveOcc(occ) { setOcclusions((prev) => (prev.some((o) => o.id === occ.id) ? prev.map((o) => (o.id === occ.id ? occ : o)) : [...prev, occ])); setOccEditor(null); }
  const deleteOcc = (id) => setOcclusions((prev) => prev.filter((o) => o.id !== id));

  // ---- full-screen flows ----
  const wrap = (node) => <ThemeCtx.Provider value={dark}><TopProgressBar loading={isLoading} />{node}<Toast text={toast} /></ThemeCtx.Provider>;

  if (showSettings) return wrap(<Shell><Header inStudy onBack={() => setShowSettings(false)} backLabel="Back" /><SettingsView profile={profile} setProfile={setProfile} auth={auth} onSignIn={signIn} onSignUp={signUp} onSignOut={signOut} theme={theme} setTheme={setTheme} settings={srsSettings} setSettings={setSrsSettings} prefs={prefs} setPrefs={setPrefs} /></Shell>);

  if (session) {
    const deck = deckOf(session.deckId);
    const total = session.mode === "quiz" ? session.quiz.length : session.cards.length;
    return wrap(
      <Shell>
        {/* Focus Study Mode: minimal top bar (Exit + progress only) */}
        <Header inStudy minimal onBack={endSession} backLabel="Exit" />
        {session.done ? <CompleteView session={session} deck={deck} total={total} onRestart={() => startSession(session.deckId, session.mode)} onHome={endSession} />
          : session.mode === "flip" ? <StudyView deck={deck} session={session} setSession={setSession} srs={srs} settings={srsSettings} onReview={review} onRecord={recordFlip} onFinish={recordLast} />
          : session.mode === "gap" ? <GapView deck={deck} session={session} setSession={setSession} onReview={review} onRecord={recordGap} onFinish={recordLast} />
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
          deck={openProject} occlusions={occlusions.filter((o) => o.deckId === openProject.id)}
          progress={progress} lastProg={lastProg}
          onBack={() => setOpenProjectId(null)} onRename={renameDeck} onSetDesc={setDeckDesc}
          onStudy={(mode) => startSession(openProject.id, mode)}
          onAddCard={() => setEditor({ deckId: openProject.id, card: blankCard() })} onEditCard={(card) => setEditor({ deckId: openProject.id, card })} onDeleteCard={deleteCard}
          onAddGap={() => setGapEditor({ deckId: openProject.id, gap: blankGap() })} onEditGap={(gap) => setGapEditor({ deckId: openProject.id, gap })} onDeleteGap={deleteGap}
          onImportMcqs={importMcqs} onDeleteMcq={deleteMcq}
          onNewImage={() => setOccEditor(blankOcc(openProject.id))} onEditImage={(o) => setOccEditor(o)} onDeleteImage={deleteOcc} onStudyImages={(cards) => setOccStudy({ cards })}
        />
      ) : (
        <LibraryView
          folders={folders} decks={decks} occlusions={occlusions} srs={srs}
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
.bg-med-primary-soft{ background-color:#E8F4FC; }   /* primary tint for soft chips/badges */
.bg-med-accent-soft{ background-color:#FCE9ED; }    /* accent tint for warnings */
.text-med-primary{ color:var(--med-primary); }
.text-med-accent{ color:var(--med-accent); }
.text-med-text{ color:var(--med-text); }
.text-med-muted{ color:#7c7f87; }                   /* secondary body text */
.text-med-subtle{ color:#9aa0a8; }                  /* tertiary / placeholder */
.border-med-lines{ border-color:var(--med-lines); }
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
.dark .bg-slate-50 { background-color:#0f172a !important; }
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
    <div className={`min-h-screen w-full font-sans ${dark ? "dark bg-gradient-to-br from-slate-950 via-slate-900 to-slate-900 text-slate-100" : "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800"}`}>
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
      <Field label="Question"><AutoTextarea value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} minRows={2} placeholder="What do you want to be asked?" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></Field>
      <Field label="Answer"><AutoTextarea value={a} onChange={(e) => setA(e.target.value)} onKeyDown={onKey} minRows={3} placeholder="The full answer shown when the card is flipped." className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" /></Field>

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
function StudyView({ deck, session, setSession, srs, settings, onReview, onRecord, onFinish }) {
  const cards = session.cards;
  const card = cards[session.index];
  const total = cards.length;
  const pct = Math.round((session.index / total) * 100);
  const prev = srs[card.id];
  const grades = [
    { key: "hard", label: "Hard", btn: "bg-rose-100 hover:bg-rose-200 text-rose-700 border-rose-200" },           // accent red
    { key: "good", label: "Good", btn: "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200" },        // neutral grey
    { key: "easy", label: "Easy", btn: "bg-sky-100 hover:bg-sky-200 text-sky-700 border-sky-200" },               // primary blue
  ];
  function grade(g) {
    onReview(card.id, g.key);
    onRecord(deck.id, g.key);
    const results = { ...session.results, [g.key]: session.results[g.key] + 1 };
    const next = session.index + 1;
    if (next >= total) { setSession({ ...session, results, done: true }); onFinish(deck.id, "flip", { easy: results.easy, good: results.good, hard: results.hard, total }); }
    else { setSession({ ...session, results, flipped: false }); setTimeout(() => setSession((s) => (s ? { ...s, index: next } : s)), 180); }
  }
  // Space: reveal the answer, then advance to the next card (graded "Good").
  useSpaceShortcut(() => { if (!session.flipped) setSession({ ...session, flipped: true }); else grade(grades[1]); });
  return (
    <div className="pb-40">
      <ProgressBar deck={deck} index={session.index} total={total} pct={pct} />
      <div className="mx-auto w-full max-w-2xl cursor-pointer select-none" style={{ perspective: "1600px" }} onClick={() => setSession({ ...session, flipped: !session.flipped })}>
        <div className="grid w-full transition-transform duration-500" style={{ transformStyle: "preserve-3d", transform: session.flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}>
          <div className="flex h-auto min-h-[14rem] flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl" style={{ gridArea: "1 / 1", backfaceVisibility: "hidden" }}>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${deck.soft} ${deck.text}`}>Question</span>
            <p className="h-auto text-xl font-medium leading-relaxed text-slate-900 sm:text-2xl"><Md text={card.q} /></p>
            <span className="flex items-center gap-1.5 text-xs text-slate-400"><RotateCcw className="h-3.5 w-3.5" /> Tap to reveal answer</span>
          </div>
          <div className={`flex h-auto min-h-[14rem] flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200 bg-gradient-to-br ${deck.accent} p-8 text-center shadow-xl`} style={{ gridArea: "1 / 1", backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
            <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">Answer</span>
            <p className="h-auto text-lg font-medium leading-relaxed text-white sm:text-xl"><Md text={card.a} /></p>
          </div>
        </div>
      </div>
      <StudyNav index={session.index} total={total} onPrev={() => setSession({ ...session, index: session.index - 1, flipped: false })} onNext={() => setSession({ ...session, index: session.index + 1, flipped: false })} />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-4px_24px_rgba(15,23,42,0.07)] backdrop-blur">
        <div className="mx-auto w-full max-w-2xl">
          {session.flipped ? (
            <div>
              <p className="mb-3 text-center text-sm text-slate-500">How well did you recall this? (SM-2 schedules the next review)</p>
              <div className="grid grid-cols-3 gap-3">
                {grades.map((g) => <button key={g.key} onClick={() => grade(g)} className={`flex flex-col items-center rounded-xl border px-4 py-3 font-semibold transition active:scale-95 ${g.btn}`}><span>{g.label}</span><span className="text-xs font-normal opacity-70">{fmtUntil(projectDue(prev, g.key, settings))}</span></button>)}
              </div>
            </div>
          ) : <p className="py-3 text-center text-sm text-slate-400">Read the question, then tap the card to reveal the answer.</p>}
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
        <AutoTextarea innerRef={taRef} value={text} onChange={(e) => setText(e.target.value)} onDoubleClick={toggleGapAtCursor} onKeyDown={onKey} minRows={3} placeholder="The answer goes here — double-tap a word to hide it." className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
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
function GapView({ deck, session, setSession, onReview, onRecord, onFinish }) {
  const gaps = session.cards;
  const card = gaps[session.index];
  const total = gaps.length;
  const pct = Math.round((session.index / total) * 100);
  const parsed = parseGaps(card.text);
  const typed = session.typed || [];
  const results = parsed.answers.map((ans, i) => normalize(typed[i]) === normalize(ans));
  const allCorrect = results.every(Boolean);
  const numCorrect = results.filter(Boolean).length;
  function setTyped(i, val) { const arr = [...typed]; arr[i] = val; setSession({ ...session, typed: arr }); }
  function reveal() { if (session.revealed) return; onReview(card.id, allCorrect ? "good" : "hard"); onRecord(deck.id, allCorrect); setSession({ ...session, revealed: true, correct: session.correct + (allCorrect ? 1 : 0) }); }
  function next() { const n = session.index + 1; if (n >= total) { setSession({ ...session, done: true }); onFinish(deck.id, "gap", { correct: session.correct, total }); } else setSession({ ...session, index: n, revealed: false, typed: [] }); }
  // Space: reveal answers, then advance (skipped while typing in a blank).
  useSpaceShortcut(() => { if (!session.revealed) reveal(); else next(); });
  return (
    <div>
      <ProgressBar deck={deck} index={session.index} total={total} pct={pct} label="Gaps" />
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
          <span className={`mb-5 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${deck.soft} ${deck.text}`}>Fill the gap{parsed.count > 1 ? "s" : ""}</span>
          <p className="text-xl font-medium leading-relaxed text-slate-900 sm:text-2xl">
            {parsed.segments.map((s, i) => {
              if (s.type === "text") return <Md key={i} text={s.value} />;
              if (!session.revealed) return <input key={i} value={typed[s.bi] || ""} onChange={(e) => setTyped(s.bi, e.target.value)} onKeyDown={(e) => e.key === "Enter" && reveal()} className="mx-1 inline-block w-32 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-base align-middle outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="…" />;
              return <span key={i} className={`mx-1 rounded-md px-2 py-0.5 font-bold ${results[s.bi] ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{s.answer}</span>;
            })}
          </p>
          <div className="mt-6">
            {session.revealed && <div className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${allCorrect ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{allCorrect ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}{allCorrect ? "All correct!" : `${numCorrect} / ${parsed.count} correct — answers shown above.`}</div>}
            {!session.revealed ? <button onClick={reveal} className={`flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${deck.accent} px-4 py-3 font-semibold text-white shadow-md transition hover:opacity-90 active:scale-95`}><Lightbulb className="h-4 w-4" /> Reveal answer{parsed.count > 1 ? "s" : ""}</button>
              : <button onClick={next} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white shadow-md transition hover:bg-slate-800 active:scale-95">{session.index + 1 >= total ? "Finish" : "Next gap"}</button>}
          </div>
        </div>
        <StudyNav index={session.index} total={total} onPrev={() => setSession({ ...session, index: session.index - 1, revealed: false, typed: [] })} onNext={() => setSession({ ...session, index: session.index + 1, revealed: false, typed: [] })} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------
function QuizView({ deck, session, setSession, onReview, onRecord, onFinish }) {
  const items = session.quiz;
  const item = items[session.index];
  const total = items.length;
  const pct = Math.round((session.index / total) * 100);
  const letters = ["A", "B", "C", "D"];
  function choose(opt) { if (session.answered) return; const correct = opt === item.answer; onReview(item.id, correct ? "good" : "hard"); onRecord(deck.id, correct); setSession({ ...session, selected: opt, answered: true, correct: session.correct + (correct ? 1 : 0) }); }
  function next() { const n = session.index + 1; if (n >= total) { setSession({ ...session, done: true }); onFinish(deck.id, "quiz", { correct: session.correct, total }); } else setSession({ ...session, index: n, selected: null, answered: false }); }
  // Space: advance once an option has been chosen.
  useSpaceShortcut(() => { if (session.answered) next(); });
  return (
    <div>
      <ProgressBar deck={deck} index={session.index} total={total} pct={pct} label="Quiz" />
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
          <span className={`mb-4 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${deck.soft} ${deck.text}`}>Question {session.index + 1}</span>
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
          {session.answered && <div className="mt-6"><button onClick={next} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white shadow-md transition hover:bg-slate-800 active:scale-95">{session.index + 1 >= total ? "Finish quiz" : "Next question"}</button></div>}
        </div>
        <StudyNav index={session.index} total={total} onPrev={() => setSession({ ...session, index: session.index - 1, selected: null, answered: false })} onNext={() => setSession({ ...session, index: session.index + 1, selected: null, answered: false })} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Images tab — occlusion: solid shapes, draw + MOVE in editor
// ---------------------------------------------------------------------------
function OccRow({ occ, editing, onEdit, onDelete, onStudy }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        {occ.image ? <img src={occ.image} alt="" className="h-14 w-14 rounded-lg border border-slate-200 object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-slate-300"><ImageIcon className="h-6 w-6" /></div>}
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
  const [image, setImage] = useState(initial.image || null);
  const [shapes, setShapes] = useState(initial.shapes || []);
  const [draft, setDraft] = useState(null);
  const areaRef = useRef(null);
  const startRef = useRef(null);
  const moveRef = useRef(null);

  // Works for both mouse and touch (press & hold to draw on mobile).
  const ptXY = (e) => (e.touches && e.touches[0]) ? e.touches[0] : (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : e;
  const pos = (e) => { const r = areaRef.current.getBoundingClientRect(); const p = ptXY(e); return { x: Math.min(Math.max((p.clientX - r.left) / r.width, 0), 1), y: Math.min(Math.max((p.clientY - r.top) / r.height, 0), 1) }; };
  function areaDown(e) { if (!image) return; if (e.cancelable) e.preventDefault(); startRef.current = pos(e); setDraft({ ...startRef.current, w: 0, h: 0 }); }
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
      {!image ? (
        <label className="flex max-w-md cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-10 text-slate-400 transition hover:border-indigo-300 hover:text-indigo-500"><Upload className="h-8 w-8" /><span className="text-sm font-medium">Tap to upload an image</span><input type="file" accept="image/*" className="hidden" onChange={(e) => readImage(e.target.files?.[0], (d) => { setImage(d); setShapes([]); })} /></label>
      ) : (
        <div>
          <div
            ref={areaRef}
            onMouseDown={areaDown} onMouseMove={move} onMouseUp={up} onMouseLeave={up}
            onTouchStart={areaDown} onTouchMove={move} onTouchEnd={up} onTouchCancel={up}
            style={{ touchAction: "none" }}
            className="relative inline-block max-w-full cursor-crosshair select-none overflow-hidden rounded-xl border border-slate-200 shadow-sm"
          >
            <img src={image} alt="" draggable={false} className="block max-h-[60vh] max-w-full" />
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
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50"><Upload className="h-3.5 w-3.5" /> Replace image<input type="file" accept="image/*" className="hidden" onChange={(e) => readImage(e.target.files?.[0], (d) => { setImage(d); setShapes([]); })} /></label>
            {shapes.length > 0 && <button onClick={() => setShapes([])} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-50"><Trash2 className="h-3.5 w-3.5" /> Clear shapes</button>}
          </div>
        </div>
      )}
      <div className="mt-6 flex gap-2">
        <button disabled={!image} onClick={() => onSave({ id: initial.id, title: title.trim() || "Untitled", image, shapes, deckId: initial.deckId ?? null })} className={`flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition active:scale-95 ${image ? "hover:opacity-90" : "cursor-not-allowed opacity-40"}`}><Save className="h-4 w-4" /> Save image card</button>
        <button onClick={onCancel} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /> Cancel</button>
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
          <img src={card.image} alt="" draggable={false} className="block w-full" />
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

// Single accuracy row (correct / total) with a progress bar.
function AccRow({ heading, correct, total, when }) {
  const pct = total ? Math.round((correct / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
        <span className="font-medium">{heading}{total ? ` · ${correct}/${total} (${pct}%)` : ""}</span>
        <span className="text-slate-400">{total ? (when ? fmtWhen(when) : "") : "no data"}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-600" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
// All-time + last-session accuracy (used in Gaps & Quiz tabs).
function TwoAcc({ label, allCorrect, allTotal, last }) {
  return (
    <div className="mb-4 space-y-2.5 rounded-lg bg-slate-50 p-3">
      <AccRow heading={`All ${label.toLowerCase()} accuracy`} correct={allCorrect} total={allTotal} />
      <AccRow heading="Last session" correct={last?.correct || 0} total={last?.total || 0} when={last?.when} />
    </div>
  );
}

// Single Easy/Good/Hard mix row.
function MixRow({ heading, easy, good, hard, meta }) {
  const tot = easy + good + hard;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
        <span className="font-medium">{heading}</span>
        <span className="flex items-center gap-1.5">{tot ? <><span className="font-semibold text-med-primary">{easy}E</span><span className="font-semibold text-med-text">{good}G</span><span className="font-semibold text-med-accent">{hard}H</span></> : <span className="text-slate-400">{meta}</span>}</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="bg-med-primary" style={{ width: `${(easy / (tot || 1)) * 100}%` }} />
        <div className="bg-med-text" style={{ width: `${(good / (tot || 1)) * 100}%` }} />
        <div className="bg-med-accent" style={{ width: `${(hard / (tot || 1)) * 100}%` }} />
      </div>
    </div>
  );
}
// All-time + last-session recall mix (Decks tab).
function DeckProgress({ all, last }) {
  return (
    <div className="mt-3 space-y-2.5 rounded-lg bg-slate-50 p-3">
      <MixRow heading={`All progress${all.reviews ? ` · ${all.reviews} reviews` : ""}`} easy={all.easy} good={all.good} hard={all.hard} meta="not studied" />
      <MixRow heading={`Last session${last?.when ? ` · ${fmtWhen(last.when)}` : ""}`} easy={last?.easy || 0} good={last?.good || 0} hard={last?.hard || 0} meta="no data" />
    </div>
  );
}

// Local date key (YYYY-MM-DD) used by the study-activity tracker.
const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

// ---------------------------------------------------------------------------
// Library  (single tab → Files (folders) → Projects (decks))
// ---------------------------------------------------------------------------
function ProjectCard({ deck, imageCount, srs, onOpen, onRename, onDelete, onPin, onExport, onMove }) {
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
function LibraryView({ folders, decks, occlusions, srs, onOpen, onCreateProject, onRenameProject, onDeleteProject, onPinProject, onSetFolder, onCreateFolder, onRenameFolder, onSetFolderDesc, onDeleteFolder, onRestoreFolder, onPurgeFolder, onPinFolder, onImportProject }) {
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
  const exportDeck = (deckId) => { const d = decks.find((x) => x.id === deckId); if (d) exportProject(d, occlusions.filter((o) => o.deckId === deckId)); };
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
  const imgCount = (deckId) => occlusions.filter((o) => o.deckId === deckId).length;

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
      {!q && groups.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">No files yet. Use “New file” to create one.</p>}

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
              {sortItems(g.items).map((deck) => <ProjectCard key={deck.id} deck={deck} imageCount={imgCount(deck.id)} srs={srs} onOpen={onOpen} onRename={onRenameProject} onDelete={onDeleteProject} onPin={onPinProject} onExport={exportDeck} onMove={openMove} />)}
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
                    <button onClick={() => onPurgeFolder(folder.id)} title="Permanently delete this folder and its projects" className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700"><Trash2 className="h-3.5 w-3.5" /> Delete forever</button>
                  </span>
                </div>
                {items.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {sortItems(items).map((deck) => <ProjectCard key={deck.id} deck={deck} imageCount={imgCount(deck.id)} srs={srs} onOpen={onOpen} onRename={onRenameProject} onDelete={onDeleteProject} onPin={onPinProject} onExport={exportDeck} onMove={openMove} />)}
                  </div>
                )}
              </div>
            ))}
            {looseTrashed.length > 0 && (
              <div className="flex flex-col gap-3">
                {sortItems(looseTrashed).map((deck) => <ProjectCard key={deck.id} deck={deck} imageCount={imgCount(deck.id)} srs={srs} onOpen={onOpen} onRename={onRenameProject} onDelete={onDeleteProject} onPin={onPinProject} onExport={exportDeck} onMove={openMove} />)}
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
function ProjectView({ deck, occlusions, progress, lastProg, onBack, onRename, onSetDesc, onStudy, onAddCard, onEditCard, onDeleteCard, onAddGap, onEditGap, onDeleteGap, onImportMcqs, onDeleteMcq, onNewImage, onEditImage, onDeleteImage, onStudyImages }) {
  const [renaming, setRenaming] = useState(false);
  const [importMsg, setImportMsg] = useState(null);
  // Per-section Edit Mode toggles (hide row edit/delete icons until active).
  const [isEditingFlashcards, setIsEditingFlashcards] = useState(false);
  const [isEditingGaps, setIsEditingGaps] = useState(false);
  const [isEditingQuiz, setIsEditingQuiz] = useState(false);
  const [isEditingImages, setIsEditingImages] = useState(false);
  const p = progress[deck.id] || blankProg();
  const mcqs = deck.mcqs || [];
  const quizReady = canQuiz(deck);
  function handleCsv(file) {
    if (!file) return;
    readText(file, (text) => {
      const parsed = csvToMcqs(text);
      if (parsed.length) { onImportMcqs(deck.id, parsed); setImportMsg({ ok: true, text: `Imported ${parsed.length} question${parsed.length === 1 ? "" : "s"}.` }); }
      else setImportMsg({ ok: false, text: "No valid rows found. Expected: Question, Option A, B, C, D, Correct Answer." });
      setTimeout(() => setImportMsg(null), 4000);
    });
  }
  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 rounded-xl border border-med-lines bg-white px-4 py-2 text-sm font-medium text-med-text shadow-sm transition-all hover:bg-[#F7F9FA] hover:shadow-md active:scale-95"><ArrowLeft className="h-4 w-4" /> Back to files</button>

      <div className="mb-5 min-w-0">
        <div className="flex items-center gap-2">
          <EditableTitle value={deck.title} onChange={(t) => onRename(deck.id, t)} editing={renaming} onEditingChange={setRenaming} clickToEdit={false} className="text-2xl font-bold tracking-tight text-slate-900" />
          <button onClick={() => setRenaming(true)} title="Rename project" className="rounded-lg border border-slate-200 p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
        </div>
        <div className="mt-1"><InlineDesc value={deck.description} onSave={(t) => onSetDesc(deck.id, t)} placeholder="Add a project description…" /></div>
      </div>

      {/* Flashcards */}
      <Section icon={Layers} title="Flashcards" subtitle={`${deck.cards.length} ${deck.cards.length === 1 ? "card" : "cards"}`} accent={deck.accent} defaultOpen={false}
        action={<>
          <button onClick={onAddCard} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"><Plus className="h-4 w-4" /> Add</button>
          {deck.cards.length > 0 && <EditToggle editing={isEditingFlashcards} onToggle={() => setIsEditingFlashcards((v) => !v)} />}
          <button onClick={() => onStudy("flip")} disabled={!deck.cards.length} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-md transition active:scale-95 ${deck.cards.length ? `bg-gradient-to-r ${deck.accent} hover:opacity-90` : "cursor-not-allowed bg-slate-300"}`}><BookOpen className="h-4 w-4" /> Study</button>
        </>}>
        <DeckProgress all={p} last={lastProg[deck.id]?.flip} />
        {deck.cards.length === 0 ? <p className="text-sm text-slate-400">No cards yet. Use “Add”.</p> : isEditingFlashcards && (
          <div className="space-y-2">
            {deck.cards.map((card, i) => (
              <div key={card.id} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-200 text-[11px] font-semibold text-slate-500">{i + 1}</span><p className="truncate text-sm font-medium text-slate-800">{card.q}</p></div>
                  <p className="truncate pl-7 text-xs text-slate-500">{card.a}</p>
                </div>
                {isEditingFlashcards && (
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => onEditCard(card)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:text-slate-900"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => onDeleteCard(deck.id, card.id)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Gaps */}
      <Section icon={AlignLeft} title="Gaps" subtitle={`${deck.gaps.length} ${deck.gaps.length === 1 ? "gap" : "gaps"}`} accent={deck.accent}
        action={<>
          <button onClick={onAddGap} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"><Plus className="h-4 w-4" /> Add</button>
          {deck.gaps.length > 0 && <EditToggle editing={isEditingGaps} onToggle={() => setIsEditingGaps((v) => !v)} />}
          <button onClick={() => onStudy("gap")} disabled={!deck.gaps.length} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-md transition active:scale-95 ${deck.gaps.length ? `bg-gradient-to-r ${deck.accent} hover:opacity-90` : "cursor-not-allowed bg-slate-300"}`}><AlignLeft className="h-4 w-4" /> Study</button>
        </>}>
        <TwoAcc label="Gap" allCorrect={p.gapCorrect} allTotal={p.gapTotal} last={lastProg[deck.id]?.gap} />
        {deck.gaps.length === 0 ? <p className="text-sm text-slate-400">No gaps yet. Use “Add”, then double-tap a word to hide it.</p> : isEditingGaps && (
          <div className="space-y-2">
            {deck.gaps.map((gap) => { const parsed = parseGaps(gap.text); return (
              <div key={gap.id} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                <p className="min-w-0 flex-1 text-sm text-slate-700">{parsed.segments.map((s, i) => s.type === "text" ? <span key={i}>{s.value}</span> : <span key={i} className="mx-0.5 rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700">{s.answer}</span>)}</p>
                {isEditingGaps && (
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => onEditGap(gap)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:text-slate-900"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => onDeleteGap(deck.id, gap.id)} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </div>
            ); })}
          </div>
        )}
      </Section>

      {/* Quiz — MCQs only (added/imported here); independent of Flashcards */}
      <Section icon={ListChecks} title="Quiz" subtitle={`${quizCount(deck)} questions${mcqs.length ? ` · ${mcqs.length} imported` : ""}`} accent={deck.accent}
        action={<>
          <label title="Import MCQs from a .csv file" className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
            <Upload className="h-4 w-4" /> Import CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { handleCsv(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {mcqs.length > 0 && <EditToggle editing={isEditingQuiz} onToggle={() => setIsEditingQuiz((v) => !v)} />}
          <button onClick={() => onStudy("quiz")} disabled={!quizReady} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-md transition active:scale-95 ${quizReady ? `bg-gradient-to-r ${deck.accent} hover:opacity-90` : "cursor-not-allowed bg-slate-300"}`}><ListChecks className="h-4 w-4" /> {quizReady ? "Start" : "Need cards/CSV"}</button>
        </>}>
        <TwoAcc label="Quiz" allCorrect={p.quizCorrect} allTotal={p.quizTotal} last={lastProg[deck.id]?.quiz} />
        {importMsg && <p className={`mb-3 text-xs font-medium ${importMsg.ok ? "text-emerald-600" : "text-rose-500"}`}>{importMsg.text}</p>}
        {mcqs.length > 0 && isEditingQuiz && (
          <div className="space-y-2">
            {mcqs.map((m, i) => (
              <div key={m.id} className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-200 text-[11px] font-semibold text-slate-500">{i + 1}</span><p className="truncate text-sm font-medium text-slate-800">{m.q}</p></div>
                  <p className="truncate pl-7 text-xs text-slate-500">{m.options.length} options · answer: <span className="font-medium text-emerald-600">{m.answer}</span></p>
                </div>
                {isEditingQuiz && <button onClick={() => onDeleteMcq(deck.id, m.id)} className="shrink-0 rounded-md border border-slate-200 bg-white p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Images */}
      <Section icon={ImageIcon} title="Images" subtitle={`${occlusions.length} image ${occlusions.length === 1 ? "card" : "cards"}`} accent={deck.accent}
        action={<>
          <button onClick={onNewImage} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"><Plus className="h-4 w-4" /> New</button>
          {occlusions.length > 0 && <EditToggle editing={isEditingImages} onToggle={() => setIsEditingImages((v) => !v)} />}
          <button onClick={() => onStudyImages(occlusions)} disabled={!occlusions.length} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-md transition active:scale-95 ${occlusions.length ? `bg-gradient-to-r ${deck.accent} hover:opacity-90` : "cursor-not-allowed bg-slate-300"}`}><Eye className="h-4 w-4" /> Study</button>
        </>}>
        {isEditingImages && (occlusions.length === 0
          ? <p className="text-sm text-slate-400">No image cards yet. Use “New” to upload an image and cover words.</p>
          : <div className="space-y-3">
              {occlusions.map((occ) => <OccRow key={occ.id} occ={occ} editing={isEditingImages} onEdit={onEditImage} onDelete={onDeleteImage} onStudy={onStudyImages} />)}
            </div>
        )}
      </Section>
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
  const stats = mode === "flip"
    ? [{ label: "Easy", value: session.results.easy, color: "text-med-primary", bg: "bg-sky-50" }, { label: "Good", value: session.results.good, color: "text-med-text", bg: "bg-slate-100" }, { label: "Hard", value: session.results.hard, color: "text-med-accent", bg: "bg-rose-50" }]
    : [{ label: "Correct", value: session.correct, color: "text-emerald-600", bg: "bg-emerald-50" }, { label: "Missed", value: total - session.correct, color: "text-rose-600", bg: "bg-rose-50" }, { label: "Total", value: total, color: "text-slate-700", bg: "bg-slate-50" }];
  const titles = { flip: "Study Complete!", gap: "Gaps Complete!", quiz: "Quiz Complete!" };
  const nouns = { flip: "cards", gap: "gaps", quiz: "questions" };
  return (
    <div className="mx-auto max-w-xl text-center">
      <div className="rounded-3xl border border-slate-200 bg-white p-10 shadow-xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-200"><Trophy className="h-8 w-8" /></div>
        <h2 className="text-2xl font-bold text-slate-900">{titles[mode]}</h2>
        <p className="mt-2 text-sm text-slate-500">You finished all {total} {nouns[mode]} in <span className="font-medium text-slate-700">{deck.title}</span>.</p>
        <div className="mt-7 grid grid-cols-3 gap-3">{stats.map((s) => <div key={s.label} className={`rounded-xl ${s.bg} p-4`}><div className={`text-2xl font-bold ${s.color}`}>{s.value}</div><div className="text-xs font-medium text-slate-500">{s.label}</div></div>)}</div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button onClick={onRestart} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3 font-semibold text-white shadow-md transition hover:opacity-90 active:scale-95"><RotateCcw className="h-4 w-4" /> Try again</button>
          <button onClick={onHome} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"><CheckCircle2 className="h-4 w-4" /> Done</button>
        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400"><Sparkles className="h-3.5 w-3.5" /> Reviews scheduled with SM-2 · saved to Progress.</p>
      </div>
    </div>
  );
}
