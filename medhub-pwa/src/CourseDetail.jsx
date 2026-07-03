// ===========================================================================
// CourseDetail — the /course/:id page.
//
// Fetches a course and its lectures, then shows the lectures as a premium
// visual card grid (YouTube/Udemy feel). Clicking a card routes to /lecture/:id.
// Handles loading (skeleton grid), not-found, and empty states.
//
// Thumbnail resolution per card (robust):
//   1. lecture.thumbnail_url (if a non-empty string)
//   2. YouTube thumbnail derived from lecture.youtube_url (maxres -> hq)
//   3. branded gradient placeholder (never a blank/grey box)
// YouTube serves a 120x90 grey image (not a 404) when a thumb is missing, so we
// detect that via naturalWidth on load and fall through, in addition to onError.
// ===========================================================================
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Play, Video, BookOpen, CheckCircle2 } from "lucide-react";
import { supabase } from "./lib/supabaseClient";
import { useAuth } from "./AuthProvider";
import { getYouTubeId, youtubeThumb } from "./lib/youtube";
import PageTransition from "./PageTransition";

// Completion success green. The Med Hub palette has no success token, so this
// is an arbitrary hex (PALETTE_CSS only remaps emerald-*/rose-* class names,
// not arbitrary values). Proposed token if we want to formalise it: med-success.
const SUCCESS = "#0E9F6E";

// Per-state card frame. border-2 on every state so width is identical and the
// grid never shifts when a card changes state.
const FRAME = {
  not_started: "border-2 border-med-lines/30",   // neutral/subtle (med-lines token, low opacity)
  in_progress: "border-2 border-med-primary",    // opened, not finished
  completed: "border-2",                          // success green via inline style below
};

/* -------------------------------------------------- shared chrome */
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

/* -------------------------------------------------- thumbnail */
function ThumbPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-med-primary to-[#0f5e8c]">
      <Video className="h-10 w-10 text-white/85" aria-hidden="true" />
    </div>
  );
}

function Thumbnail({ lecture, priority = false }) {
  // Build the ordered list of image candidates once per lecture.
  // Use hqdefault (480x360) — right-sized for a card; avoids fetching the
  // full-res maxresdefault (1280x720), which is heavier and often missing.
  const candidates = useMemo(() => {
    const list = [];
    const explicit = lecture.thumbnail_url?.trim();
    if (explicit) list.push({ src: explicit, yt: false });
    const id = getYouTubeId(lecture.youtube_url);
    if (id) list.push({ src: youtubeThumb(id, "hqdefault"), yt: true });
    return list;
  }, [lecture.thumbnail_url, lecture.youtube_url]);

  const [idx, setIdx] = useState(0);
  const current = candidates[idx];

  // Past the end of the candidate list -> branded placeholder (never grey).
  if (!current) return <ThumbPlaceholder />;

  const next = () => setIdx((i) => i + 1);
  // YouTube's "missing" image is 120x90 and loads successfully (no onError),
  // so treat a tiny natural width as a miss and fall through.
  const handleLoad = (e) => {
    if (current.yt && e.currentTarget.naturalWidth <= 120) next();
  };

  return (
    <img
      src={current.src}
      alt={lecture.title}
      // First row is above the fold (LCP) -> load eagerly; rest lazy.
      loading={priority ? "eager" : "lazy"}
      fetchpriority={priority ? "high" : "auto"}
      decoding="async"
      onError={next}
      onLoad={handleLoad}
      className="h-full w-full object-cover"
    />
  );
}

