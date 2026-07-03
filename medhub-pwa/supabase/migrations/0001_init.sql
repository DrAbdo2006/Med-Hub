-- ===========================================================================
-- Med Hub — initial schema + Row Level Security
-- Migration: 0001_init.sql
--
-- HOW TO RUN
--   Option A (dashboard): Supabase Dashboard -> SQL Editor -> New query ->
--                         paste this whole file -> Run.
--   Option B (CLI):       supabase db push   (after `supabase link`)
--
-- EXECUTION ORDER (important):
--   1. extension
--   2. TABLES            <-- created FIRST, so functions/policies can reference them
--   3. FUNCTIONS         (is_admin reads public.profiles; SQL bodies are
--                         validated at CREATE time, so the table must exist first)
--   4. TRIGGERS
--   5. ENABLE RLS
--   6. POLICIES
--   7. GRANTS
--
-- WHAT THIS DOES
--   * Content model (admin-authored, read-only for students):
--       profiles, courses, lectures, quizzes, flashcards, mcqs, gaps
--   * Student-owned table: student_progress
--   * Row Level Security on EVERY table
--   * is_admin() so writes on content are admin-only
--   * Auto-creates a profiles row on signup (trigger)
--   * Blocks students from self-escalating their own role
--
-- NOTE: This SUPERSEDES the earlier exploratory `supabase_setup.sql`
--       (a single per-user `app_state` JSONB table).
--
-- Idempotent: safe to re-run (IF NOT EXISTS / CREATE OR REPLACE /
-- DROP ... IF EXISTS before each CREATE).
-- ===========================================================================

-- gen_random_uuid() is built into Postgres 13+ (Supabase). Harmless guard.
create extension if not exists pgcrypto;


-- ===========================================================================
-- 1. TABLES  (created before any function/policy references them)
-- ===========================================================================

-- --- profiles -------------------------------------------------------------
-- One row per auth user. `role` gates admin powers everywhere else.
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'student' check (role in ('student', 'admin')),
  full_name  text,
  created_at timestamptz not null default now()
);

-- --- courses --------------------------------------------------------------
create table if not exists public.courses (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  cover_image_path text,                 -- path within a Storage bucket
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);

