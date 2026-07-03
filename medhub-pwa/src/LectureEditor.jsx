// ===========================================================================
// LectureEditor — Notion-style admin editor for a single lecture.
//
// Fields: Title, YouTube URL, Description, and a large Markdown `notes` editor
// with an optional live preview. SAVE MODEL: explicit Save button (no surprise
// autosave); a "Saved" indicator confirms success. All writes go through
// Supabase and are gated by the is_admin() RLS policies on `lectures`.
//
// Bottom: Bulk MCQ upload (JSON). The file is parsed + validated entirely on
// the client (all-or-nothing), previewed, then imported via the atomic
// admin_import_mcqs RPC. JSON is the recommended format (see header help).
// ===========================================================================
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Save, Eye, EyeOff, UploadCloud, CheckCircle2, AlertTriangle, Loader2,
} from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { parseMcqJson } from "./lib/mcqImport";
import LectureContent from "./LectureContent";

const SUCCESS = "#0E9F6E";

// Insert-toolbar snippets — author the exact Med Hub format at the cursor.
const SNIPPETS = [
  ["H2", "\n## Heading\n"],
  ["List", "\n- item\n- item\n"],
  ["To-do", "\n- [ ] task\n- [x] done\n"],
  ["Quote", "\n> quote\n"],
  ["Divider", "\n\n---\n\n"],
  ["Code", "\n```js\ncode here\n```\n"],
  ["Math", "\n$$\na^2 + b^2 = c^2\n$$\n"],
  ["Callout", "\n<callout>\nImportant note goes here.\n</callout>\n"],
  ["Toggle", "\n<details><summary>Click to expand</summary>\n\nHidden content.\n\n</details>\n"],
  ["Columns", "\n<columns>\n<column>\n\nLeft column.\n\n</column>\n<column>\n\nRight column.\n\n</column>\n</columns>\n"],
  ["Table", "\n| Column A | Column B |\n|---|---|\n| 1 | 2 |\n"],
  ["Image", "\n![caption](https://)\n"],
  ["Video", "\n<video src=\"https://\">caption</video>\n"],
  ["File", "\n<file src=\"https://\">Download</file>\n"],
];

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white dark:border-white/20 dark:bg-white/10 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-100 shadow-sm " +
  "placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-med-primary focus:outline-none focus:ring-1 focus:ring-med-primary transition-colors";

