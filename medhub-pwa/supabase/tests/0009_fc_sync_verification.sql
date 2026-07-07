-- ===========================================================================
-- Verification for the Flashcards sync RLS/RPC hardening (run AFTER 0009).
-- Run in the Supabase SQL editor or psql. Each block is wrapped in a
-- transaction and ROLLED BACK, so it leaves no test rows behind.
--
-- Replace these with two REAL ids from auth.users:
--   A (attacker/owner) and B (victim). e.g.  select id, email from auth.users;
--   :A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
--   :B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
--
-- How auth is simulated: Supabase's auth.uid() reads request.jwt.claims->>'sub'.
-- We set that GUC and `set local role authenticated` to behave like a real API
-- call (RLS enforced; owner/bypass privileges dropped).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- BLOCK 1 — as user A. Own writes succeed; cross-user writes are REJECTED.
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;

-- Own insert — EXPECT: SUCCESS
insert into public.fc_cards (id, user_id, data, updated_at)
values ('t_A_own', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"q":"mine"}', now());

-- (a) Plant a row under B's user_id — EXPECT: ERROR
--     "new row violates row-level security policy for table fc_cards"
insert into public.fc_cards (id, user_id, data, updated_at)
values ('t_plant_B', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{}', now());

-- (b) Reassign own row to B — EXPECT: ERROR (UPDATE ... WITH CHECK violation)
update public.fc_cards set user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where id = 't_A_own';

-- (c) RPC forces user_id = auth.uid(): you cannot pass B's id to write as B.
select public.fc_upsert_card('t_A_rpc', '{"q":"y"}', now());
select user_id from public.fc_cards where id = 't_A_rpc';   -- EXPECT: A's uuid, never B

-- (e) Idempotency: replay the SAME upsert twice — EXPECT: count = 1 (no dup)
select public.fc_upsert_card('t_A_rpc', '{"q":"y2"}', now());
select count(*) as should_be_1 from public.fc_cards where id = 't_A_rpc';

-- LWW guard: an OLDER timestamp must NOT clobber the newer row.
select public.fc_upsert_card('t_A_rpc', '{"q":"STALE"}', now() - interval '1 day');
select data->>'q' as should_be_y2 from public.fc_cards where id = 't_A_rpc';   -- EXPECT: y2
rollback;

-- ---------------------------------------------------------------------------
-- BLOCK 2 — as user B. Cannot see or overwrite A's rows.
-- (Seeds an A-owned row, switches to B, proves the read/no-op paths.)
-- ---------------------------------------------------------------------------
begin;
-- Seed one A-owned row as service context so B has a target to attack.
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;
insert into public.fc_cards (id, user_id, data, updated_at)
values ('t_victim', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{"q":"A-secret"}', now());

-- Switch to B.
reset role;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
set local role authenticated;

-- B tries to overwrite A's row via RPC — EXPECT: no-op (WHERE user_id=auth.uid() false)
select public.fc_upsert_card('t_victim', '{"pwned":true}', now());

-- B selects A's row — EXPECT: 0 (RLS SELECT blocks it)
select count(*) as should_be_0 from public.fc_cards where id = 't_victim';

-- Prove A's row is untouched (peek as A).
reset role;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;
select data->>'q' as should_be_A_secret from public.fc_cards where id = 't_victim';
rollback;

-- ---------------------------------------------------------------------------
-- BLOCK 3 — as anon. Cannot call the sync RPC at all (after 0009 revoke).
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
-- EXPECT: ERROR "permission denied for function fc_upsert_card"
select public.fc_upsert_card('t_anon', '{}', now());
rollback;
