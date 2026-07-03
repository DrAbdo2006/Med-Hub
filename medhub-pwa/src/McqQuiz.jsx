// ===========================================================================
// McqQuiz — inline, MCQ-only "test yourself" section for a lecture.
//
// Data path matches the real schema: lectures -> quizzes (type = 'mcq') -> mcqs.
// One nested query grabs the mcq quiz AND its questions. mcqs shape:
//   question: text, options: jsonb (array of strings), correct_index: int,
//   explanation: text|null. Rendered against this exact shape.
//
// Behaviour (chosen defaults):
//   • Per-question reveal: answering one question reveals only that result;
//     others stay interactive. Once answered, a question is LOCKED.
//   • All questions stacked (scrollable), not a one-at-a-time wizard.
//   • Score tally appears once at least one question is answered.
//
// If there's no mcq quiz, or it has zero questions -> render nothing.
//
// Colors are PALETTE_CSS-safe: correct = success green and wrong = med-accent,
// applied via inline styles / tokens (NOT raw emerald/rose class names, which
// Flashcards' PALETTE_CSS would remap). Color is never the only signal — a
// check / x icon accompanies every revealed state for colorblind users.
// ===========================================================================
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, ListChecks } from "lucide-react";
import { supabase } from "./lib/supabaseClient";

// In-system colors (immune to PALETTE_CSS, which only targets Tailwind's
// emerald-*/rose-* class names — not arbitrary hex or med-* tokens).
const SUCCESS = "#0E9F6E";
const SUCCESS_BG = "#E7F7F0";
const DANGER = "#E83151";        // med-accent
const DANGER_BG = "#FDECEF";