export default function LectureEditor({ lectureId, onBack, onSavedMeta, notify }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [preview, setPreview] = useState(false);

  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  // bulk import state
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);  // { ok, rows, errors }
  const [replace, setReplace] = useState(false);
  const [importing, setImporting] = useState(false);

  const taRef = useRef(null);

  // Insert a snippet at the cursor (keeps focus + caret sensible).
  function insertSnippet(snippet) {
    const ta = taRef.current;
    if (!ta) { setNotes((n) => n + snippet); return; }
    const start = ta.selectionStart ?? notes.length;
    const end = ta.selectionEnd ?? notes.length;
    const next = notes.slice(0, start) + snippet + notes.slice(end);
    setNotes(next);
    requestAnimationFrame(() => {
      ta.focus();
      const caret = start + snippet.length;
      ta.setSelectionRange(caret, caret);
    });
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from("lectures")
      .select("id, title, youtube_url, description, notes")
      .eq("id", lectureId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setTitle(data?.title || "");
        setYoutubeUrl(data?.youtube_url || "");
        setDescription(data?.description || "");
        setNotes(data?.notes || "");
        setLoading(false);
      });
    return () => { active = false; };
  }, [lectureId]);

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from("lectures")
      .update({
        title: title.trim(),
        youtube_url: youtubeUrl.trim() || null,
        description: description.trim() || null,
        notes: notes || null,
      })
      .eq("id", lectureId);
    setSaving(false);
    if (error) {
      notify?.("error", `Save failed: ${error.message}`);
    } else {
      setSavedAt(Date.now());
      notify?.("success", "Lecture saved");
      onSavedMeta?.({ id: lectureId, title: title.trim() });
    }
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsed(null);
    try {
      const text = await file.text();
      setParsed(parseMcqJson(text));
    } catch (err) {
      setParsed({ ok: false, rows: [], errors: [{ row: 0, messages: [`could not read file: ${err.message}`] }] });
    }
    // allow re-selecting the same file later
    e.target.value = "";
  }

  async function handleImport() {
    if (!parsed?.ok) return;
    if (replace && !window.confirm("Replace ALL existing MCQs for this lecture? This cannot be undone.")) return;

    setImporting(true);
    const { data, error } = await supabase.rpc("admin_import_mcqs", {
      p_lecture_id: lectureId,
      p_questions: parsed.rows,
      p_replace: replace,
    });
    setImporting(false);

    if (error) {
      notify?.("error", `Import failed: ${error.message}`);
    } else {
      const n = data?.inserted ?? parsed.rows.length;
      notify?.("success", `Imported ${n} question${n === 1 ? "" : "s"}.`);
      setParsed(null);
      setFileName("");
      setReplace(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-gray-400">
        <Loader2 className="h-7 w-7 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8">
      {/* header */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to admin
        </button>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="inline-flex items-center gap-1 text-sm" style={{ color: SUCCESS }}>
              <CheckCircle2 className="h-4 w-4" /> Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-premium inline-flex items-center gap-2 rounded-lg bg-med-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1577B0] disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </button>
        </div>
      </div>

      {/* meta fields */}
      <div className="mt-8 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Title</label>
          <input className={`mt-1.5 ${inputCls}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lecture title" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">YouTube URL</label>
          <input className={`mt-1.5 ${inputCls}`} value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://youtu.be/…" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Description</label>
          <input className={`mt-1.5 ${inputCls}`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short summary shown on the course card" />
        </div>
      </div>

      {/* notes editor + preview */}
      <div className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Notes (Markdown article)</label>
          <button
            onClick={() => setPreview((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-med-primary hover:bg-med-primary/10 transition-colors"
          >
            {preview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {preview ? "Hide preview" : "Live preview"}
          </button>
        </div>
        {/* insert toolbar — authors the exact Med Hub format */}
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SNIPPETS.map(([label, snippet]) => (
            <button
              key={label}
              type="button"
              onClick={() => insertSnippet(snippet)}
              className="rounded-lg border border-gray-200 bg-white dark:border-white/20 dark:bg-white/10 px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>

        <div className={preview ? "grid gap-4 lg:grid-cols-2" : ""}>
          <textarea
            ref={taRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            spellCheck={false}
            placeholder={"# Heading\n\nWrite the lecture article in Markdown…"}
            className="h-[28rem] w-full resize-y rounded-xl border border-gray-200 bg-white dark:border-white/20 dark:bg-white/10 p-4 font-mono text-sm leading-relaxed text-gray-900 dark:text-slate-100 shadow-sm focus:border-med-primary focus:outline-none focus:ring-1 focus:ring-med-primary"
          />
          {preview && (
            <div className="h-[28rem] overflow-auto rounded-xl border border-gray-200 bg-white dark:border-white/20 dark:bg-white/10 p-5 shadow-sm">
              {notes.trim() ? (
                <LectureContent markdown={notes} />
              ) : (
                <p className="text-sm text-gray-400">Preview will appear here…</p>
              )}
            </div>
          )}
        </div>

        {/* format reference */}
        <details className="mt-3 rounded-xl border border-gray-200 bg-white dark:border-white/20 dark:bg-white/10 px-4 py-3 text-sm">
          <summary className="cursor-pointer select-none font-medium text-gray-700 dark:text-slate-300">Formatting guide</summary>
          <div className="mt-2 grid gap-1 text-xs text-gray-500 dark:text-slate-300 sm:grid-cols-2">
            <span><code># / ## / ### / ####</code> headings</span>
            <span><code>- item</code> / <code>1. item</code> lists</span>
            <span><code>- [ ]</code> / <code>- [x]</code> to-do</span>
            <span><code>&gt; quote</code> · <code>---</code> divider</span>
            <span><code>```lang</code> code block</span>
            <span><code>$$ equation $$</code> math</span>
            <span><code>![caption](url)</code> image</span>
            <span><code>&lt;callout&gt;…&lt;/callout&gt;</code> callout</span>
            <span><code>&lt;details&gt;&lt;summary&gt;…</code> toggle</span>
            <span><code>&lt;columns&gt;&lt;column&gt;…</code> columns</span>
            <span><code>&lt;table&gt;&lt;tr&gt;&lt;td&gt;</code> or GFM <code>| a | b |</code></span>
            <span><code>&lt;video|audio|pdf|file src="…"&gt;caption</code></span>
          </div>
        </details>
      </div>

      {/* bulk MCQ upload */}
      <div className="mt-10 rounded-2xl border border-gray-200/80 bg-white dark:border-white/10 dark:bg-white/10 p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-slate-100">
          <UploadCloud className="h-5 w-5 text-med-primary" /> Bulk upload MCQs
        </h3>
        <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-300">
          Upload a <strong>JSON</strong> file (recommended — safe for commas, quotes and line breaks
          in questions/explanations). Each item: <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/10 text-xs">{`{ question, options[], correct_index }`}</code>,
          or the friendly <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/10 text-xs">{`option_a…d + correct_answer`}</code> shape.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white dark:border-white/20 dark:bg-white/10 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-white/10 transition-colors">
            <UploadCloud className="h-4 w-4" /> Choose JSON file
            <input type="file" accept="application/json,.json" className="hidden" onChange={handleFile} />
          </label>
          {fileName && <span className="text-sm text-gray-500 dark:text-slate-300">{fileName}</span>}
        </div>

        {/* parse results */}
        {parsed && !parsed.ok && (
          <div className="mt-4 rounded-xl border px-4 py-3" style={{ borderColor: "#E83151", backgroundColor: "#FDECEF" }}>
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "#E83151" }}>
              <AlertTriangle className="h-4 w-4" /> Import aborted — fix these and re-upload (nothing was written):
            </p>
            <ul className="mt-2 space-y-1 text-sm" style={{ color: "#9b1c33" }}>
              {parsed.errors.map((e, i) => (
                <li key={i}>{e.row > 0 ? `Row ${e.row}: ` : ""}{e.messages.join("; ")}</li>
              ))}
            </ul>
          </div>
        )}

        {parsed?.ok && (
          <div className="mt-4 rounded-xl border px-4 py-4" style={{ borderColor: SUCCESS, backgroundColor: "#E7F7F0" }}>
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: SUCCESS }}>
              <CheckCircle2 className="h-4 w-4" /> {parsed.rows.length} question{parsed.rows.length === 1 ? "" : "s"} parsed, all valid.
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-med-primary focus:ring-med-primary" />
              Replace existing MCQs for this lecture first (destructive)
            </label>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={handleImport}
                disabled={importing}
                className="btn-premium inline-flex items-center gap-2 rounded-lg bg-med-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1577B0] disabled:opacity-60"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Import {parsed.rows.length}
              </button>
              <button
                onClick={() => { setParsed(null); setFileName(""); setReplace(false); }}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
