// ===========================================================================
// PortalHome — tabbed dashboard (DB-driven), served at /dashboard (protected).
//
// Layout (per wireframe):
//   • Navbar: "MED HUB" brand left; tab nav center; account actions right
//     (no email shown — just admin link when applicable + Sign out).
//   • Conditional main content driven by `activeKey` (defaults to "home"):
//       - "home"        -> welcome + study tips, NO course/lecture cards.
//       - a subject tab -> a responsive CSS grid of COURSE cards for that
//                          subject. Clicking a course routes to /course/:id.
//
// Tabs come from public.subjects and courses from public.courses (filtered by
// subject_id) — nothing is hardcoded, so admin-added subjects/courses appear
// automatically. See migration 0002_subjects.sql.
// ===========================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LogOut, ShieldCheck, ArrowRight, BookOpen, Loader2, Layers,
  PlayCircle, GraduationCap, Settings,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "./AuthProvider";
import { supabase } from "./lib/supabaseClient";
import PageTransition from "./PageTransition";
import { getYouTubeId, youtubeThumb } from "./lib/youtube";
import ThemeToggle from "./ThemeToggle";

function displayName(user, profile) {
  return profile?.full_name || user?.email?.split("@")[0] || "there";
}

/* -------------------------------------------------- navbar */
// Row 2 — category sub-nav. Its own horizontally-scrollable row so the subject
// links never squish against the brand/utility buttons on mobile/tablet.
// dir="ltr" is set explicitly so the tabs read strictly Home → Anatomy →
// Pathology from the LEFT edge (matching the LTR header around it),
// regardless of the ambient page direction. Direction is set here — NOT via
// justify-* classes, whose meaning flips under RTL.
function SubjectTabs({ tabs, activeKey, onSelect }) {
  const scrollerRef = useRef(null);
  const activeRef = useRef(null);
  const [fade, setFade] = useState({ start: false, end: false }); // start = LTR left edge

  // Show a fade only on the edge(s) that actually hide content. Math.abs()
  // keeps the "scrolled" amount direction-agnostic (harmless under LTR, and
  // still correct if this row ever flips back to RTL).
  const updateFade = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) return setFade({ start: false, end: false });
    const scrolled = Math.abs(el.scrollLeft);
    setFade({ start: scrolled > 1, end: scrolled < max - 1 });
  }, []);

  useEffect(() => {
    updateFade();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateFade, { passive: true });
    window.addEventListener("resize", updateFade);
    return () => {
      el.removeEventListener("scroll", updateFade);
      window.removeEventListener("resize", updateFade);
    };
  }, [updateFade, tabs.length]);

  // Bring the active tab into view on load / tab change (RTL-safe, reduced-motion aware).
  useEffect(() => {
    const node = activeRef.current;
    if (!node) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ inline: "center", block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [activeKey, tabs.length]);

  return (
    <div className="relative border-t border-gray-200/60 dark:border-white/5">
      {/* edge fades — start = physical LEFT (LTR start), end = physical right.
          (Swapped along with the dir flip: under LTR, scrolled-past content
          hides on the left, upcoming content on the right.) */}
      <div
        aria-hidden="true"
        className={
          "pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-white/95 to-transparent transition-opacity duration-200 dark:from-[#0e172a]/95 " +
          (fade.start ? "opacity-100" : "opacity-0")
        }
      />
      <div
        aria-hidden="true"
        className={
          "pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-white/95 to-transparent transition-opacity duration-200 dark:from-[#0e172a]/95 " +
          (fade.end ? "opacity-100" : "opacity-0")
        }
      />
      <nav
        ref={scrollerRef}
        dir="ltr"
        className="no-scrollbar mx-auto flex w-full max-w-6xl items-center justify-start overflow-x-auto whitespace-nowrap px-5 py-2"
      >
        <ul className="flex items-center gap-2">
          {tabs.map((tab) => {
            const active = tab.key === activeKey;
            return (
              <li key={tab.key} className="shrink-0">
                <button
                  ref={active ? activeRef : null}
                  onClick={() => onSelect(tab.key)}
                  className={
                    "relative flex min-h-[44px] items-center rounded-lg px-4 text-sm font-medium transition-colors " +
                    (active
                      ? "text-med-primary"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-white/10")
                  }
                >
                  {tab.name}
                  {active && (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-med-primary" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function Navbar({ tabs, activeKey, onSelect, isAdmin, onSignOut, onAdmin, onProfile }) {
  return (
    <header className="sticky top-0 z-20 border-b border-gray-200/70 bg-white/85 backdrop-blur-md dark:border-white/10 dark:bg-[#0e172a]/95">
      {/* Row 1 — brand (start) + utility buttons (end) */}
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* brand — links to the public landing page */}
          <Link
            to="/"
            className="text-2xl font-extrabold tracking-tight select-none flex items-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-med-primary"
          >
            <span className="text-slate-900 dark:text-white">MED</span>
            <span className="text-[#1B98E0] ml-1.5">HUB</span>
          </Link>

          {/* account — email intentionally removed; spacing preserved */}
          <div className="flex items-center gap-2">
            {/* personal tool — deliberately accent-tinted (unlike the neutral
                content tabs) so "your own cards" reads apart from course content */}
            <Link
              to="/flashcards"
              title="صانع البطاقات — مساحتك الخاصة"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1B98E0]/40 bg-[#1B98E0]/10 px-3 py-2 text-sm font-semibold text-med-primary transition-colors hover:bg-[#1B98E0]/20 dark:border-[#1B98E0]/50 dark:text-[#63C4F1] dark:hover:bg-[#1B98E0]/25"
            >
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">صانع البطاقات</span>
            </Link>
            <ThemeToggle />
            {isAdmin && (
              <button
                onClick={onAdmin}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-med-primary hover:bg-med-primary/10 transition-colors"
              >
                <ShieldCheck className="h-4 w-4" /> Admin
              </button>
            )}
            <button
              onClick={onProfile}
              aria-label="Account settings"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors dark:text-slate-300 dark:hover:bg-white/10"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </button>
            <button
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors dark:border-white/10 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Row 2 — subject sub-nav, directly below Row 1 and above the hero banner */}
      <SubjectTabs tabs={tabs} activeKey={activeKey} onSelect={onSelect} />
    </header>
  );
}

/* -------------------------------------------------- Continue Learning (hero) */
function thumbFor(lec) {
  const explicit = lec?.thumbnail_url?.trim();
  if (explicit) return explicit;
  const id = getYouTubeId(lec?.youtube_url);
  return id ? youtubeThumb(id, "hqdefault") : null;
}

function ContinueLearning({ items, onOpen }) {
  if (!items.length) return null;   // no history -> hide entirely (no clutter)
  return (
    <div className="relative mt-8">
      <p className="text-sm font-medium text-white/80">Continue learning</p>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {items.map((it) => {
          const lec = it.lectures;
          const src = thumbFor(lec);
          return (
            <button
              key={it.lecture_id}
              onClick={() => onOpen(it.lecture_id)}
              className="group flex w-60 flex-none items-center gap-3 rounded-xl bg-white/15 p-2 text-left backdrop-blur transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <div className="h-12 w-20 flex-none overflow-hidden rounded-lg bg-white/20">
                {src ? (
                  <img src={src} alt={lec.title} decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <PlayCircle className="h-5 w-5 text-white/85" aria-hidden="true" />
                  </div>
                )}
              </div>
              <span className="line-clamp-2 text-sm font-medium text-white">{lec.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------- My Progress (dashboard) */
function ProgressBar({ pct }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
      <div
        className="h-full rounded-full bg-med-primary transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function CourseProgressCard({ course, onOpen }) {
  return (
    <button
      onClick={() => onOpen(course.id)}
      className="card-premium flex flex-col rounded-2xl border border-gray-200/80 bg-white dark:border-white/10 dark:bg-white/10 p-6 text-left shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-med-primary focus-visible:ring-offset-2"
    >
      <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">{course.title}</h3>
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-slate-300">{course.completed} / {course.total} lectures</span>
          <span className="font-semibold text-med-primary">{course.pct}%</span>
        </div>
        <ProgressBar pct={course.pct} />
      </div>
      <div className="mt-4">
        {course.avg != null ? (
          <span className="inline-flex items-center rounded-full bg-med-primary/10 px-2.5 py-1 text-xs font-semibold text-med-primary">
            Avg MCQ score {course.avg}%
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500 dark:bg-white/10 dark:text-slate-300">
            No quizzes scored yet
          </span>
        )}
      </div>
    </button>
  );
}

function ProgressSkeleton() {
  return (
    <>
      <div className="h-24 w-full max-w-xs rounded-2xl border border-gray-200/80 bg-white dark:border-white/10 dark:bg-white/10 p-6 shadow-sm">
        <div className="h-4 w-32 rounded bg-gray-200 dark:bg-white/10 motion-safe:animate-pulse" />
        <div className="mt-3 h-7 w-12 rounded bg-gray-200 dark:bg-white/10 motion-safe:animate-pulse" />
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-gray-200/80 bg-white dark:border-white/10 dark:bg-white/10 p-6 shadow-sm">
            <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-white/10 motion-safe:animate-pulse" />
            <div className="mt-5 h-2 w-full rounded bg-gray-200 dark:bg-white/10 motion-safe:animate-pulse" />
            <div className="mt-4 h-5 w-24 rounded-full bg-gray-200 dark:bg-white/10 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    </>
  );
}

function MyProgress({ loading, coursesStarted, courses, onOpenCourse }) {
  return (
    <section className="my-10 mb-12">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">My progress</h2>

      {loading ? (
        <div className="mt-5"><ProgressSkeleton /></div>
      ) : coursesStarted === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-gray-300 bg-white/60 p-12 text-center dark:border-white/10 dark:bg-white/5">
          <GraduationCap className="mx-auto h-8 w-8 text-gray-400 dark:text-slate-300" />
          <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-slate-100">No progress yet</h3>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-gray-500 dark:text-slate-300">
            Open a lecture from any subject to start tracking your progress and scores.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 inline-flex flex-col rounded-2xl border border-gray-200/80 bg-white dark:border-white/10 dark:bg-white/10 p-6 shadow-sm">
            <span className="text-sm text-gray-500 dark:text-slate-300">Total courses started</span>
            <span className="mt-1 text-3xl font-semibold text-gray-900 dark:text-slate-100">{coursesStarted}</span>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => (
              <CourseProgressCard key={c.id} course={c} onOpen={onOpenCourse} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------- Home tab */
function HomeDashboard({ name, userId, onOpenLecture, onOpenCourse }) {
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState([]);
  const [coursesStarted, setCoursesStarted] = useState(0);
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setLoading(true);
    (async () => {
      // Two batched reads: recent history (for the hero) + all progress rows.
      const recentReq = supabase
        .from("lecture_progress")
        .select("lecture_id, last_accessed, lectures ( id, title, thumbnail_url, youtube_url )")
        .eq("user_id", userId)
        .order("last_accessed", { ascending: false })
        .limit(3);
      const progReq = supabase
        .from("lecture_progress")
        .select("course_id, lecture_id, is_completed, mcq_score, mcq_total, courses ( id, title )")
        .eq("user_id", userId);

      const [{ data: recentRows }, { data: progRows }] = await Promise.all([recentReq, progReq]);

      // Denominators MUST come from the lectures table, not progress rows.
      const courseIds = [...new Set((progRows || []).map((r) => r.course_id).filter(Boolean))];
      const totals = {};
      if (courseIds.length) {
        const { data: lecRows } = await supabase
          .from("lectures")
          .select("id, course_id")
          .in("course_id", courseIds);
        for (const l of lecRows || []) totals[l.course_id] = (totals[l.course_id] || 0) + 1;
      }

      // Aggregate per course (completed count + average score over completed).
      const byCourse = {};
      for (const r of progRows || []) {
        const cid = r.course_id;
        if (!cid) continue;
        const b = byCourse[cid] || (byCourse[cid] = { id: cid, title: r.courses?.title || "Course", completed: 0, sum: 0, n: 0 });
        if (r.is_completed) b.completed += 1;
        if (r.is_completed && r.mcq_total) { b.sum += r.mcq_score / r.mcq_total; b.n += 1; }
      }
      const cards = Object.values(byCourse)
        .map((b) => {
          const total = totals[b.id] || 0;
          const pct = total > 0 ? Math.min(100, Math.round((b.completed / total) * 100)) : 0;
          const avg = b.n > 0 ? Math.round((b.sum / b.n) * 100) : null;
          return { id: b.id, title: b.title, completed: b.completed, total, pct, avg };
        })
        .sort((a, b) => a.title.localeCompare(b.title));

      if (!active) return;
      setRecent((recentRows || []).filter((r) => r.lectures));
      setCoursesStarted(courseIds.length);
      setCourses(cards);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [userId]);

  return (
    <>
      <section className="animate-enter relative mt-6 overflow-hidden rounded-3xl bg-gradient-to-br from-med-primary to-[#0f5e8c] px-7 py-12 sm:px-12 sm:py-16 text-white shadow-[0_24px_60px_-24px_rgba(27,152,224,0.45)]">
        <div className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-[#1B98E0]/25 blur-3xl" />
        <div className="relative max-w-2xl">
          <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-medium tracking-wide backdrop-blur">
            Welcome back
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl font-semibold leading-tight tracking-tight">
            Hi {name}, ready to study?
          </h1>
          <p className="mt-3 text-white/85 text-lg leading-relaxed">
            Choose a subject from the menu above to browse its courses, or jump
            back into a recent lecture.
          </p>
          <ContinueLearning items={recent} onOpen={onOpenLecture} />
        </div>
      </section>

      <div className="animate-enter" style={{ "--stagger": 2 }}>
        <MyProgress
          loading={loading}
          coursesStarted={coursesStarted}
          courses={courses}
          onOpenCourse={onOpenCourse}
        />
      </div>
    </>
  );
}

/* -------------------------------------------------- course card + grid */
function CourseCard({ course, onOpen, priority = false }) {
  const [broken, setBroken] = useState(false);
  const src = course.thumbnail_url;
  return (
    <button
      onClick={onOpen}
      className="card-premium group flex aspect-square w-full flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white dark:border-white/10 dark:bg-white/10 text-left shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-med-primary focus-visible:ring-offset-2"
    >
      {/* thumbnail (60% height): image when set, else a branded med-primary gradient (never a broken box) */}
      <div className="relative h-3/5 w-full shrink-0 overflow-hidden bg-gradient-to-br from-med-primary to-[#0f5e8c]">
        {src && !broken ? (
          <img
            src={src}
            alt={course.title}
            loading={priority ? "eager" : "lazy"}
            fetchpriority={priority ? "high" : "auto"}
            decoding="async"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Layers className="h-11 w-11 text-white/85 transition-transform group-hover:scale-110" aria-hidden="true" />
          </div>
        )}
      </div>
      {/* info (remaining 40%): title top, "View course" pinned to the bottom */}
      <div className="flex h-2/5 min-h-0 flex-col p-5">
        <h3 dir="auto" className="line-clamp-2 text-base font-semibold text-gray-900 dark:text-slate-100">{course.title}</h3>
        {course.description && (
          <p dir="auto" className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-gray-500 dark:text-slate-300">{course.description}</p>
        )}
        <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-med-primary">
          View course <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
}

function CoursesView({ subjectName, courses, loading, onOpen }) {
  return (
    <section className="animate-enter my-8">
      <div className="mb-5">
        <h2 dir="auto" className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-slate-100">{subjectName}</h2>
        {!loading && (
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-300">
            {courses.length} course{courses.length === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-2xl border border-gray-200/80 bg-white dark:border-white/10 dark:bg-white/10 py-20 text-gray-400 dark:text-slate-300">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 p-12 text-center dark:border-white/10 dark:bg-white/5">
          <BookOpen className="mx-auto h-8 w-8 text-gray-400 dark:text-slate-300" />
          <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-slate-100">No courses yet</h3>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-gray-500 dark:text-slate-300">
            There are no courses in {subjectName} yet. Check back soon.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c, i) => (
            <div key={c.id} className="animate-enter" style={{ "--stagger": i }}>
              <CourseCard course={c} priority={i < 3} onOpen={() => onOpen(c.id)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------- page */
export default function PortalHome() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const [subjects, setSubjects] = useState([]);
  const [activeKey, setActiveKey] = useState("home");     // "home" | subject id
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);

  const name = displayName(user, profile);
  const tabs = [{ key: "home", name: "Home" }, ...subjects.map((s) => ({ key: s.id, name: s.name }))];
  const activeSubject = subjects.find((s) => s.id === activeKey) || null;

  // Load subjects once (these are the tabs).
  useEffect(() => {
    let active = true;
    supabase
      .from("subjects")
      .select("id, name, sort_order")
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          // eslint-disable-next-line no-console
          console.warn("[portal] could not load subjects:", error.message);
          setSubjects([]);
        } else {
          setSubjects(data || []);
        }
      });
    return () => { active = false; };
  }, []);

  // Load courses whenever a subject tab is active.
  useEffect(() => {
    if (activeKey === "home") { setCourses([]); return; }
    let active = true;
    setCoursesLoading(true);
    supabase
      .from("courses")
      .select("id, title, description, cover_image_path, thumbnail_url, sort_order")
      .eq("subject_id", activeKey)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          // eslint-disable-next-line no-console
          console.warn("[portal] could not load courses:", error.message);
          setCourses([]);
        } else {
          setCourses(data || []);
        }
        setCoursesLoading(false);
      });
    return () => { active = false; };
  }, [activeKey]);

  return (
    <div className="min-h-screen bg-med-bg dark:bg-[#0e172a]">
      <Navbar
        tabs={tabs}
        activeKey={activeKey}
        onSelect={setActiveKey}
        isAdmin={isAdmin}
        onSignOut={signOut}
        onAdmin={() => navigate("/admin")}
        onProfile={() => navigate("/profile")}
      />

      {/* Tabs switch via `activeKey` STATE (not routes), so the transition is
          keyed on that state — pathname-keyed transitions would never fire
          here. The Navbar sits outside AnimatePresence and never re-mounts.
          `propagate` lets these children also run their exit when the whole
          route unmounts (outer AnimatePresence in ProtectedRoute). */}
      <main className="mx-auto max-w-6xl px-5">
        <AnimatePresence mode="wait" initial={false} propagate>
          {activeKey === "home" ? (
            <PageTransition key="home">
              <HomeDashboard
                name={name}
                userId={user?.id}
                onOpenLecture={(lid) => navigate(`/lecture/${lid}`)}
                onOpenCourse={(cid) => navigate(`/course/${cid}`)}
              />
            </PageTransition>
          ) : (
            <PageTransition key={activeKey}>
              <CoursesView
                subjectName={activeSubject?.name || "Courses"}
                courses={courses}
                loading={coursesLoading}
                onOpen={(id) => navigate(`/course/${id}`)}
              />
            </PageTransition>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