function Skeleton() {
  return (
    <section className="mt-12">
      <div className="h-6 w-40 rounded bg-gray-200 dark:bg-white/10 motion-safe:animate-pulse" />
      <div className="mt-5 space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-gray-200/80 bg-white dark:border-white/10 dark:bg-white/10 p-5 shadow-sm">
            <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-white/10 motion-safe:animate-pulse" />
            <div className="mt-4 space-y-2.5">
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="h-10 rounded-xl bg-gray-100 dark:bg-white/10 motion-safe:animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Option({ text, index, answered, chosenIndex, correctIndex, onChoose }) {
  const isChosen = chosenIndex === index;
  const isCorrect = correctIndex === index;

  // Resolve visual state.
  let style;          // inline style for revealed colors (PALETTE-safe)
  let cls =
    "btn-premium flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-med-primary focus-visible:ring-offset-1";
  let icon = null;

  if (!answered) {
    cls += " border-gray-200 bg-white text-gray-800 dark:border-white/20 dark:bg-white/10 dark:text-slate-200 hover:border-med-primary hover:bg-med-primary/5 cursor-pointer";
  } else if (isCorrect) {
    style = { borderColor: SUCCESS, backgroundColor: SUCCESS_BG, color: SUCCESS };
    icon = <CheckCircle2 className="h-5 w-5 flex-none" aria-hidden="true" style={{ color: SUCCESS }} />;
  } else if (isChosen) {
    style = { borderColor: DANGER, backgroundColor: DANGER_BG, color: DANGER };
    icon = <XCircle className="h-5 w-5 flex-none" aria-hidden="true" style={{ color: DANGER }} />;
  } else {
    cls += " border-gray-200 bg-white text-gray-500 opacity-70 dark:border-white/10 dark:bg-white/10";
  }

  return (
    <button
      type="button"
      role="option"
      aria-pressed={isChosen}
      aria-label={`${text}${answered && isCorrect ? ", correct answer" : ""}${answered && isChosen && !isCorrect ? ", your answer, incorrect" : ""}`}
      disabled={answered}
      onClick={() => onChoose(index)}
      className={cls}
      style={style}
    >
      <span className="flex-1">{text}</span>
      {icon}
    </button>
  );
}

function Question({ q, number, chosenIndex, onChoose }) {
  const answered = chosenIndex != null;
  const options = Array.isArray(q.options) ? q.options : [];

  return (
    <div className="glass-panel rounded-2xl border border-gray-200/80 bg-white dark:border-white/10 dark:bg-white/10 p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-slate-300">Question {number}</p>
      <h4 className="mt-1 text-base font-semibold leading-snug text-gray-900 dark:text-slate-100">{q.question}</h4>

      <div className="mt-4 space-y-2.5" role="listbox" aria-label={`Options for question ${number}`}>
        {options.map((opt, i) => (
          <Option
            key={i}
            text={String(opt)}
            index={i}
            answered={answered}
            chosenIndex={chosenIndex}
            correctIndex={q.correct_index}
            onChoose={(idx) => onChoose(q.id, idx)}
          />
        ))}
      </div>

      {/* explanation appears after answering, if present */}
      {answered && q.explanation && (
        <div className="mt-4 rounded-xl bg-med-primary/5 px-4 py-3 text-sm leading-relaxed text-gray-600 dark:text-slate-300">
          <span className="font-semibold text-med-primary">Why: </span>
          {q.explanation}
        </div>
      )}
    </div>
  );
}

// `onLoaded(hasQuiz)` is an OPTIONAL, additive callback: lets the parent know
// whether a quiz exists (e.g. LectureView gates its "قيّم فهمك" CTA on it).
// No fetch/reveal/scoring behavior changes.
export default function McqQuiz({ lectureId, onComplete, onLoaded }) {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});   // { [mcqId]: chosenIndex }
  const reportedRef = useRef(false);            // ensures onComplete fires once

  useEffect(() => {
    let active = true;
    setLoading(true);
    setAnswers({});
    reportedRef.current = false;
    supabase
      .from("quizzes")
      .select("id, type, mcqs ( id, question, options, correct_index, explanation )")
      .eq("lecture_id", lectureId)
      .eq("type", "mcq")
      .limit(1)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          // eslint-disable-next-line no-console
          console.warn("[mcq] could not load quiz:", error.message);
          setQuestions([]);
          onLoaded?.(false);
        } else {
          const qs = data?.[0]?.mcqs ?? [];
          setQuestions(qs);
          onLoaded?.(qs.length > 0);
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [lectureId]);

  const choose = (mcqId, index) =>
    setAnswers((prev) => (prev[mcqId] != null ? prev : { ...prev, [mcqId]: index }));

  const answeredCount = Object.keys(answers).length;
  const correctCount = questions.reduce(
    (n, q) => n + (answers[q.id] === q.correct_index ? 1 : 0),
    0
  );

  // Notify the parent once every question has been answered (quiz "completed").
  useEffect(() => {
    if (!onComplete) return;
    if (questions.length > 0 && answeredCount === questions.length && !reportedRef.current) {
      reportedRef.current = true;
      onComplete({ score: correctCount, total: questions.length });
    }
  }, [answeredCount, questions.length, correctCount, onComplete]);

  if (loading) return <Skeleton />;
  if (questions.length === 0) return null;   // no mcq quiz -> render nothing

  return (
    <section className="mt-12" aria-labelledby="mcq-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="mcq-heading" className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-slate-100">
          <ListChecks className="h-5 w-5 text-med-primary" /> Test yourself
        </h2>
        {answeredCount > 0 && (
          <span
            className="inline-flex items-center rounded-full bg-med-primary/10 px-3 py-1 text-sm font-semibold text-med-primary"
            aria-live="polite"
          >
            {correctCount} / {questions.length} correct
          </span>
        )}
      </div>

      <div className="mt-5 space-y-4">
        {questions.map((q, i) => (
          <Question
            key={q.id}
            q={q}
            number={i + 1}
            chosenIndex={answers[q.id] ?? null}
            onChoose={choose}
          />
        ))}
      </div>
    </section>
  );
}
