-- ===========================================================================
-- FIX: 404 on /rest/v1/rpc/fc_upsert_card | fc_upsert_deck
--
-- Paste this WHOLE script into the Supabase SQL Editor and run it once.
-- It force-creates everything the flashcards sync needs (tables, RLS,
-- policies, RPCs, grants, hardening), bypassing CLI migration desync.
-- Content is copied FAITHFULLY from the repo migrations:
--   supabase/migrations/0008_flashcards_sync.sql
--   supabase/migrations/0009_flashcards_sync_hardening.sql
-- Idempotent: safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- From 0008 — tables (client-UUID text PK = the idempotent upsert key)
-- ---------------------------------------------------------------------------
create table if not exists public.fc_decks (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null,
  deleted    boolean not null default false
);
create index if not exists fc_decks_user_idx on public.fc_decks (user_id);

create table if not exists public.fc_cards (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null,
  deleted    boolean not null default false
);
create index if not exists fc_cards_user_idx on public.fc_cards (user_id);

alter table public.fc_decks enable row level security;
alter table public.fc_cards enable row level security;

-- From 0008 — own-row policies (SELECT/INSERT/UPDATE/DELETE, USING + WITH CHECK)
do $$
declare t text;
begin
  foreach t in array array['fc_decks','fc_cards'] loop
    execute format('drop policy if exists %1$s_select_own on public.%1$s', t);
    execute format('create policy %1$s_select_own on public.%1$s for select to authenticated using (user_id = auth.uid())', t);
    execute format('drop policy if exists %1$s_insert_own on public.%1$s', t);
    execute format('create policy %1$s_insert_own on public.%1$s for insert to authenticated with check (user_id = auth.uid())', t);
    execute format('drop policy if exists %1$s_update_own on public.%1$s', t);
    execute format('create policy %1$s_update_own on public.%1$s for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('drop policy if exists %1$s_delete_own on public.%1$s', t);
    execute format('create policy %1$s_delete_own on public.%1$s for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- From 0008 — the two sync RPCs, EXACT definitions.
-- SECURITY INVOKER (not DEFINER): RLS fully applies; user_id is NOT an
-- argument and is FORCED to auth.uid() — a caller cannot write as anyone else.
-- Idempotent LWW upsert: conflict on the client-UUID PK, applied only when the
-- incoming updated_at is NEWER — replays are no-ops, old writes never clobber.
-- ---------------------------------------------------------------------------
create or replace function public.fc_upsert_deck(
  _id text, _data jsonb, _updated_at timestamptz, _deleted boolean default false
) returns void
language sql security invoker as $$
  insert into public.fc_decks (id, user_id, data, updated_at, deleted)
  values (_id, auth.uid(), _data, _updated_at, _deleted)
  on conflict (id) do update
    set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
    where public.fc_decks.updated_at < excluded.updated_at
      and public.fc_decks.user_id = auth.uid();
$$;

create or replace function public.fc_upsert_card(
  _id text, _data jsonb, _updated_at timestamptz, _deleted boolean default false
) returns void
language sql security invoker as $$
  insert into public.fc_cards (id, user_id, data, updated_at, deleted)
  values (_id, auth.uid(), _data, _updated_at, _deleted)
  on conflict (id) do update
    set data = excluded.data, updated_at = excluded.updated_at, deleted = excluded.deleted
    where public.fc_cards.updated_at < excluded.updated_at
      and public.fc_cards.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- From 0009 — hardening (preserved so this fix opens no holes)
-- ---------------------------------------------------------------------------
-- 1. FORCE RLS: table owner is subject to policies too.
alter table public.fc_decks force row level security;
alter table public.fc_cards force row level security;

-- 2. Explicit table privileges: authenticated only; anon stripped.
revoke all on public.fc_decks from anon;
revoke all on public.fc_cards from anon;
grant select, insert, update, delete on public.fc_decks to authenticated;
grant select, insert, update, delete on public.fc_cards to authenticated;

-- 3. RPC EXECUTE scope — signature-specific, authenticated ONLY (never
--    anon/public; CREATE FUNCTION implicitly grants PUBLIC, so revoke it).
revoke execute on function public.fc_upsert_deck(text, jsonb, timestamptz, boolean) from public;
revoke execute on function public.fc_upsert_card(text, jsonb, timestamptz, boolean) from public;
grant  execute on function public.fc_upsert_deck(text, jsonb, timestamptz, boolean) to authenticated;
grant  execute on function public.fc_upsert_card(text, jsonb, timestamptz, boolean) to authenticated;

-- 4. Pinned search_path (all references inside are schema-qualified).
alter function public.fc_upsert_deck(text, jsonb, timestamptz, boolean) set search_path = '';
alter function public.fc_upsert_card(text, jsonb, timestamptz, boolean) set search_path = '';

-- 5. Legacy app_state blob (0007, optional) — same posture if it exists.
do $$
begin
  if to_regclass('public.app_state') is not null then
    execute 'alter table public.app_state force row level security';
    execute 'revoke all on public.app_state from anon';
    execute 'grant select, insert, update, delete on public.app_state to authenticated';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Make PostgREST see the new functions IMMEDIATELY (stale schema cache is a
-- classic cause of 404s persisting after the functions exist).
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- Quick existence check (run separately if you like):
--   select proname, prosecdef from pg_proc where proname like 'fc_upsert%';
