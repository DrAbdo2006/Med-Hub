-- ===========================================================================
-- 0009 — flashcards sync HARDENING (fc_decks, fc_cards; + legacy app_state)
--
-- Audit outcome for the Flashcards sync backend (0007/0008):
--   PASS  RLS enabled on fc_decks/fc_cards.
--   PASS  Own-row policies for SELECT/INSERT/UPDATE/DELETE.
--   PASS  INSERT has WITH CHECK; UPDATE has USING *and* matching WITH CHECK
--         (so a user cannot reassign user_id to plant/steal rows).
--   PASS  RPCs are SECURITY INVOKER and FORCE user_id = auth.uid() server-side
--         (user_id is NOT a function argument → caller can't spoof it).
--   PASS  Idempotent upsert on the client-UUID PK with an updated_at LWW guard
--         (replays are no-ops; older queued writes never clobber newer rows).
--
-- This migration closes the remaining HARDENING gaps — all additive, idempotent,
-- and behavior-preserving for legitimate authenticated clients:
--   1. FORCE RLS            — table owner is no longer exempt from policies.
--   2. Explicit privileges  — authenticated gets exactly the DML it needs;
--                             anon is explicitly stripped (don't rely on the
--                             platform's default privileges).
--   3. RPC EXECUTE scope    — Postgres grants EXECUTE to PUBLIC by default;
--                             revoke it so anon/public cannot call the sync RPCs.
--   4. Pinned search_path   — prevents search-path hijacking and silences the
--                             Supabase "function_search_path_mutable" advisor.
--
-- Safe to re-run.
-- ===========================================================================

-- 1. ---------------------------------------------------------------------------
-- FORCE RLS: `ENABLE` alone still lets the TABLE OWNER bypass policies. FORCE
-- subjects the owner too. Roles with BYPASSRLS (Supabase `service_role`) are
-- unaffected, so server-side/admin jobs keep working; SECURITY INVOKER RPCs run
-- as the caller (authenticated) and remain fully governed by RLS.
alter table public.fc_decks force row level security;
alter table public.fc_cards force row level security;

-- 2. ---------------------------------------------------------------------------
-- Explicit privilege posture. The 0008 migration granted EXECUTE on the RPCs but
-- never spelled out table DML, leaving it to Supabase's default privileges.
-- Make it explicit: authenticated gets precisely what the client needs
-- (pullMerge does a direct SELECT; the INVOKER RPCs need I/U/D), anon gets none.
-- RLS still constrains every one of these to the caller's own rows.
revoke all on public.fc_decks from anon;
revoke all on public.fc_cards from anon;
grant select, insert, update, delete on public.fc_decks to authenticated;
grant select, insert, update, delete on public.fc_cards to authenticated;

-- 3. ---------------------------------------------------------------------------
-- RPC EXECUTE scope. `CREATE FUNCTION` grants EXECUTE to PUBLIC implicitly, so
-- despite 0008 granting to `authenticated`, anon/public could still invoke these.
-- (Impact was limited — anon's auth.uid() is NULL so the NOT NULL user_id + RLS
-- reject the write — but the surface shouldn't exist.) Revoke PUBLIC, keep
-- authenticated only.
revoke execute on function public.fc_upsert_deck(text, jsonb, timestamptz, boolean) from public;
revoke execute on function public.fc_upsert_card(text, jsonb, timestamptz, boolean) from public;
grant  execute on function public.fc_upsert_deck(text, jsonb, timestamptz, boolean) to authenticated;
grant  execute on function public.fc_upsert_card(text, jsonb, timestamptz, boolean) to authenticated;

-- 4. ---------------------------------------------------------------------------
-- Pin search_path. Every reference inside the two RPCs is already fully
-- schema-qualified (public.fc_*, auth.uid()), so an empty search_path is safe
-- and removes any chance of a hijacked, unqualified name resolving to a rogue
-- object in a caller-controlled schema.
alter function public.fc_upsert_deck(text, jsonb, timestamptz, boolean) set search_path = '';
alter function public.fc_upsert_card(text, jsonb, timestamptz, boolean) set search_path = '';

-- 5. ---------------------------------------------------------------------------
-- Legacy app_state blob (0007) — apply the same posture IF that table exists
-- (0007 is optional and may not be deployed). Its RLS/policies are already
-- own-row-correct; this just adds FORCE + explicit grants.
do $$
begin
  if to_regclass('public.app_state') is not null then
    execute 'alter table public.app_state force row level security';
    execute 'revoke all on public.app_state from anon';
    execute 'grant select, insert, update, delete on public.app_state to authenticated';
  end if;
end $$;
