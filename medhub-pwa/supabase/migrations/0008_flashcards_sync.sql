-- ===========================================================================
-- 0008 — flashcards cloud sync (decks + cards), REQUIRED for lib/sync.js
--
-- Row-per-entity mirror of the local IndexedDB store, written through
-- idempotent last-write-wins RPCs:
--   • id is the CLIENT-generated id (crypto.randomUUID via db.js uid();
--     text, not serial — no key collisions across offline devices).
--   • data holds the full entity snapshot (jsonb) — schema-flexible.
--   • updated_at is the LWW conflict timestamp: the upsert only applies when
--     the incoming stamp is NEWER than the stored row. Retrying a delivered
--     op is a no-op → safe partial-failure retries.
--   • deleted is a tombstone (never hard-delete) so deletions propagate to
--     other devices and can't be resurrected by an older offline edit.
--
-- SECURITY: RLS on, every policy user_id = auth.uid(); the RPCs run as the
-- caller (security invoker) and force user_id = auth.uid() on insert.
--
-- Supersedes the optional 0007 blob approach for flashcards sync.
-- Idempotent: safe to re-run.
-- ===========================================================================

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

-- Own-rows policies (select/insert/update/delete), same pattern as
-- student_progress in 0001.
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

-- Idempotent LWW upserts. ON CONFLICT ... WHERE guards make replays no-ops
-- and older offline edits lose deterministically.
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

grant execute on function public.fc_upsert_deck(text, jsonb, timestamptz, boolean) to authenticated;
grant execute on function public.fc_upsert_card(text, jsonb, timestamptz, boolean) to authenticated;
