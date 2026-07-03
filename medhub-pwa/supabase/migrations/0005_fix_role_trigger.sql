-- ===========================================================================
-- Med Hub — migration 0005: permanent fix for the profile role trigger
--
-- WHAT WAS BROKEN
--   0001 defines trigger trg_enforce_profile_role -> enforce_profile_role(),
--   which blocks a role change unless public.is_admin() is true. is_admin()
--   reads the role of auth.uid() (the LOGGED-IN user). In the SQL Editor /
--   service-role / dashboard context there is NO logged-in user, so
--   auth.uid() is NULL and is_admin() returns false. Result: the trigger
--   rejected EVERY role change made from a trusted server context — including
--   creating the very first admin ("Only admins can change a profile role").
--   That is the chicken-and-egg bootstrap: you needed an admin to make an admin.
--
-- HOW THIS FIXES IT
--   Replace enforce_profile_role() so the role-change check is skipped when
--   auth.uid() IS NULL (i.e. a trusted, no-end-user context: SQL editor,
--   service role, dashboard, the signup trigger). A logged-in user is still
--   fully checked. The first admin is then set by a one-time manual flip in
--   the dashboard (see below) — no need to disable the trigger.
--
-- WHY THIS IS SAFE (no privilege-escalation hole)
--   Over the API a logged-in student ALWAYS has a non-null auth.uid(), so the
--   guard still fires and a student cannot self-escalate to admin. RLS on
--   public.profiles only lets the `authenticated` role update its own row
--   anyway; the `anon` role can't update profiles at all. Only contexts that
--   already bypass RLS (service role / SQL editor) get the null-uid path —
--   they are trusted by definition.
--
-- NOT CLOBBERING EXISTING ADMINS
--   * handle_new_user() (signup) inserts with `on conflict (id) do nothing`,
--     so it never overwrites an existing profile's role — unchanged here.
--   * enforce_profile_role() only acts when new.role IS DISTINCT FROM old.role,
--     so an admin editing other fields (e.g. full_name) keeps role = 'admin'.
--   * Once a user is admin, is_admin() is true, so their later role changes
--     (and other admins') pass normally.
--
-- Idempotent + forward-only: CREATE OR REPLACE the function, DROP TRIGGER IF
-- EXISTS then recreate. No data is touched; 0001–0004 remain intact.
-- ===========================================================================

create or replace function public.enforce_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only guard role changes that come from a logged-in user. Trusted contexts
  -- with no end user (auth.uid() IS NULL: service role / SQL editor / signup
  -- trigger) are allowed to set roles — that's how the first admin is created.
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only admins can change a profile role';
  end if;
  return new;
end;
$$;

-- Recreate the trigger to point at the refreshed function (same name as 0001).
drop trigger if exists trg_enforce_profile_role on public.profiles;
create trigger trg_enforce_profile_role
  before update on public.profiles
  for each row execute function public.enforce_profile_role();

-- ===========================================================================
-- SET THE FIRST ADMIN (one-time, run in the SQL Editor after a normal signup):
--
--   update public.profiles p
--   set role = 'admin'
--   from auth.users u
--   where u.id = p.id
--     and u.email = 'YOUR_EMAIL_HERE';
--
-- With this migration applied, the update above succeeds (auth.uid() is NULL
-- in the SQL editor, so the guard is skipped). No need to disable the trigger.
-- ===========================================================================
