// ===========================================================================
// AuthProvider — single source of truth for the signed-in user.
//
// Exposes via context:
//   session    — the Supabase session (or null)
//   user       — convenience alias for session.user (or null)
//   profile    — the user's public.profiles row (role, full_name, ...) or null
//   isAdmin    — true when profile.role === 'admin' (drives the hidden admin UI)
//   loading    — true until the initial session check completes
//   signOut()  — clears the session
//
// It subscribes to Supabase auth changes so login/logout anywhere updates the
// whole app, and (re)loads the profile row whenever the user changes. The
// profile fetch goes through RLS, so it only ever returns the user's own row.
// ===========================================================================
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./lib/supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load (or clear) the profile row for the current user.
  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return; }
    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, full_name, created_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      // Non-fatal: a brand-new user's row may lag the signup trigger by a moment.
      // eslint-disable-next-line no-console
      console.warn("[auth] could not load profile:", error.message);
      setProfile(null);
    } else {
      setProfile(data);
    }
  }, []);

  useEffect(() => {
    let active = true;

    // 1) Hydrate from any persisted session on first load.
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user?.id);
      setLoading(false);
    });

    // 2) React to future auth changes (login, logout, token refresh).
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!active) return;
      setSession(newSession);
      await loadProfile(newSession?.user?.id);
      setLoading(false);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  // Re-fetch the current user's profile (e.g. after they edit their name) so
  // the whole app (hero greeting, etc.) reflects the change immediately.
  const refreshProfile = useCallback(
    () => loadProfile(session?.user?.id),
    [loadProfile, session?.user?.id]
  );

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    isAdmin: profile?.role === "admin",
    loading,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook for consuming the auth context. Throws if used outside the provider so
// mistakes surface immediately in development.
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
