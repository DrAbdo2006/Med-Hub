// ===========================================================================
// AuthPage — premium split-screen login / signup.
//
// Left  : brand panel (gradient, value props) — unchanged.
// Right : a custom email/password form. On SIGN UP it also collects a required
//         "Full Name", which is passed to Supabase as options.data.full_name
//         (-> auth.users.raw_user_meta_data). The existing handle_new_user
//         trigger copies that into public.profiles.full_name.
//
// Why a custom form instead of the Supabase Auth UI widget: the widget can't
// show a custom field on the sign-up view only (its children render on both
// views), so a "required on signup" Full Name would also wrongly appear on
// login. A small hand-rolled form gives correct behaviour with the same look.
//
// If the user is already signed in, bounce them to where they were headed.
// ===========================================================================
import { useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Stethoscope, GraduationCap, BrainCircuit, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { useAuth } from "./AuthProvider";

const BRAND = "#1B98E0";        // med-primary — change here to re-skin the accent
const BRAND_DARK = "#1577B0";

const VALUE_PROPS = [
  { icon: BrainCircuit, title: "Spaced repetition", body: "An SM-2 engine schedules every card so you review exactly when it counts." },
  { icon: GraduationCap, title: "Built for med students", body: "Lectures, flashcards, MCQs and gap-fills — structured the way you actually study." },
  { icon: CheckCircle2, title: "Your progress, synced", body: "Study offline; your progress follows you to every device, privately." },
];

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm " +
  "placeholder:text-gray-400 focus:border-med-primary focus:outline-none focus:ring-1 focus:ring-med-primary transition-colors " +
  "dark:border-white/20 dark:bg-white/10 dark:text-slate-100 dark:placeholder:text-slate-500";

// Official multi-color Google "G" mark.
function GoogleIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export default function AuthPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Post-login destination. Default is the student portal (/dashboard) — "/"
  // is now the public landing page, so landing there after login would be a
  // misroute. A guarded deep link (state.from) still wins.
  const redirectTo = location.state?.from?.pathname || "/dashboard";

  const [mode, setMode] = useState("signin");     // 'signin' | 'signup'
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");        // e.g. "check your email"

  useEffect(() => {
    if (session) navigate(redirectTo, { replace: true });
  }, [session, navigate, redirectTo]);

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setNotice("");
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim() } },   // -> profiles.full_name via trigger
        });
        if (error) throw error;
        // If email confirmation is ON, there's no session yet — tell the user.
        if (!data.session) {
          setNotice("Account created. Check your email to confirm, then sign in.");
          setMode("signin");
        }
        // If confirmation is OFF, onAuthStateChange fires and the effect redirects.
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // redirect handled by the session effect
      }
    } catch (err) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // OAuth: redirects the browser to Google on success (so we don't clear the
  // busy flag in that case — the page navigates away). Errors surface inline.
  async function handleGoogle() {
    setError("");
    setNotice("");
    setOauthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        // Return to /dashboard (not the origin) — the origin "/" is the public
        // landing page now. Requires the /dashboard URL to be allowed in
        // Supabase Auth → URL Configuration (a `<origin>/**` wildcard covers it).
        options: { redirectTo: typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined },
      });
      if (error) throw error;
    } catch (err) {
      setError(err?.message || "Google sign-in failed. Please try again.");
      setOauthBusy(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-white">
      {/* -------------------------------------------------- brand panel */}
      <div
        className="relative hidden lg:flex flex-col justify-between p-12 xl:p-16 text-white overflow-hidden"
        style={{ background: `linear-gradient(155deg, ${BRAND} 0%, ${BRAND_DARK} 60%, #0f5e8c 100%)` }}
      >
        <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 -left-20 h-72 w-72 rounded-full bg-black/10 blur-3xl" />

        <Link to="/" className="relative flex items-center gap-3 w-fit rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <Stethoscope className="h-6 w-6" />
          </div>
          <span className="text-xl font-semibold tracking-tight">Med Hub</span>
        </Link>

        <div className="relative max-w-md">
          <h1 className="text-4xl xl:text-5xl font-semibold leading-tight tracking-tight">
            Master medicine,<br />one card at a time.
          </h1>
          <p className="mt-5 text-white/80 text-lg leading-relaxed">
            The focused study platform for medical students — high-yield decks,
            smart review scheduling, and progress that's always in sync.
          </p>

          <ul className="mt-10 space-y-5">
            {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <div className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-white/15">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-white/75 leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/60">
          © {new Date().getFullYear()} Med Hub. Study smarter.
        </p>
      </div>

      {/* -------------------------------------------------- auth card */}
      <div className="flex items-center justify-center p-6 sm:p-10 bg-med-bg lg:bg-white dark:bg-[#0e172a] lg:dark:bg-[#0e172a]">
        <div className="w-full max-w-sm">
          {/* compact logo for small screens (brand panel is hidden there) */}
          <Link to="/" className="mb-8 inline-block lg:hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-med-primary">
            <img src="/logo-wordmark.png" alt="Med Hub" className="h-9 w-auto object-contain" />
          </Link>

          <h2 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-slate-100">
            {isSignup ? "Create your account" : "Welcome back"}
          </h2>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-300">
            {isSignup ? "Get started in less than a minute." : "Sign in to continue."}
          </p>

          {/* Continue with Google */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={oauthBusy || busy}
            className="mt-8 inline-flex w-full items-center justify-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/10"
          >
            {oauthBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
            Continue with Google
          </button>

          {/* OR divider */}
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-slate-300">or</span>
            <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 dark:text-slate-300">Full name</label>
                <input
                  id="fullName"
                  type="text"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Dr. Jane Doe"
                  className={`mt-1.5 ${inputCls}`}
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-slate-300">Email</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={`mt-1.5 ${inputCls}`}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-slate-300">Password</label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={isSignup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`mt-1.5 ${inputCls}`}
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}
            {notice && (
              <p className="rounded-lg bg-med-primary/10 px-3 py-2 text-sm text-med-primary">{notice}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="btn-premium inline-flex w-full items-center justify-center gap-2 rounded-lg bg-med-primary px-3 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#1577B0] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSignup ? "Create account" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500 dark:text-slate-300">
            {isSignup ? "Already have an account? " : "New to Med Hub? "}
            <button
              type="button"
              onClick={() => switchMode(isSignup ? "signin" : "signup")}
              className="font-medium text-med-primary hover:underline"
            >
              {isSignup ? "Sign in" : "Create one"}
            </button>
          </p>

          <p className="mt-8 text-center text-xs text-gray-400">
            By continuing you agree to study responsibly. Your data stays private to you.
          </p>
        </div>
      </div>
    </div>
  );
}
