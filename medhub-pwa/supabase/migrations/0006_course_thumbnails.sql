-- ===========================================================================
-- Med Hub — migration 0006: course thumbnails (column + Storage bucket + policies)
--
-- Run AFTER 0001 (provides public.is_admin()). Idempotent: safe to re-run.
--
-- Storage note: bucket-object permissions live on storage.objects (NOT normal
-- table RLS). Public read is allowed; INSERT/UPDATE/DELETE are admin-only via
-- public.is_admin(). A logged-in non-admin (or anon) cannot upload.
-- ===========================================================================

-- 1) Column on courses (idempotent).
alter table public.courses add column if not exists thumbnail_url text;

-- 2) Public bucket for thumbnails.
insert into storage.buckets (id, name, public)
values ('course-thumbnails', 'course-thumbnails', true)
on conflict (id) do update set public = excluded.public;

-- 3) Policies on storage.objects (RLS is already enabled on it by Supabase).

-- Public/anon READ (so <img> loads without auth).
drop policy if exists "course_thumbnails_public_read" on storage.objects;
create policy "course_thumbnails_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'course-thumbnails');

-- Admin-only WRITE (insert / update / delete) — never any authenticated user.
drop policy if exists "course_thumbnails_admin_insert" on storage.objects;
create policy "course_thumbnails_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'course-thumbnails' and public.is_admin());

drop policy if exists "course_thumbnails_admin_update" on storage.objects;
create policy "course_thumbnails_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'course-thumbnails' and public.is_admin())
  with check (bucket_id = 'course-thumbnails' and public.is_admin());

drop policy if exists "course_thumbnails_admin_delete" on storage.objects;
create policy "course_thumbnails_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'course-thumbnails' and public.is_admin());

-- ===========================================================================
-- DONE.
-- ===========================================================================
