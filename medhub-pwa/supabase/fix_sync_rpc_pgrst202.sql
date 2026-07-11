-- ===========================================================================
-- FIX: PGRST202 — "Could not find the function public.fc_upsert_card with
--       parameters _data, _deleted, _id, _updated_at in the schema cache"
--
-- Diagnosis (from reading the repo): the frontend (src/lib/sync.js) and BOTH
-- repo SQL definitions (0008_flashcards_sync.sql, fix_sync_rpc_404.sql) agree
-- exactly on (_id, _data, _updated_at, _deleted). The DEPLOYED function must
-- be a divergent variant (different parameter names) — and because
-- CREATE OR REPLACE cannot RENAME parameters, re-running the correct script
-- over it ERRORS instead of fixing it. This script therefore DROPS every
-- deployed variant of the two functions first (whatever its signature),
-- recreates the exact repo definitions, re-applies the grants/hardening
-- (so the fix doesn't regress into the earlier 404), and reloads PostgREST's
-- schema cache (so the fix is visible immediately).
--
-- Only fc_upsert_deck and fc_upsert_card exist in this design — gaps/MCQs/
-- image boards do not cloud-sync and have no RPCs, so there is nothing else
-- to align. Idempotent: safe to re-run.
-- ===========================================================================

-- 1. Drop ALL deployed overloads/variants of the two functions, regardless of
--    their parameter names or types (catalog-driven, so nothing survives).
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('fc_upsert_deck', 'fc_upsert_card')
  loop
    execute format('drop function %s', fn.sig);
  end loop;
end $$;

-- 2. Recreate — EXACT definitions from the repo migrations (the contract the
--    frontend calls). SECURITY INVOKER: RLS applies; user_id is NOT an
--    argument and is forced to auth.uid(), so callers can't write as others.
--    Idempotent LWW upsert on the client-UUID PK: replays are no-ops, older
--    queued writes never clobber newer rows.
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

-- 3. Re-apply grants + hardening (DROP destroyed the old grants — skipping
--    this would trade PGRST202 for the earlier 404). authenticated ONLY.
revoke execute on function public.fc_upsert_deck(text, jsonb, timestamptz, boolean) from public;
revoke execute on function public.fc_upsert_card(text, jsonb, timestamptz, boolean) from public;
grant  execute on function public.fc_upsert_deck(text, jsonb, timestamptz, boolean) to authenticated;
grant  execute on function public.fc_upsert_card(text, jsonb, timestamptz, boolean) to authenticated;

alter function public.fc_upsert_deck(text, jsonb, timestamptz, boolean) set search_path = '';
alter function public.fc_upsert_card(text, jsonb, timestamptz, boolean) set search_path = '';

-- 4. Schema-cache reload — without this, PGRST202 lingers even after a
--    correct fix and looks unfixed.
notify pgrst, 'reload schema';

-- 5. Verify what's deployed now (run separately; should show exactly two rows
--    with the underscored argument list):
--   select p.proname, pg_get_function_arguments(p.oid) as args
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname like 'fc_upsert%';
