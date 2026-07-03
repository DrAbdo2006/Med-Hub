-- ===========================================================================
-- Med Hub — migration 0004: transactional MCQ bulk-import RPC
--
-- admin_import_mcqs(lecture_id, questions, replace) does, atomically:
--   1. authorize: only admins (is_admin()) may run it
--   2. find-or-create the lecture's mcq quiz (type = 'mcq')
--   3. optionally delete the quiz's existing mcqs (replace = true)
--   4. bulk-insert the validated questions
-- Being a single plpgsql function, the whole thing runs in ONE transaction:
-- if any row fails, everything rolls back (no partial import).
--
-- `questions` is a jsonb array of objects already normalized by the client:
--   [{ "question": text, "options": [text,...], "correct_index": int,
--      "explanation": text|null }, ...]
--
-- SECURITY INVOKER (default): RLS still applies, so the mcqs/quizzes admin
-- write policies are a second line of defence behind the explicit is_admin()
-- check. A non-admin calling this RPC is rejected.
--
-- Run AFTER 0001 (provides is_admin, quizzes, mcqs). Idempotent.
-- ===========================================================================
create or replace function public.admin_import_mcqs(
  p_lecture_id uuid,
  p_questions  jsonb,
  p_replace    boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quiz_id uuid;
  v_count   integer;
begin
  if not public.is_admin() then
    raise exception 'not authorized: admin only';
  end if;

  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'questions must be a json array';
  end if;

  -- find-or-create the mcq quiz for this lecture
  select id into v_quiz_id
  from public.quizzes
  where lecture_id = p_lecture_id and type = 'mcq'
  order by created_at asc
  limit 1;

  if v_quiz_id is null then
    insert into public.quizzes (lecture_id, title, type)
    values (p_lecture_id, 'MCQ Quiz', 'mcq')
    returning id into v_quiz_id;
  end if;

  if p_replace then
    delete from public.mcqs where quiz_id = v_quiz_id;
  end if;

  insert into public.mcqs (quiz_id, question, options, correct_index, explanation)
  select
    v_quiz_id,
    (q ->> 'question'),
    coalesce(q -> 'options', '[]'::jsonb),
    (q ->> 'correct_index')::integer,
    nullif(q ->> 'explanation', '')
  from jsonb_array_elements(p_questions) as q;

  get diagnostics v_count = row_count;
  return jsonb_build_object('quiz_id', v_quiz_id, 'inserted', v_count);
end;
$$;

grant execute on function public.admin_import_mcqs(uuid, jsonb, boolean) to authenticated;

-- ===========================================================================
-- DONE.
-- ===========================================================================
