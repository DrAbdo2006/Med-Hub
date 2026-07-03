// ===========================================================================
// Med Hub — Supabase browser client (singleton)
//
// Reads config from Vite env vars (see .env / .env.example):
//   VITE_SUPABASE_URL       -> your project URL
//   VITE_SUPABASE_ANON_KEY  -> the anon / publishable key (safe for the browser)
//
// Why this is safe to ship: the anon key only ever acts AS the logged-in user
// (or anonymous). Every table has Row Level Security enabled (see
// supabase/migrations/0001_init.sql), so the database — not the client — is the
// source of truth for who can read/write what. The service_role/secret key must
// NEVER appear in frontend code.
//
// Usage:
//   import { supabase } from "@/lib/supabaseClient";   // or relative path
//   const { data, error } = await supabase.from("courses").select("*");
// ===========================================================================
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail loudly during development if the env isn't wired up, instead of getting
// confusing 401/"Invalid API key" errors deep inside a query later.
if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "[supabaseClient] Missing env vars. Create medhub-pwa/.env with " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart `npm run dev`."
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // Persist the session in the browser and auto-refresh tokens so a student
    // stays logged in across reloads (their progress sync depends on auth.uid()).
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Convenience: true only when env is present and looks non-placeholder.
export const isSupabaseConfigured = Boolean(
  url && anonKey && !url.includes("YOUR-PROJECT-REF") && !anonKey.includes("YOUR-")
);

export default supabase;
