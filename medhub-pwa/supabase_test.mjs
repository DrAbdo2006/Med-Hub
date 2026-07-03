// ===========================================================================
// Med Hub — Supabase connectivity + RLS proof
//
// Dependency-free (uses fetch + the REST/Auth endpoints). Run it where you
// HAVE internet (your machine), NOT inside a network-isolated sandbox:
//
//   node supabase_test.mjs
//
// It reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from the environment, or
// falls back to parsing the local .env file next to this script.
//
// PREREQS
//   1. You created a Supabase project and filled in medhub-pwa/.env.
//   2. You ran supabase/migrations/0001_init.sql in the SQL editor.
//   3. Email confirmation is OFF for quick testing
//      (Auth -> Providers -> Email -> "Confirm email" = off),
//      OR pass a confirmed account:
//        TEST_EMAIL=you@example.com TEST_PASSWORD=secret node supabase_test.mjs
//
// WHAT IT PROVES
//   1. Connectivity
//   2. Auth (signup/signin) for a fresh "student" user A
//   3. A student CAN SELECT courses                          (content is readable)
//   4. A student CANNOT INSERT a course                      (writes are admin-only)
//   5. A student CAN write & read their OWN student_progress (per-user store)
//   6. A different student B sees NONE of A's progress       (cross-user isolation)
// ===========================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ---- load env (process.env wins; otherwise parse ./.env) ------------------
function loadEnv() {
  const env = { ...process.env };
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env file; rely on process.env */ }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const step = (m) => console.log(`\n• ${m}`);
let failures = 0;
const expect = (cond, good, fail) => (cond ? ok(good) : (failures++, bad(fail)));

if (!SUPABASE_URL || !KEY || SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
  bad("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing or still placeholders.");
  bad("Fill in medhub-pwa/.env (or export them) and re-run.");
  process.exit(1);
}

async function authPost(path, body) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { r, data };
}

// Sign in, or sign up then sign in. Returns { token, uid } or exits.
async function getSession(email, password) {
  let { r, data } = await authPost("token?grant_type=password", { email, password });
  if (r.ok) return { token: data.access_token, uid: data.user.id, how: "signed in" };

  const su = await authPost("signup", { email, password });
  const tok = su.data.access_token || su.data.session?.access_token;
  if (su.r.ok && tok) {
    const user = su.data.user || su.data.session.user;
    return { token: tok, uid: user.id, how: "signed up (confirmation OFF)" };
  }
  if (su.r.ok && !tok) {
    bad("signup succeeded but email confirmation is ON — turn it off or pass a confirmed TEST_EMAIL/TEST_PASSWORD.");
    process.exit(1);
  }
  // signup failed (maybe exists) — retry signin
  const re = await authPost("token?grant_type=password", { email, password });
  if (re.r.ok) return { token: re.data.access_token, uid: re.data.user.id, how: "signed in (existing)" };
  bad(`auth failed: ${re.data.error_description || re.data.msg || re.r.status}`);
  process.exit(1);
}

const rest = (token) => ({ apikey: KEY, Authorization: `Bearer ${token}` });

async function main() {
  console.log(`Med Hub — Supabase RLS test\n  URL: ${SUPABASE_URL}`);

  // 1) connectivity
  step("1. Connectivity");
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: KEY } });
    expect(r.ok, `reachable (HTTP ${r.status})`, `cannot reach Supabase (HTTP ${r.status})`);
    if (!r.ok) process.exit(1);
  } catch (e) { bad(`cannot reach Supabase: ${e.message}`); process.exit(1); }

  // 2) auth — student A (and student B for isolation test)
  step("2. Authentication");
  const stamp = Date.now();
  const emailA = env.TEST_EMAIL || `medhub_a_${stamp}@example.com`;
  const passA = env.TEST_PASSWORD || "Test1234!pass";
  const emailB = `medhub_b_${stamp}@example.com`;
  const passB = "Test1234!pass";

  const A = await getSession(emailA, passA);
  ok(`student A ${A.how}`);
  const B = await getSession(emailB, passB);
  ok(`student B ${B.how}`);

  // 3) student CAN read courses
  step("3. Student SELECT on courses (should succeed)");
  {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/courses?select=id&limit=1`, { headers: rest(A.token) });
    expect(r.ok, `SELECT courses returned HTTP ${r.status} (content is readable)`,
                 `SELECT courses failed (HTTP ${r.status}) — did the migration run?`);
  }

  // 4) student CANNOT insert a course
  step("4. Student INSERT on courses (should be blocked by RLS)");
  {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/courses`, {
      method: "POST",
      headers: { ...rest(A.token), "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ title: "hacker course" }),
    });
    expect(!r.ok, `INSERT blocked (HTTP ${r.status}) — writes are admin-only ✅`,
                  `INSERT was ALLOWED (HTTP ${r.status}) — RLS is NOT protecting content!`);
  }

  // 5) student CAN write & read their OWN progress
  step("5. Student writes & reads OWN student_progress");
  const cardId = `card_${stamp}`;
  {
    const w = await fetch(`${SUPABASE_URL}/rest/v1/student_progress?on_conflict=user_id,card_id`, {
      method: "POST",
      headers: { ...rest(A.token), "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: A.uid, card_id: cardId, ease: 2.5, reps: 1, interval: 1 }),
    });
    expect(w.ok, `wrote own progress row (HTTP ${w.status})`,
                 `write own progress failed (HTTP ${w.status}): ${await w.text()}`);

    const rr = await fetch(`${SUPABASE_URL}/rest/v1/student_progress?select=card_id&card_id=eq.${cardId}`, { headers: rest(A.token) });
    const rows = await rr.json().catch(() => []);
    expect(Array.isArray(rows) && rows.some((x) => x.card_id === cardId),
           "read own progress row back", `could not read own row back: ${JSON.stringify(rows)}`);
  }

  // 6) cross-user isolation — B must NOT see A's progress
  step("6. Cross-user isolation (B cannot see A's progress)");
  {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/student_progress?select=card_id`, { headers: rest(B.token) });
    const rows = await r.json().catch(() => []);
    const leaked = Array.isArray(rows) && rows.some((x) => x.card_id === cardId);
    expect(r.ok && !leaked,
           `student B sees ${Array.isArray(rows) ? rows.length : "?"} of their own rows and NONE of A's ✅`,
           `LEAK: student B can see A's progress! ${JSON.stringify(rows)}`);
  }

  console.log(
    failures === 0
      ? "\n\x1b[32mPASS — schema reachable and RLS is enforced.\x1b[0m"
      : `\n\x1b[31mFAIL — ${failures} check(s) failed (see ✗ above).\x1b[0m`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { bad(e.message); process.exit(1); });
