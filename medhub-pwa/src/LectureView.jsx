// ===========================================================================
// LectureView — the /lecture/:id page, as a rich educational article.
//
// Layout:
//   • Top    : lecture title + YouTube player (rendered ONLY if youtube_url).
//   • Main   : the lecture.notes rendered as Markdown inside Tailwind `prose`
//              (headings, lists, links, embedded images) — Kenhub/Notion feel.
//   • Below  : an inline MCQ-only "test yourself" quiz (see McqQuiz.jsx).
//
// If a lecture has no notes, a friendly on-brand placeholder is shown instead.
// Data comes from the live `lectures` table.
// ===========================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, Loader2, FileText,
} from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import PageTransition from "./PageTransition";
import { useAuth } from "./AuthProvider";
import McqQuiz from "./McqQuiz";
import LectureContent from "./LectureContent";

// Turn a YouTube watch/share URL into an embeddable URL (or null if unknown).
function toEmbedUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (u.searchParams.get("v")) return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
    if (u.pathname.startsWith("/embed/")) return url;
    return null;
  } catch {
    return null;
  }
}

function TopBar({ onBack }) {
  return (
    <header className="sticky top-0 z-20 border-b border-gray-200/70 bg-white/85 backdrop-blur-md dark:border-white/10 dark:bg-[#0e172a]/95">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <Link to="/" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-med-primary">
          <img src="/logo-wordmark.png" alt="Med Hub" className="h-7 w-auto object-contain" />
        </Link>
      </div>
    </header>
  );
}

function NotFound({ onBack }) {
  return (
    <div className="min-h-screen bg-med-bg dark:bg-[#0e172a]">
      <TopBar onBack={onBack} />
      <div className="mx-auto max-w-5xl px-5 py-24 text-center">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Lecture not found</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-slate-300">This lecture doesn't exist or hasn't been published yet.</p>
        <button
          onClick={onBack}
          className="btn-premium mt-6 inline-flex items-center gap-1.5 rounded-xl bg-med-primary px-5 py-3 text-sm font-semibold text-white hover:bg-[#1577B0]"
        >
          <ArrowLeft className="h-4 w-4" /> Back to portal
        </button>
      </div>
    </div>
  );
}

// Friendly placeholder when lecture.notes is empty.
function NotesPlaceholder() {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-12 text-center dark:border-white/10 dark:bg-white/5">
      <FileText className="mx-auto h-9 w-9 text-gray-400 dark:text-slate-300" />
      <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-slate-100">Notes coming soon</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-gray-500 dark:text-slate-300">
        The written guide for this lecture hasn't been published yet. In the
        meantime, watch the video above or try the quiz below.
      </p>
    </div>
  );
}

export default function LectureView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [lecture, setLecture] = useState(null);

  // Quiz CTA plumbing: McqQuiz reports whether a quiz exists (gates the CTA),
  // and the CTA scrolls to the quiz section via ref — no hardcoded offsets.
  const [hasQuiz, setHasQuiz] = useState(false);
  const mcqRef = useRef(null);
  const reduced = useReducedMotion();
  const scrollToQuiz = useCallback(() => {
    mcqRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [reduced]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from("lectures")
      .select("id, title, youtube_url, notes, course_id")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setLecture(data || null);
        setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  // History tracking: upsert a lecture_progress row on visit. Fire-and-forget —
  // a failed tracking write must never break the lecture page.
  useEffect(() => {
    if (!lecture?.id || !user?.id) return;
    supabase
      .from("lecture_progress")
      .upsert(
        {
          user_id: user.id,
          lecture_id: lecture.id,
          course_id: lecture.course_id,
          last_accessed: new Date().toISOString(),
        },
        { onConflict: "user_id,lecture_id" }   // re-visits update the same row
      )
      .then(({ error }) => {
        // eslint-disable-next-line no-console
        if (error) console.warn("[progress] visit upsert failed:", error.message);
      });
  }, [lecture?.id, lecture?.course_id, user?.id]);

  // On quiz completion: mark complete + refresh last_accessed, keeping the
  // HIGHER mcq_score across attempts (only overwrite the score if it improved).
  const handleQuizComplete = useCallback(async ({ score, total }) => {
    if (!lecture?.id || !user?.id) return;
    try {
      const { data: existing } = await supabase
        .from("lecture_progress")
        .select("mcq_score")
        .eq("user_id", user.id)
        .eq("lecture_id", lecture.id)
        .maybeSingle();

      const keepOld = existing && existing.mcq_score != null && existing.mcq_score >= score;
      const payload = {
        user_id: user.id,
        lecture_id: lecture.id,
        course_id: lecture.course_id,
        is_completed: true,
        last_accessed: new Date().toISOString(),
      };
      if (!keepOld) {
        payload.mcq_score = score;
        payload.mcq_total = total;
      }
      await supabase.from("lecture_progress").upsert(payload, { onConflict: "user_id,lecture_id" });
    } catch {
      /* tracking must never break the page */
    }
  }, [lecture?.id, lecture?.course_id, user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-med-bg dark:bg-[#0e172a]">
        <TopBar onBack={() => navigate(-1)} />
        <div className="flex items-center justify-center py-32 text-gray-400 dark:text-slate-300">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      </div>
    );
  }

  if (!lecture) return <NotFound onBack={() => navigate("/dashboard")} />;

  const embedUrl = toEmbedUrl(lecture.youtube_url);
  const hasNotes = Boolean(lecture.notes && lecture.notes.trim());

  return (
    <div className="min-h-screen bg-med-bg dark:bg-[#0e172a]">
      <TopBar onBack={() => navigate(-1)} />

      {/* animate-enter dropped: PageTransition now owns the entry motion */}
      <PageTransition as="main" className="mx-auto w-full max-w-3xl px-5 pb-16 pt-8">
        {/* title */}
        <h1 className="text-3xl sm:text-4xl font-semibold leading-tight tracking-tight text-gray-900 dark:text-slate-100">
          {lecture.title}
        </h1>

        {/* video — only when a URL exists */}
        {embedUrl && (
          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200/80 bg-black shadow-sm">
            <iframe
              className="aspect-video w-full"
              src={embedUrl}
              title={lecture.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        {/* reading content */}
        <article className="mt-10">
          {hasNotes ? <LectureContent markdown={lecture.notes} /> : <NotesPlaceholder />}
        </article>

        {/* quiz CTA — only when a quiz actually exists (McqQuiz reports it).
            Hover glow gated by reduced motion; scroll respects it too. */}
        {hasQuiz && (
          <motion.button
            type="button"
            onClick={scrollToQuiz}
            className="mt-10 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1B98E0] px-6 py-4 text-lg font-bold text-white shadow-lg shadow-[#1B98E0]/25 border border-[#1B98E0]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B98E0] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0e172a]"
            whileHover={reduced ? undefined : { scale: 1.02, boxShadow: "0 0 28px rgba(27, 152, 224, 0.45)" }}
            whileTap={reduced ? undefined : { scale: 0.98 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            قيّم فهمك الآن 🧠
          </motion.button>
        )}

        {/* inline MCQ-only quiz (renders nothing if the lecture has no mcq
            quiz). whileInView reveal wraps it WITHOUT touching its internals;
            scroll-mt clears the sticky header when the CTA jumps here. */}
        <motion.div
          ref={mcqRef}
          className="scroll-mt-24"
          initial={reduced ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10% 0px" }}
          transition={{ duration: reduced ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <McqQuiz lectureId={lecture.id} onComplete={handleQuizComplete} onLoaded={setHasQuiz} />
        </motion.div>
      </PageTransition>
    </div>
  );
}
