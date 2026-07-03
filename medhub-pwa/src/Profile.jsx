// ===========================================================================
// Profile — account settings (/profile). Lets the signed-in user edit their
// display name (public.profiles.full_name).
//
// Save flow: optimistic — the field updates instantly; on success we refresh
// the auth context so the rest of the app (e.g. the portal hero) reflects the
// new name, and show a success toast. On failure we revert and show an error.
//
// Security: RLS policy profiles_update_own_or_admin (0001) lets a user update
// only their own row, and the enforce_profile_role trigger protects `role`
// (this update only touches full_name, so role is never altered).
// ===========================================================================
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Stethoscope, Save, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { useAuth } from "./AuthProvider";
import ThemeToggle from "./ThemeToggle";
import PageTransition from "./PageTransition";

const SUCCESS = "#0E9F6E";
const DANGER = "#E83151";
const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:text-slate-100 shadow-sm " +
  "placeholder:text-gray-400 focus:border-med-primary focus:outline-none focus:ring-1 focus:ring-med-primary transition-colors " +
  "dark:border-white/20 dark:bg-white/10 dark:text-slate-100 dark:placeholder:text-slate-500";

function Toast({ toast, onClose }) {
  if (!toast) return null;
  const ok = toast.type === "success";
  return (
    <div className="fixed right-5 top-5 z-50 max-w-sm">
      <div className="flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-lg dark:bg-white/10" style={{ borderColor: ok ? SUCCESS : DANGER }}>
        {ok
          ? <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none" style={{ color: SUCCESS }} />
          : <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" style={{ color: DANGER }} />}
        <p className="flex-1 text-sm text-gray-800 dark:text-slate-200">{toast.msg}</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-slate-300 dark:hover:text-slate-300"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // Seed the input from the loaded profile.
  useEffect(() => {
    setName(profile?.full_name || "");
  }, [profile?.full_name]);

  const notify = (type, msg) => {
    setToast({ type, msg });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const trimmed = name.trim();
  const original = profile?.full_name || "";
  const dirty = trimmed !== original;
  const canSave = dirty && trimmed.length > 0 && !saving;

  async function handleSave() {
    if (!canSave || !user?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: trimmed })
      .eq("id", user.id);

    if (error) {
      setSaving(false);
      setName(original);                 // revert optimistic edit
      notify("error", `Couldn't save: ${error.message}`);
      return;
    }
    await refreshProfile();              // sync the rest of the app (hero, etc.)
    setSaving(false);
    notify("success", "Name updated");
  }

  return (
    <div className="min-h-screen bg-med-bg dark:bg-[#0e172a]">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* top bar */}
      <header className="sticky top-0 z-20 border-b border-gray-200/70 bg-white/85 backdrop-blur-md dark:border-white/10 dark:bg-[#0e172a]/95">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <button onClick={() => navigate("/dashboard")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-white/10 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Portal
          </button>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-med-primary">
              <img src="/logo-wordmark.png" alt="Med Hub" className="h-7 w-auto object-contain" />
            </Link>
          </div>
        </div>
      </header>

      <PageTransition as="main" className="mx-auto max-w-3xl px-5 pb-16">
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-gray-900 dark:text-slate-100">Account settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-300">Update how your name appears across Med Hub.</p>

        <div className="mt-6 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/10">
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 dark:text-slate-300">Display name</label>
          <input
            id="fullName"
            className={`mt-1.5 ${inputCls}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            placeholder="Your name"
            autoComplete="name"
          />

          {/* email shown read-only for context (not editable here) */}
          <div className="mt-5">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">Email</label>
            <input className={`mt-1.5 ${inputCls} bg-gray-50 text-gray-500 dark:bg-white/5 dark:text-slate-300`} value={user?.email || ""} disabled readOnly />
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="btn-premium inline-flex items-center gap-2 rounded-lg bg-med-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1577B0] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Save changes"}
            </button>
            {dirty && !saving && (
              <button onClick={() => setName(original)} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors dark:text-slate-300 dark:hover:bg-white/10">
                Cancel
              </button>
            )}
          </div>
        </div>
      </PageTransition>
    </div>
  );
}
