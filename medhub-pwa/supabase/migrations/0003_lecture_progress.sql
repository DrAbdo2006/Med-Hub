-- ===========================================================================
-- Med Hub — migration 0003: lecture_progress table + constraints + RLS
--
-- Self-contained: creates public.lecture_progress (one row per user+lecture),
-- then makes upserts safe and locks the table down per-user.
-- Columns: user_id, lecture_id, course_id, mcq_score, mcq_total, is_completed,
--          last_accessed.
-- Idempotent: safe to re-run (IF NOT EXISTS / drop-and-recreate policies).
-- ===========================================================================

-- --- 0) Table --------------------------------------------------------------
-- One row per (user, lecture). Types match the callers (LectureView upsert,
-- PortalHome/CourseDetail selects) and the uuid PKs of auth.users / lectures /
-- courses. FKs cascade so progress is cleaned up when a user/lecture/course is
-- removed. mcq_score/mcq_total stay NULL until the lecture's quiz is taken.
create table if not exists public.lecture_progress (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id)    on delete cascade,
  lecture_id    uuid not null references public.lectures (id) on delete cascade,
  course_id     uuid          references public.courses (id)  on delete cascade,
  mcq_score     integer,
  mcq_total     integer,
  is_completed  boolean     not null default false,
  last_accessed timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- --- 1) UNIQUE on (user_id, lecture_id) -----------------------------------
-- Required as the ON CONFLICT target for upserts (one row per user+lecture).
-- A UNIQUE INDEX is a valid conflict target and supports IF NOT EXISTS, so it
-- re-runs cleanly even if the constraint was added another way.
create unique index if not exists lecture_progress_user_lecture_uniq
  on public.lecture_progress (user_id, lecture_id);

-- Helpful for the "Continue Learning" recent-history query.
create index if not exists idx_lecture_progress_user_accessed
  on public.lecture_progress (user_id, last_accessed desc);

-- --- 2) Row Level Security: each user touches ONLY their own rows ----------
alter table public.lecture_progress enable row level security;

drop policy if exists lecture_progress_select_own on public.lecture_progress;
create policy lecture_progress_select_own
  on public.lecture_progress for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists lecture_progress_insert_own on public.lecture_progress;
create policy lecture_progress_insert_own
  on public.lecture_progress for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists lecture_progress_update_own on public.lecture_progress;
create policy lecture_progress_update_own
  on public.lecture_progress for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists lecture_progress_delete_own on public.lecture_progress;
create policy lecture_progress_delete_own
  on public.lecture_progress for delete
  to authenticated
  using (user_id = auth.uid());

-- --- 3) Grants (RLS still gates rows; this gates which commands the role runs)
grant select, insert, update, delete on public.lecture_progress to authenticated;

-- ===========================================================================
-- DONE.
-- ===========================================================================
