// ===========================================================================
// BackupControls — "Backup" (download all data as JSON) + "Import" (restore
// from a backup, with a confirm dialog before overwriting). Drop this into the
// Settings view. Styling uses the Med Hub palette utility classes.
// ===========================================================================
import { useRef, useState } from "react";
import { downloadBackup, importAll, storageEstimate } from "./db";

export default function BackupControls() {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null); // { ok, text }

  async function handleBackup() {
    try {
      await downloadBackup();
      const est = await storageEstimate();
      const used = est ? ` (${(est.usage / 1048576).toFixed(1)} MB stored)` : "";
      setMsg({ ok: true, text: `Backup downloaded${used}.` });
    } catch (e) {
      setMsg({ ok: false, text: e.message || "Backup failed." });
    }
  }

  function handlePick() { fileRef.current?.click(); }

  async function handleImport(file) {
    if (!file) return;
    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      setMsg({ ok: false, text: "That file isn't valid JSON." });
      return;
    }
    const ok = window.confirm(
      "Import this backup?\n\nThis will OVERWRITE all current folders, projects, and flashcards on this device. This cannot be undone — back up first if unsure."
    );
    if (!ok) return;
    try {
      await importAll(payload);
      setMsg({ ok: true, text: "Backup restored. Your library has been replaced." });
    } catch (e) {
      setMsg({ ok: false, text: e.message || "Import failed." });
    }
  }

  return (
    <div className="rounded-2xl border border-med-lines bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-med-primary">Backup &amp; restore</h3>
      <p className="mt-1 text-sm text-med-text">
        Your data lives only on this device. Export a copy regularly so you never lose it.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={handleBackup} className="btn-premium rounded-xl bg-med-primary px-4 py-2 text-sm font-semibold text-white shadow-md">
          Backup (download JSON)
        </button>
        <button onClick={handlePick} className="rounded-xl border border-med-lines bg-white px-4 py-2 text-sm font-semibold text-med-text transition-all hover:bg-[#F7F9FA] hover:shadow-md active:scale-95">
          Import from file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => { handleImport(e.target.files?.[0]); e.target.value = ""; }}
        />
      </div>
      {msg && <p className={`mt-3 text-sm font-medium ${msg.ok ? "text-med-primary" : "text-med-accent"}`}>{msg.text}</p>}
    </div>
  );
}