-- --- lectures -------------------------------------------------------------
create table if not exists public.lectures (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  title       text not null,
  youtube_url text,
  notes       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- --- quizzes --------------------------------------------------------------
-- type controls which child table holds this quiz's items.
create table if not exists public.quizzes (
  id         uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures (id) on delete cascade,
  title      text not null,
  type       text not null check (type in ('flashcard', 'mcq', 'gap')),
  created_at timestamptz not null default now()
);

-- --- flashcards (type = 'flashcard') --------------------------------------
create table if not exists public.flashcards (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizzes (id) on delete cascade,
  q          text not null,
  a          text not null,
  image_path text,
  sort_order integer not null default 0
);

-- --- mcqs (type = 'mcq') --------------------------------------------------
-- options is a JSON array of choice strings, e.g. ["A","B","C","D"].
-- correct_index points into that array (0-based).
create table if not exists public.mcqs (
  id            uuid primary key default gen_random_uuid(),
  quiz_id       uuid not null references public.quizzes (id) on delete cascade,
  question      text not null,
  options       jsonb not null default '[]'::jsonb,
  correct_index integer not null default 0,
  explanation   text
);

-- --- gaps (type = 'gap') --------------------------------------------------
-- A fill-in-the-blank: text_before [answer] text_after.
create table if not exists public.gaps (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.quizzes (id) on delete cascade,
  text_before text,
  answer      text not null,
  text_after  text,
  sort_order  integer not null default 0
);

-- --- student_progress (student-owned) -------------------------------------
-- One row per student per reviewable card. Mirrors the local IndexedDB SM-2
-- state so progress syncs per-user.
--
-- card_id is the app-level item id (a flashcard/mcq/gap id). Stored as text
-- (not a FK) because a single column can't reference three child tables, and
-- because local-first ids are generated client-side. UNIQUE (user_id, card_id)
-- keeps it to one row per student per card and makes upserts clean.
create table if not exists public.student_progress (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  card_id       text not null,
  quiz_id       uuid references public.quizzes (id) on delete cascade,
  ease          double precision not null default 2.5,
  "interval"    integer not null default 0,          -- days (quoted: INTERVAL is a reserved keyword)
  phase         text,                                -- e.g. 'learning' | 'review'
  step_index    integer,                             -- index within learning steps
  due_date      timestamptz,
  lapses        integer not null default 0,
  reps          integer not null default 0,
  last_reviewed timestamptz,
  updated_at    timestamptz not null default now(),
  unique (user_id, card_id)
);

-- Helpful indexes for the per-user sync queries.
create index if not exists idx_student_progress_user      on public.student_progress (user_id);
create index if not exists idx_student_progress_user_due  on public.student_progress (user_id, due_date);
create index if not exists idx_lectures_course            on public.lectures (course_id);
create index if not exists idx_quizzes_lecture            on public.quizzes (lecture_id);
create index if not exists idx_flashcards_quiz            on public.flashcards (quiz_id);
create index if not exists idx_mcqs_quiz                  on public.mcqs (quiz_id);
create index if not exists idx_gaps_quiz                  on public.gaps (quiz_id);


-- ===========================================================================
-- 2. FUNCTIONS  (now that public.profiles exists)
-- ===========================================================================

-- --- is_admin() -----------------------------------------------------------
-- Returns true if the CURRENT request's user has role = 'admin'.
-- SECURITY DEFINER + pinned search_path means it reads public.profiles with
-- the owner's privileges and BYPASSES RLS. That is deliberate and required:
-- it prevents infinite recursion when this function is called from inside
-- profiles' own RLS policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- --- auto-create a profile on signup --------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    'student'                       -- everyone starts as a student
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- --- block self role-escalation -------------------------------------------
-- A student updating their own profile cannot change `role`. Only an admin
-- may change a role. The RLS UPDATE policy lets a user edit their own row;
-- this trigger guards the one field that matters.
create or replace function public.enforce_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Only admins can change a profile role';
  end if;
  return new;
end;
$$;

-- --- keep student_progress.updated_at fresh -------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ===========================================================================
-- 3. TRIGGERS
-- ===========================================================================
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists trg_enforce_profile_role on public.profiles;
create trigger trg_enforce_profile_role
  before update on public.profiles
  for each row execute function public.enforce_profile_role();

drop trigger if exists trg_student_progress_updated_at on public.student_progress;
create trigger trg_student_progress_updated_at
  before update on public.student_progress
  for each row execute function public.set_updated_at();


-- ===========================================================================
-- 4. ROW LEVEL SECURITY — enable on EVERY table, no exceptions
-- ===========================================================================
alter table public.profiles         enable row level security;
alter table public.courses          enable row level security;
alter table public.lectures         enable row level security;
alter table public.quizzes          enable row level security;
alter table public.flashcards       enable row level security;
alter table public.mcqs             enable row level security;
alter table public.gaps             enable row level security;
alter table public.student_progress enable row level security;


-- ===========================================================================
-- 5. POLICIES
-- ===========================================================================

-- --- profiles -------------------------------------------------------------
-- A user can read & update only their own row; admins can read/update any.
-- The enforce_profile_role trigger still stops a non-admin from flipping their
-- own role even via their own-row UPDATE.
drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own_or_admin on public.profiles;
create policy profiles_update_own_or_admin
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- (No INSERT policy: rows are created by the signup trigger, which runs as
--  SECURITY DEFINER and bypasses RLS. No DELETE policy: profiles die with
--  their auth.users row via ON DELETE CASCADE.)


-- --- content tables: read for any authenticated user, write only by admin --

-- courses
drop policy if exists courses_select_authenticated on public.courses;
create policy courses_select_authenticated
  on public.courses for select to authenticated using (true);
drop policy if exists courses_insert_admin on public.courses;
create policy courses_insert_admin
  on public.courses for insert to authenticated with check (public.is_admin());
drop policy if exists courses_update_admin on public.courses;
create policy courses_update_admin
  on public.courses for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists courses_delete_admin on public.courses;
create policy courses_delete_admin
  on public.courses for delete to authenticated using (public.is_admin());

-- lectures
drop policy if exists lectures_select_authenticated on public.lectures;
create policy lectures_select_authenticated
  on public.lectures for select to authenticated using (true);
drop policy if exists lectures_insert_admin on public.lectures;
create policy lectures_insert_admin
  on public.lectures for insert to authenticated with check (public.is_admin());
drop policy if exists lectures_update_admin on public.lectures;
create policy lectures_update_admin
  on public.lectures for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists lectures_delete_admin on public.lectures;
create policy lectures_delete_admin
  on public.lectures for delete to authenticated using (public.is_admin());

-- quizzes
drop policy if exists quizzes_select_authenticated on public.quizzes;
create policy quizzes_select_authenticated
  on public.quizzes for select to authenticated using (true);
drop policy if exists quizzes_insert_admin on public.quizzes;
create policy quizzes_insert_admin
  on public.quizzes for insert to authenticated with check (public.is_admin());
drop policy if exists quizzes_update_admin on public.quizzes;
create policy quizzes_update_admin
  on public.quizzes for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists quizzes_delete_admin on public.quizzes;
create policy quizzes_delete_admin
  on public.quizzes for delete to authenticated using (public.is_admin());

-- flashcards
drop policy if exists flashcards_select_authenticated on public.flashcards;
create policy flashcards_select_authenticated
  on public.flashcards for select to authenticated using (true);
drop policy if exists flashcards_insert_admin on public.flashcards;
create policy flashcards_insert_admin
  on public.flashcards for insert to authenticated with check (public.is_admin());
drop policy if exists flashcards_update_admin on public.flashcards;
create policy flashcards_update_admin
  on public.flashcards for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists flashcards_delete_admin on public.flashcards;
create policy flashcards_delete_admin
  on public.flashcards for delete to authenticated using (public.is_admin());

-- mcqs
drop policy if exists mcqs_select_authenticated on public.mcqs;
create policy mcqs_select_authenticated
  on public.mcqs for select to authenticated using (true);
drop policy if exists mcqs_insert_admin on public.mcqs;
create policy mcqs_insert_admin
  on public.mcqs for insert to authenticated with check (public.is_admin());
drop policy if exists mcqs_update_admin on public.mcqs;
create policy mcqs_update_admin
  on public.mcqs for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists mcqs_delete_admin on public.mcqs;
create policy mcqs_delete_admin
  on public.mcqs for delete to authenticated using (public.is_admin());

-- gaps
drop policy if exists gaps_select_authenticated on public.gaps;
create policy gaps_select_authenticated
  on public.gaps for select to authenticated using (true);
drop policy if exists gaps_insert_admin on public.gaps;
create policy gaps_insert_admin
  on public.gaps for insert to authenticated with check (public.is_admin());
drop policy if exists gaps_update_admin on public.gaps;
create policy gaps_update_admin
  on public.gaps for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists gaps_delete_admin on public.gaps;
create policy gaps_delete_admin
  on public.gaps for delete to authenticated using (public.is_admin());


-- --- student_progress: each user touches ONLY their own rows ---------------
drop policy if exists student_progress_select_own on public.student_progress;
create policy student_progress_select_own
  on public.student_progress for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists student_progress_insert_own on public.student_progress;
create policy student_progress_insert_own
  on public.student_progress for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists student_progress_update_own on public.student_progress;
create policy student_progress_update_own
  on public.student_progress for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists student_progress_delete_own on public.student_progress;
create policy student_progress_delete_own
  on public.student_progress for delete
  to authenticated
  using (user_id = auth.uid());


-- ===========================================================================
-- 6. GRANTS
-- ---------------------------------------------------------------------------
-- RLS decides WHICH ROWS; table grants decide WHICH COMMANDS a role may run.
-- The `anon` role gets nothing here: Med Hub requires login.
-- ===========================================================================
grant usage on schema public to authenticated;

grant select                         on public.profiles         to authenticated;
grant update                         on public.profiles         to authenticated;
grant select                         on public.courses          to authenticated;
grant select                         on public.lectures         to authenticated;
grant select                         on public.quizzes          to authenticated;
grant select                         on public.flashcards       to authenticated;
grant select                         on public.mcqs             to authenticated;
grant select                         on public.gaps             to authenticated;
-- Admin writes flow through the same `authenticated` role (gated by is_admin()
-- in the policies above), so that role also needs the write commands granted:
grant insert, update, delete         on public.courses          to authenticated;
grant insert, update, delete         on public.lectures         to authenticated;
grant insert, update, delete         on public.quizzes          to authenticated;
grant insert, update, delete         on public.flashcards       to authenticated;
grant insert, update, delete         on public.mcqs             to authenticated;
grant insert, update, delete         on public.gaps             to authenticated;
-- Students fully own their progress rows (row scope enforced by RLS):
grant select, insert, update, delete on public.student_progress to authenticated;

-- ===========================================================================
-- DONE. Next: set yourself admin (see instructions), then run supabase_test.mjs.
-- ===========================================================================