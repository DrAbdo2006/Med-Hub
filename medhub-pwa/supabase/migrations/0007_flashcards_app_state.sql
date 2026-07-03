-- ===========================================================================
-- 0007 — flashcards cloud backup (OPTIONAL — read before running)
--
-- Context: the flashcards module was consolidated from a separate exploratory
-- Supabase project onto THIS project (one login, one RLS model). Its card
-- data lives on-device in IndexedDB (Dexie); cloud sync was scaffolded in the
-- old project (`app_state` JSONB blob per user) but never actually wired into
-- the UI, so the dead sync code was removed from Flashcards.jsx.
--
-- Nothing in the app requires this table today. Run it only when you decide
-- to add cloud backup/sync for flashcards — the client code will then talk to
-- this table through the shared client with the platform session.
--
-- Security model: RLS ON, and every policy is user_id = auth.uid() — each
-- student can read/write ONLY their own blob. The anon key in the bundle is
-- public by design; these policies are the real protection.
--
-- Idempotent: safe to re-run.
-- ===========================================================================

create table if not exists public.app_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

drop policy if exists app_state_select_own on public.app_state;
create policy app_state_select_own
  on public.app_state for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists app_state_insert_own on public.app_state;
create policy app_state_insert_own
  on public.app_state for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists app_state_update_own on public.app_state;
create policy app_state_update_own
  on public.app_state for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists app_state_delete_own on public.app_state;
create policy app_state_delete_own
  on public.app_state for delete
  to authenticated
  using (user_id = auth.uid());