/* -------------------------------------------------- card + skeleton */
function LectureCard({ lecture, state, onOpen, priority = false }) {
  const isCompleted = state === "completed";
  const description = lecture.description?.trim();
  const stateLabel =
    state === "completed" ? " (completed)" : state === "in_progress" ? " (in progress)" : "";

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open lecture: ${lecture.title}${stateLabel}`}
      style={isCompleted ? { borderColor: SUCCESS } : undefined}
      className={`card-premium group flex w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-med-primary focus-visible:ring-offset-2
                 ${FRAME[state] || FRAME.not_started}`}
    >
      {/* image — aspect-video reserves space so there's no layout shift */}
      <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl bg-gray-100 dark:bg-white/10">
        <Thumbnail lecture={lecture} priority={priority} />
        {/* completed badge — a non-color signal too (icon + text) for a11y */}
        {isCompleted && (
          <span
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-white shadow-sm"
            style={{ backgroundColor: SUCCESS }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Done
          </span>
        )}
      </div>
      {/* content */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-3">
          <h3 className="line-clamp-2 flex-1 text-sm font-semibold leading-snug text-gray-900 dark:text-slate-100">
            {lecture.title}
          </h3>
          <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-med-primary/10 text-med-primary transition-colors group-hover:bg-med-primary group-hover:text-white">
            <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
          </span>
        </div>
        {description && (
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-gray-500 dark:text-slate-300">{description}</p>
        )}
      </div>
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white dark:border-white/10 dark:bg-white/10 shadow-sm">
      <div className="aspect-video w-full animate-pulse bg-gray-200 dark:bg-white/10" />
      <div className="space-y-2 p-4">
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
        <div className="h-3.5 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
      </div>
    </div>
  );
}

const GRID = "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3";

/* -------------------------------------------------- page */
export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState(null);
  const [lectures, setLectures] = useState([]);
  // O(1) lookup: lecture_id -> { is_completed } for this course + user.
  const [progress, setProgress] = useState({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const [{ data: courseData }, { data: lectureData }, { data: progressRows }] = await Promise.all([
        supabase.from("courses").select("id, title, description").eq("id", id).maybeSingle(),
        supabase
          .from("lectures")
          .select("id, title, description, youtube_url, thumbnail_url, sort_order")
          .eq("course_id", id)
          .order("sort_order", { ascending: true }),
        // One query for the whole course's progress (no per-card fetch / N+1).
        user?.id
          ? supabase
              .from("lecture_progress")
              .select("lecture_id, is_completed")
              .eq("course_id", id)
              .eq("user_id", user.id)
          : Promise.resolve({ data: [] }),
      ]);
      if (!active) return;
      const map = {};
      for (const r of progressRows || []) map[r.lecture_id] = r;
      setCourse(courseData || null);
      setLectures(lectureData || []);
      setProgress(map);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [id, user?.id]);

  // Three states: no row -> not_started; row + !is_completed -> in_progress;
  // row + is_completed -> completed.
  const stateOf = (lectureId) => {
    const row = progress[lectureId];
    if (!row) return "not_started";
    return row.is_completed ? "completed" : "in_progress";
  };

  // loading -> skeleton grid (matches the real grid, no layout shift)
  if (loading) {
    return (
      <div className="min-h-screen bg-med-bg dark:bg-[#0e172a]">
        <TopBar onBack={() => navigate(-1)} />
        <PageTransition as="main" className="mx-auto max-w-5xl px-5 pb-16">
          <div className="mt-8 space-y-2">
            <div className="h-7 w-56 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
            <div className="h-4 w-80 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
          </div>
          <div className={`mt-8 ${GRID}`}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </PageTransition>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-med-bg dark:bg-[#0e172a]">
        <TopBar onBack={() => navigate("/dashboard")} />
        <div className="mx-auto max-w-5xl px-5 py-24 text-center">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Course not found</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-slate-300">This course doesn't exist or hasn't been published yet.</p>
          <button
            onClick={() => navigate("/dashboard")}
            className="btn-premium mt-6 inline-flex items-center gap-1.5 rounded-xl bg-med-primary px-5 py-3 text-sm font-semibold text-white hover:bg-[#1577B0]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-med-bg dark:bg-[#0e172a]">
      <TopBar onBack={() => navigate(-1)} />

      <PageTransition as="main" className="mx-auto max-w-5xl px-5 pb-16">
        <header className="animate-enter mt-8">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-100">{course.title}</h1>
          {course.description && (
            <p className="mt-2 max-w-2xl leading-relaxed text-gray-600 dark:text-slate-300">{course.description}</p>
          )}
          <p className="mt-3 text-sm text-gray-500 dark:text-slate-300">
            {lectures.length} lecture{lectures.length === 1 ? "" : "s"}
          </p>
        </header>

        <section className="mt-8">
          {lectures.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-12 text-center dark:border-white/10 dark:bg-white/5">
              <BookOpen className="mx-auto h-8 w-8 text-gray-400 dark:text-slate-300" />
              <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-slate-100">No lectures yet</h3>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-gray-500 dark:text-slate-300">
                This course doesn't have any lectures published yet.
              </p>
            </div>
          ) : (
            <div className={GRID}>
              {lectures.map((lec, i) => (
                <div key={lec.id} className="animate-enter flex" style={{ "--stagger": i }}>
                  <LectureCard
                    lecture={lec}
                    state={stateOf(lec.id)}
                    priority={i < 3}   /* first row (lg=3 cols) is above the fold */
                    onOpen={() => navigate(`/lecture/${lec.id}`)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </PageTransition>
    </div>
  );
}
