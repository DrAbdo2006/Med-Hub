-- ===========================================================================
-- Med Hub — migration 0002: subjects layer above courses
--
-- Adds the "subject" tier the portal tabs need (Anatomy, Physiology, ...),
-- sitting ABOVE courses:   subjects -> courses -> lectures -> quizzes
--
-- Tabs are loaded from this table (NOT hardcoded), so the admin panel can add,
-- rename and reorder subjects later with zero frontend changes.
--
-- Run AFTER 0001_init.sql, in the Supabase SQL Editor (or `supabase db push`).
-- Idempotent: safe to re-run.
-- ===========================================================================

-- --- subjects table -------------------------------------------------------
create table if not exists public.subjects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- --- link courses -> subjects ---------------------------------------------
-- ON DELETE SET NULL: removing a subject must NOT delete its courses; they
-- simply become unassigned (and can be re-tabbed by an admin).
alter table public.courses
  add column if not exists subject_id uuid references public.subjects (id) on delete set null;

create index if not exists idx_courses_subject on public.courses (subject_id);

-- --- RLS: read for any authenticated user, writes for admins only ----------
alter table public.subjects enable row level security;

drop policy if exists subjects_select_authenticated on public.subjects;
create policy subjects_select_authenticated
  on public.subjects for select to authenticated using (true);

drop policy if exists subjects_insert_admin on public.subjects;
create policy subjects_insert_admin
  on public.subjects for insert to authenticated with check (public.is_admin());

drop policy if exists subjects_update_admin on public.subjects;
create policy subjects_update_admin
  on public.subjects for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists subjects_delete_admin on public.subjects;
create policy subjects_delete_admin
  on public.subjects for delete to authenticated using (public.is_admin());

-- --- grants (RLS still gates rows; this gates which commands the role may run)
grant select                 on public.subjects to authenticated;  -- students read tabs
grant insert, update, delete on public.subjects to authenticated;  -- admins write (gated by is_admin())

-- ===========================================================================
-- OPTIONAL SEED — uncomment to get clickable demo content immediately.
-- (Remove later or manage via the admin panel.)
-- ===========================================================================
-- with s as (
--   insert into public.subjects (name, sort_order) values
--     ('Anatomy', 1), ('Physiology', 2), ('Pathology', 3)
--   returning id, name
-- )
-- insert into public.courses (title, description, subject_id, sort_order)
-- select c.title, c.descr, s.id, c.ord
-- from s
-- join (values
--   ('Anatomy',    'The Upper Limb',     'Bones, muscles and neurovasculature of the arm.', 1),
--   ('Anatomy',    'The Thorax',         'Thoracic wall, pleura and the mediastinum.',       2),
--   ('Physiology', 'Cardiac Physiology', 'The cardiac cycle and conduction system.',         1)
-- ) as c(subject, title, descr, ord) on c.subject = s.name;
-- ===========================================================================
