// Standalone sanity test for the Anki-faithful scheduler.
// Run:  node src/sched_test.mjs
const MIN = 60000, DAY = 86400000;

export const DEFAULT_SETTINGS = {
  learningSteps: [1, 10],
  relearningSteps: [10],
  graduatingInterval: 1,
  easyInterval: 4,
  startingEase: 2.5,
  easyBonus: 1.3,
  hardFactor: 1.2,
  intervalModifier: 1.0,
  lapseNewIntervalPct: 0.0,
  minimumInterval: 1,
  maximumInterval: 36500,
  leechThreshold: 8,
};

const clampIvl = (d, s) => Math.min(s.maximumInterval, Math.max(s.minimumInterval, d));

// Anki interval fuzz. rng() in [0,1); 0.5 ⇒ no change (deterministic tests).
function fuzz(interval, rng) {
  if (interval < 2.5) return interval;
  const seg1 = Math.max(0, Math.min(interval, 7) - 2.5);
  const seg2 = Math.max(0, Math.min(interval, 20) - 7);
  const seg3 = Math.max(0, interval - 20);
  const f = Math.max(1, Math.round(seg1 * 0.15 + seg2 * 0.10 + seg3 * 0.05));
  const delta = Math.round((rng() * 2 - 1) * f);   // integer in [-f, +f]
  return interval + delta;
}

export function schedule(card, rating, now = Date.now(), s = DEFAULT_SETTINGS, rng = Math.random) {
  const phase0 = card?.phase && card.phase !== "new" ? card.phase : "learning";
  const ease0 = card?.ease ?? s.startingEase;
  const interval0 = card?.interval ?? 0;
  const stepIndex0 = card?.stepIndex ?? 0;
  const lapses0 = card?.lapses ?? 0;
  const reps0 = card?.reps ?? 0;
  const postLapse0 = card?.postLapseInterval ?? 0;
  const ch = { lastReviewed: now };

  // ---- LEARNING / RELEARNING ----
  if (phase0 === "learning" || phase0 === "relearning") {
    const steps = phase0 === "relearning"
      ? (s.relearningSteps?.length ? s.relearningSteps : [10])
      : (s.learningSteps?.length ? s.learningSteps : [1, 10]);
    const last = steps.length - 1;
    if (rating === "again") {
      ch.phase = phase0; ch.stepIndex = 0; ch.dueDate = now + steps[0] * MIN;
    } else if (rating === "hard") {
      const i = Math.min(stepIndex0, last);
      ch.phase = phase0; ch.stepIndex = i; ch.dueDate = now + steps[i] * MIN;
    } else if (rating === "good") {
      const next = stepIndex0 + 1;
      if (next > last) {
        const interval = phase0 === "learning"
          ? Math.max(s.minimumInterval, s.graduatingInterval)
          : Math.max(s.minimumInterval, postLapse0);
        ch.phase = "review"; ch.stepIndex = 0; ch.interval = interval;
        ch.reps = reps0 + 1; ch.dueDate = now + interval * DAY;
      } else {
        ch.phase = phase0; ch.stepIndex = next; ch.dueDate = now + steps[next] * MIN;
      }
    } else { // easy → graduate now
      const interval = phase0 === "learning"
        ? s.easyInterval
        : Math.max(s.minimumInterval, postLapse0 + 1);
      ch.phase = "review"; ch.stepIndex = 0; ch.interval = interval;
      ch.reps = reps0 + 1; ch.dueDate = now + interval * DAY;
    }
    return ch;
  }

  // ---- REVIEW ----
  const delay = Math.max(0, Math.floor((now - (card?.dueDate ?? now)) / DAY));
  if (rating === "again") {
    ch.ease = Math.max(1.3, ease0 - 0.20);
    ch.lapses = lapses0 + 1;
    ch.postLapseInterval = Math.max(s.minimumInterval, Math.round(interval0 * s.lapseNewIntervalPct));
    ch.phase = "relearning"; ch.stepIndex = 0;
    ch.dueDate = now + (s.relearningSteps?.[0] ?? 10) * MIN;
    if (ch.lapses >= s.leechThreshold) ch.isLeech = true;
    return ch;
  }
  // hard / good / easy — compute all three, enforce ordering, then pick.
  const mod = s.intervalModifier;
  let hard = interval0 * s.hardFactor * mod;
  let good = (interval0 + delay / 2) * ease0 * mod;
  let easy = (interval0 + delay) * ease0 * s.easyBonus * mod;
  good = Math.max(good, interval0 + 1);          // passing must grow ≥ +1 day
  hard = Math.max(hard, interval0);              // hard never below; may be flat
  hard = Math.min(hard, good);                   // hard ≤ good
  easy = Math.max(easy, good + 1);               // good ≤ easy
  let chosen = { hard, good, easy }[rating];
  chosen = clampIvl(Math.round(chosen), s);
  chosen = clampIvl(Math.round(fuzz(chosen, rng)), s);
  ch.ease = rating === "hard" ? Math.max(1.3, ease0 - 0.15)
          : rating === "easy" ? ease0 + 0.15
          : ease0;
  ch.phase = "review"; ch.interval = chosen; ch.reps = reps0 + 1;
  ch.dueDate = now + chosen * DAY;
  return ch;
}

// ===================== sanity checks =====================
const noFuzz = () => 0.5;
const NOW = 1_000_000_000_000;
let pass = 0, fail = 0;
const approx = (a, b, t = 0) => Math.abs(a - b) <= t;
function ok(name, cond, got) { (cond ? (pass++, console.log(`  ✓ ${name}`)) : (fail++, console.log(`  ✗ ${name} — got ${JSON.stringify(got)}`))); }

// 1) fresh card: Good, Good → graduates at 1 day
let c = undefined;
let r1 = schedule(c, "good", NOW, DEFAULT_SETTINGS, noFuzz);
ok("Good #1 stays in learning (step 1, 10 min)", r1.phase === "learning" && r1.stepIndex === 1, r1);
let card1 = { ...r1 };
let r2 = schedule(card1, "good", NOW, DEFAULT_SETTINGS, noFuzz);
ok("Good #2 graduates to review @ 1 day", r2.phase === "review" && r2.interval === 1, r2);

// 2) fresh card: Easy → graduates at 4 days
let e = schedule(undefined, "easy", NOW, DEFAULT_SETTINGS, noFuzz);
ok("Easy graduates to review @ 4 days", e.phase === "review" && e.interval === 4, e);

// 3) mature 30-day card: Again → ease −0.20, relearning, lapses+1
let mature = { phase: "review", ease: 2.5, interval: 30, stepIndex: 0, lapses: 0, reps: 5, dueDate: NOW };
let lap = schedule(mature, "again", NOW, DEFAULT_SETTINGS, noFuzz);
ok("Again drops ease by 0.20 (2.5→2.30)", approx(lap.ease, 2.30, 1e-9), lap.ease);
ok("Again → relearning, lapses=1", lap.phase === "relearning" && lap.lapses === 1, lap);

// 4) 10-day card, ease 2.5, reviewed 2 days late, Good → ≈28 days (pre-fuzz)
let ten = { phase: "review", ease: 2.5, interval: 10, stepIndex: 0, lapses: 0, reps: 3, dueDate: NOW - 2 * DAY };
let g = schedule(ten, "good", NOW, DEFAULT_SETTINGS, noFuzz);
ok("Good on 10d @2d late ≈ 28", approx(g.interval, 28, 0), g.interval);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
