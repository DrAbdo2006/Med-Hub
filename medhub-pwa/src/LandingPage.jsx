// ===========================================================================
// LandingPage — the public front door at "/".
//
// This is the first truly public page in the app: it renders OUTSIDE the auth
// guard, for logged-out visitors deciding whether to sign up. Logged-in users
// who land here are NOT redirected — they just see "Go to Dashboard" CTAs
// (session comes from useAuth(), which is available because AuthProvider
// wraps every route, public ones included).
//
// Design: a deliberate DARK exception to the app's light #F7F9FA system —
// #0e172a slate canvas, #1B98E0 accent, sparse #C9A86A gold, glassmorphism matching
// the app's existing dark-mode `.glass-panel` language. Every style is scoped
// under `.mh-landing` (same isolation trick Flashcards uses for PALETTE_CSS)
// so nothing leaks into the portal. The one html-level rule (smooth scroll)
// is bound to `html:has(.mh-landing)` inside this component's own <style>, so
// it vanishes the moment the route unmounts.
//
// Motion: framer-motion drives the choreography — parallax hero glow tied to
// scroll position, whileInView scroll-reveals per section (staggered
// children), a magnetic hover on the two primary CTAs (pointer-tracked
// useMotionValue/useSpring, never useState — see design-taste-frontend
// skill §5), and an AnimatePresence-driven scroll-to-top FAB. Every motion
// value collapses to its resting state when useReducedMotion() is true — no
// parallax drift, no stagger delay, no magnetic pull, instant FAB toggle.
// This is a deliberate scope exception to "keep the landing chunk light":
// framer-motion is isolated to this lazy route chunk (App.jsx lazy-imports
// LandingPage), so it never touches the dashboard/portal/study bundles.
//
// Content is Arabic-first: the root carries dir="rtl" lang="ar", with
// Arabic-friendly line-height and zero letter-spacing (never track Arabic).
// ===========================================================================
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUp, Youtube, Instagram } from "lucide-react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  useReducedMotion,
} from "framer-motion";
import { useAuth } from "./AuthProvider";

const LANDING_CSS = `
/* Smooth scroll for the scroll-to-top FAB. Bound to html:has(.mh-landing) so
   it only ever applies while THIS page is mounted — never a blanket html rule
   — and only when motion is welcome. */
@media (prefers-reduced-motion: no-preference) {
  html:has(.mh-landing) { scroll-behavior: smooth; }
}

.mh-landing {
  --l-bg: #0e172a;
  --l-accent: #1B98E0;
  --l-accent-dark: #1577B0;
  --l-accent-light: #63C4F1;
  --l-gold: #C9A86A;
  --l-text: rgba(255, 255, 255, 0.92);
  --l-text-soft: rgba(255, 255, 255, 0.80);
  min-height: 100dvh;
  background-color: var(--l-bg);
  background-image:
    radial-gradient(1100px 560px at 18% -12%, rgba(27, 152, 224, 0.22), transparent 62%),
    radial-gradient(900px 560px at 112% 112%, rgba(1, 12, 40, 0.55), transparent 62%);
  background-attachment: fixed;
  color: var(--l-text);
 font-family: "Vazirmatn", "Public Sans", "Segoe UI", system-ui, -apple-system, "Noto Sans Arabic", sans-serif;
  letter-spacing: 0;
  overflow-x: hidden;
}
.mh-landing *, .mh-landing *::before, .mh-landing *::after { box-sizing: border-box; }
.mh-landing ::selection { background: rgba(27, 152, 224, 0.45); }

.mh-landing .mh-wrap { max-width: 72rem; margin-inline: auto; padding-inline: 1.375rem; }

/* ---------- focus (keyboard) ---------- */
.mh-landing a:focus-visible,
.mh-landing button:focus-visible {
  outline: 2px solid #8fd0f5;
  outline-offset: 3px;
  border-radius: 0.875rem;
}

/* ---------- nav ---------- */
.mh-landing .mh-nav {
  position: sticky; top: 0; z-index: 20;
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(14, 23, 42, 0.72);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
}
.mh-landing .mh-nav-inner {
  display: flex; align-items: center; justify-content: space-between;
  height: 4rem; gap: 1rem;
}
.mh-landing .mh-brand {
  display: inline-flex; align-items: baseline; gap: 0.4rem;
  font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em;
  color: #fff; text-decoration: none; user-select: none;
  direction: ltr;
}
.mh-landing .mh-brand b { color: var(--l-accent); font-weight: 800; }
.mh-landing .mh-nav-cta {
  display: inline-flex; align-items: center; gap: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.08);
  color: #fff; text-decoration: none;
  font-size: 0.875rem; font-weight: 600;
  padding: 0.55rem 1.1rem; border-radius: 0.75rem;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}
.mh-landing .mh-nav-cta:hover { background: rgba(255, 255, 255, 0.16); border-color: rgba(255, 255, 255, 0.45); }

/* ===========================================================================
   Section scaffolding. Each block: its own <section class="mh-sec">, isolated
   stacking context, generous py-24/py-32 rhythm, centered .mh-wrap container
   at z-index 1. Decorative .mh-glow layers sit at z-index 0 with
   pointer-events: none — behind content, never click-blocking.
   =========================================================================== */
.mh-landing .mh-sec {
  position: relative;
  isolation: isolate;
  padding-block: 6rem;                      /* py-24 */
}
@media (min-width: 768px) {
  .mh-landing .mh-sec { padding-block: 8rem; }  /* py-32 */
}
.mh-landing .mh-sec > .mh-wrap { position: relative; z-index: 1; }

/* Storytelling slides — one focused section per screen, vertically centered.
   min-height (never a fixed h-) so tall content grows instead of clipping;
   svh so mobile browser chrome doesn't hide centered content (the vh line is
   a fallback). Padding drops to a modest 3rem: the centering whitespace
   already separates slides, so stacking the 6–8rem rhythm on top would just
   create dead scroll on phones. */
.mh-landing .mh-sec--slide {
  min-height: 85vh;
  min-height: 85svh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-block: 3rem;
}

/* darker band strip — detaches a section from the flat canvas */
.mh-landing .mh-sec--band {
  background: rgba(1, 12, 40, 0.30);
  border-block: 1px solid rgba(255, 255, 255, 0.10);
}

/* decorative glows — always behind content, never interactive */
.mh-landing .mh-glow {
  position: absolute; inset: 0;
  pointer-events: none;
  z-index: 0;
}
.mh-landing .mh-glow--hero { background: radial-gradient(760px 420px at 50% 18%, rgba(27, 152, 224, 0.26), transparent 70%); }
.mh-landing .mh-glow--accent { background: radial-gradient(760px 460px at 50% 42%, rgba(27, 152, 224, 0.20), transparent 70%); }
.mh-landing .mh-glow--side { background: radial-gradient(640px 420px at 12% 30%, rgba(27, 152, 224, 0.16), transparent 70%); }
.mh-landing .mh-glow--gold { background: radial-gradient(520px 320px at 50% 55%, rgba(201, 168, 106, 0.10), transparent 70%); }
.mh-landing .mh-glow--cta { background: radial-gradient(620px 300px at 50% 60%, rgba(27, 152, 224, 0.28), transparent 70%); }

@media (prefers-reduced-transparency: reduce) {
  .mh-landing .mh-card, .mh-landing .mh-nav {
    background: rgba(14, 23, 42, 0.96);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}

/* ---------- hero ----------
   Fills the first screen exactly: 100svh minus the 4rem sticky nav, content
   dead-center. svh (not vh) so mobile browser chrome never clips the centered
   block; the vh line is a fallback for engines without svh. */
.mh-landing .mh-hero {
  min-height: calc(100vh - 4rem);
  min-height: calc(100svh - 4rem);
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-block: 3rem;
  text-align: center;
}
.mh-landing .mh-hero-badge {
  display: inline-flex; align-items: center; gap: 0.5rem;
  border: 1px solid rgba(201, 168, 106, 0.55);
  color: var(--l-gold);
  font-size: 0.8125rem; font-weight: 600;
  padding: 0.4rem 1rem; border-radius: 999px;
  background: rgba(201, 168, 106, 0.08);
}
.mh-landing .mh-hero h1 {
  margin: 1.4rem auto 0;
  max-width: 18ch;
  font-size: clamp(2.1rem, 5.5vw, 3.6rem);
  font-weight: 800; line-height: 1.35; color: #fff;
}
.mh-landing .mh-en { direction: ltr; unicode-bidi: isolate; }
.mh-landing .mh-hero-sub {
  margin: 1.1rem auto 0;
  max-width: 34ch;
  font-size: clamp(1.05rem, 2.4vw, 1.35rem);
  line-height: 1.9; color: var(--l-text-soft);
}
.mh-landing .mh-hero-ctas {
  margin-top: 2.4rem;
  display: flex; flex-wrap: wrap; justify-content: center; gap: 0.9rem;
}

/* primary button — bold 18px white on #1B98E0→#1577B0 gradient (large-text AA).
   Transform (hover scale / magnetic pull) is owned entirely by framer-motion
   on the hero + final CTA instances, so no CSS :hover transform here — it
   would lose to Framer's inline transform anyway. Border-color/box-shadow
   hover still lives in CSS since those aren't transform properties. */
.mh-landing .mh-btn-primary {
  position: relative; overflow: hidden; isolation: isolate;
  display: inline-flex; align-items: center; justify-content: center; gap: 0.6rem;
  background: linear-gradient(135deg, var(--l-accent) 0%, var(--l-accent-dark) 100%);
  color: #fff;
  font: inherit;
  font-size: 1.125rem; font-weight: 700;
  padding: 0.95rem 2.1rem; border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 14px 34px -14px rgba(27, 152, 224, 0.65);
  cursor: pointer;
}
/* ---------- typography helpers ----------
   Section heading/body type is now Tailwind-driven (stacked hierarchy:
   H1 text-4xl→6xl bold, H2 text-2xl→3xl accent, body text-lg→xl slate-300,
   all text-right for RTL). Only the gold underline accent lives here. */
.mh-landing .mh-gold-line {
  width: 3.5rem; height: 3px; border-radius: 999px;
  background: var(--l-gold); margin-top: 0.9rem;
}

/* FEATURES — 3 glass cards over a soft accent glow. Border-color/box-shadow
   hover stays in CSS (non-transform); the lift itself is a framer whileHover
   on the card's y value, so it composes correctly with the scroll-in
   animation instead of fighting it via a duplicate CSS transform. */
.mh-landing .mh-cards {
  margin-top: 2.4rem;
  display: grid; gap: 1.25rem;
}
@media (min-width: 768px) { .mh-landing .mh-cards { grid-template-columns: repeat(3, 1fr); } }
.mh-landing .mh-card {
  border-radius: 1.25rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.13), rgba(255, 255, 255, 0.05));
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 8px 28px -14px rgba(1, 12, 40, 0.55);
  padding: 1.8rem 1.6rem;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}
.mh-landing .mh-card:hover {
  border-color: rgba(27, 152, 224, 0.45);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 20px 40px -18px rgba(27, 152, 224, 0.35);
}
.mh-landing .mh-card .mh-card-emoji { font-size: 2rem; line-height: 1; display: block; }
.mh-landing .mh-card h3 {
  margin: 0.9rem 0 0; font-size: 1.15rem; font-weight: 700; color: #fff; line-height: 1.6;
}
.mh-landing .mh-card p { margin: 0.5rem 0 0; font-size: 0.98rem; line-height: 1.95; color: var(--l-text-soft); }

/* CTA — big animated primary button */
.mh-landing .mh-cta { text-align: center; }
.mh-landing .mh-cta-btn {
  font-size: clamp(1.15rem, 2.6vw, 1.45rem);
  padding: 1.25rem 2.8rem;
  border-radius: 1.25rem;
}
.mh-landing .mh-cta-btn::after {
  content: ""; position: absolute; inset: 0; z-index: -1;
  background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.28) 50%, transparent 70%);
  transform: translateX(-120%);
}

/* ---------- scroll-to-top FAB ----------
   Fixed bottom-right (physical right, deliberately — the single fixed corner
   element on this RTL page). Mount/unmount + transform/opacity are entirely
   owned by framer-motion (AnimatePresence), so no CSS opacity/transform here
   — only static positioning, gradient fill and the non-transform hover
   (background-position shift), which composes fine alongside Framer's scale. */
.mh-landing .mh-fab {
  position: fixed; right: 2rem; bottom: 2rem; z-index: 50;
  width: 3.25rem; height: 3.25rem;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  background: linear-gradient(135deg, var(--l-accent) 0%, var(--l-accent-light) 100%);
  background-size: 160% 160%;
  background-position: 0% 50%;
  color: #fff; cursor: pointer;
  box-shadow: 0 12px 30px -10px rgba(27, 152, 224, 0.7);
}
@media (prefers-reduced-motion: no-preference) {
  .mh-landing .mh-fab { transition: background-position 300ms ease; }
  .mh-landing .mh-fab:hover { background-position: 100% 50%; }
}

/* ---------- footer ---------- */
.mh-landing .mh-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.10);
  padding-block: 1.8rem;
  text-align: center;
  font-size: 0.875rem; color: rgba(255, 255, 255, 0.62);
}

/* CTA shimmer/glow — decorative, independent of the framer choreography,
   still gated behind no-preference. */
@media (prefers-reduced-motion: no-preference) {
  @keyframes mh-shimmer { 0%, 55% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }
  .mh-landing .mh-cta-btn::after { animation: mh-shimmer 3.2s ease-in-out infinite; }
  @keyframes mh-glow {
    0%, 100% { box-shadow: 0 14px 34px -14px rgba(27, 152, 224, 0.65); }
    50% { box-shadow: 0 18px 52px -12px rgba(27, 152, 224, 0.95); }
  }
  .mh-landing .mh-cta-btn { animation: mh-glow 3.2s ease-in-out infinite; }
}
`;

// ---------------------------------------------------------------------------
// Motion variants. Built once per render from the reduced-motion flag so
// every section/child shares one rhythm. When reduced is true, everything
// resolves to its final state with zero duration/offset — the scroll-reveal
// wrapper still exists structurally, it just never animates.
// ---------------------------------------------------------------------------
function useLandingVariants() {
  const reduced = useReducedMotion();
  // Cinematic reveal: 60px rise over 0.9s on ease-out-expo, children spaced
  // 0.28s apart. Every offset/duration/delay collapses to 0 under reduced
  // motion, so sensitive users get final state instantly — no 60px glide.
  const fadeUp = {
    hidden: { opacity: reduced ? 1 : 0, y: reduced ? 0 : 60 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: reduced ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] },
    },
  };
  const stagger = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduced ? 0 : 0.28, delayChildren: reduced ? 0 : 0.1 },
    },
  };
  return { reduced, fadeUp, stagger };
}

// Magnetic hover: pointer position drives spring-eased translation, entirely
// via motion values (never useState — a re-render per pointer-move would
// defeat the point). Resolves to (0, 0) under reduced motion.
function useMagnetic(strength, reduced) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20, mass: 0.5 });
  const springY = useSpring(y, { stiffness: 300, damping: 20, mass: 0.5 });

  const onPointerMove = (e) => {
    if (reduced) return;
    const rect = e.currentTarget.getBoundingClientRect();
    x.set(((e.clientX - (rect.left + rect.width / 2)) / rect.width) * strength);
    y.set(((e.clientY - (rect.top + rect.height / 2)) / rect.height) * strength);
  };
  const onPointerLeave = () => {
    x.set(0);
    y.set(0);
  };

  return { style: { x: springX, y: springY }, onPointerMove, onPointerLeave };
}

// Scroll-to-top FAB. Passive scroll listener with an rAF guard: at most one
// state update per frame, and React bails out anyway when the boolean hasn't
// changed — no jank on fast scroll. AnimatePresence owns the mount/unmount
// motion; smooth-scroll on click only when motion is welcome.
function ScrollTopFab({ reduced }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setVisible(window.scrollY > 400);
      });
    };
    onScroll(); // reflect initial position (e.g. reload mid-page)
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          key="fab"
          onClick={scrollToTop}
          aria-label="Scroll to top"
          className="mh-fab"
          initial={{ opacity: 0, y: reduced ? 0 : 14, scale: reduced ? 1 : 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reduced ? 0 : 14, scale: reduced ? 1 : 0.9 }}
          transition={{ duration: reduced ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
          whileHover={reduced ? undefined : { scale: 1.1 }}
          whileTap={reduced ? undefined : { scale: 0.96 }}
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" strokeWidth={2.5} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

const FEATURES = [
  { emoji: "", title: "فيديو المحاضرة", body: "شرح تفصيلي، خفيف، ولطيف." },
  { emoji: "", title: "اختبر نفسك (MCQ)", body: "كويز ذكي تحت كل محاضرة حتى تقيم فهمك." },
  { emoji: "", title: "محتوى متكامل", body: "صور توضيحية، وصف دقيق، وكل التفاصيل اللي تحتاجها جوا الفيديو." },
];

export default function LandingPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { reduced, fadeUp, stagger } = useLandingVariants();

  // Logged-in visitors go straight to the portal; logged-out visitors go to
  // /login carrying `from: /dashboard` so AuthPage's existing redirect logic
  // continues them into the portal right after signup / sign-in.
  const ctaTo = session ? "/dashboard" : "/login";
  const ctaState = session ? undefined : { from: { pathname: "/dashboard" } };
  const goToCta = () => navigate(ctaTo, { state: ctaState });

  // Parallax: the hero glow drifts down and fades as the page scrolls past
  // it, reinforcing depth without moving any real content. The page scrolls on
  // the window (see ScrollTopFab's window.scrollY listener), so target-less
  // useScroll() is correct for both the parallax and the progress bar.
  const { scrollY, scrollYProgress } = useScroll();
  const heroGlowY = useTransform(scrollY, [0, 800], [0, 220]);
  const heroGlowOpacity = useTransform(scrollY, [0, 550], [1, 0]);

  // Scroll progress bar: spring-smoothed fill. Under reduced motion we bind
  // scaleX straight to scrollYProgress — the bar still tracks position, it
  // just drops the spring lag. (Both hooks run unconditionally; only the
  // binding is conditional.)
  const progressSpring = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });
  const progressScaleX = reduced ? scrollYProgress : progressSpring;

  const heroMagnetic = useMagnetic(16, reduced);
  const ctaMagnetic = useMagnetic(16, reduced);

  return (
    <div dir="rtl" lang="ar" className="mh-landing">
      <style>{LANDING_CSS}</style>

      {/* Scroll progress "comet" — decorative, RTL: anchored right, grows left.
          Because the bar animates via scaleX, its painted gradient compresses
          with it, so the solid end of `to-l` (head, left) always sits at the
          leading edge and the transparent tail spans the filled portion. The
          glow lives on a small head streak pinned at left-0 (rides the leading
          edge for free) rather than on the bar itself, where box-shadow would
          outline the transparent tail too. z-[100] sits above the sticky nav
          (z-20); 3px + pointer-events-none can never intercept a click. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 right-0 z-[100] h-[3px] bg-gradient-to-l from-transparent via-[#1B98E0]/80 to-[#1B98E0]"
        style={{ scaleX: progressScaleX, transformOrigin: "right" }}
      >
        <span className="pointer-events-none absolute left-0 top-0 h-full w-8 rounded-l-full bg-[#63C4F1] shadow-[0_0_12px_#1B98E0]" />
      </motion.div>

      {/* -------------------------------------------------- nav */}
      <header className="mh-nav">
        <div className="mh-wrap mh-nav-inner">
          <Link to="/" className="mh-brand" aria-label="Med Hub — الصفحة الرئيسية">
            MED <b>HUB</b>
          </Link>
          <Link to={ctaTo} state={ctaState} className="mh-nav-cta">
            {session ? "لوحة التحكم" : "تسجيل الدخول"}
          </Link>
        </div>
      </header>

      <main>
        {/* -------------------------------------------------- hero */}
        <section className="mh-sec mh-hero" aria-labelledby="mh-hero-title">
          <motion.div
            className="mh-glow mh-glow--hero"
            aria-hidden="true"
            style={{ y: reduced ? 0 : heroGlowY, opacity: reduced ? 1 : heroGlowOpacity }}
          />
          <motion.div className="mh-wrap" initial="hidden" animate="show" variants={stagger}>
            <motion.p style={{ margin: 0 }} variants={fadeUp}>
              <span className="mh-hero-badge">منصة طبية عربية.. مجانية 100%</span>
            </motion.p>
            <motion.h1 id="mh-hero-title" variants={fadeUp}>
              مرحباً بك في <span className="mh-en">Med Hub</span> 
            </motion.h1>
            <motion.p className="mh-hero-sub" variants={fadeUp}>
              المكان اللي يتحول بيه الطب.. لقصة ممتعة ومفهومة.
            </motion.p>
            <motion.div className="mh-hero-ctas" variants={fadeUp}>
              <motion.button
                type="button"
                onClick={goToCta}
                className="mh-btn-primary"
                style={heroMagnetic.style}
                onPointerMove={heroMagnetic.onPointerMove}
                onPointerLeave={heroMagnetic.onPointerLeave}
                whileHover={reduced ? undefined : { scale: 1.04 }}
                whileTap={reduced ? undefined : { scale: 0.97 }}
              >
                {session ? " أبدأ الآن" : "ابدأ الآن"}
              </motion.button>
            </motion.div>
          </motion.div>
        </section>

        {/* -------------------------------------------------- about (من نحن) */}
        <section id="mh-why" className="mh-sec mh-sec--slide" aria-labelledby="mh-why-title">
          <div className="mh-glow mh-glow--side" aria-hidden="true" />
          <motion.div
            className="mh-wrap"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} className="text-right">
              <h2 id="mh-why-title" className="text-4xl md:text-5xl lg:text-6xl font-bold text-white">من نحن</h2>
              <div className="mh-gold-line" aria-hidden="true" />
            </motion.div>
            <motion.p
              variants={fadeUp}
              className="mt-8 max-w-3xl text-right text-2xl md:text-3xl font-semibold leading-[1.8] text-[#1B98E0]"
            >
              نحن منصة تؤمن بان التعليم حق, وحق من حقوقه ان يكون مجاني حتى لو كان
              المحتوى طبي.
            </motion.p>
            <motion.p
              variants={fadeUp}
              className="mt-6 max-w-3xl text-right text-lg md:text-xl leading-[2.05] text-slate-300"
            >
              من خلال رحلتنا الدراسية بالطب, لاحظنا إن الكورسات الطبية المجانية شبه
              معدومة بالوطن العربي. وبما ان رحلتنا بالمراحل الدراسية السابقة اعتمدت
              على المصادر المجانية للتعليم، استغربنا هذا النقص، وقررنا أن نكون
              التغيير. ومجانية 100%.
            </motion.p>
          </motion.div>
        </section>

        {/* -------------------------------------------------- features */}
        <section className="mh-sec mh-sec--slide" aria-labelledby="mh-features-title">
          <div className="mh-glow mh-glow--accent" aria-hidden="true" />
          <motion.div
            className="mh-wrap"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} className="text-right">
              <h2 id="mh-features-title" className="text-4xl md:text-5xl lg:text-6xl font-bold text-white">ماذا نقدم</h2>
              <div className="mh-gold-line" aria-hidden="true" />
            </motion.div>
            <div className="mh-cards">
              {FEATURES.map((f) => (
                <motion.article
                  key={f.title}
                  className="mh-card"
                  variants={fadeUp}
                  whileHover={reduced ? undefined : { y: -4 }}
                  transition={{ duration: reduced ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <span className="mh-card-emoji" aria-hidden="true">{f.emoji}</span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </motion.article>
              ))}
            </div>
          </motion.div>
        </section>

        {/* -------------------------------------------------- ambition (طموحنا) */}
        <section className="mh-sec mh-sec--slide mh-sec--band" aria-labelledby="mh-ambition-title">
          <motion.div
            className="mh-wrap"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} className="text-right">
              <h2 id="mh-ambition-title" className="text-4xl md:text-5xl lg:text-6xl font-bold text-white">طموحنا</h2>
              <div className="mh-gold-line" aria-hidden="true" />
            </motion.div>
            <motion.p
              variants={fadeUp}
              className="mt-8 max-w-3xl text-right text-lg md:text-xl leading-[2.05] text-slate-300"
            >
              بدأت هاي المنصة بجهد شخصي مني، وأطمح أتوسع وأضم وياي أفضل الطلاب
              والدكاترة. هدفنا مو بس العراق ولا الوطن العربي، طموحنا نكون المنصة
              رقم واحد بالشرق الأوسط. وقريباً جداً، راح نشرح باللغة الإنجليزية حتى
              نوصل لأوروبا وأمريكا.. إحنا هنا حتى نكبر سوية.
            </motion.p>
          </motion.div>
        </section>

        {/* -------------------------------------------------- contact (أنا موجود دائماً) */}
        <section className="mh-sec mh-sec--slide" aria-labelledby="mh-contact-title">
          <div className="mh-glow mh-glow--gold" aria-hidden="true" />
          <motion.div
            className="mh-wrap"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
            variants={stagger}
          >
            <motion.div variants={fadeUp} className="text-right">
              <h2 id="mh-contact-title" className="text-4xl md:text-5xl lg:text-6xl font-bold text-white">أنا موجود دائماً</h2>
              <div className="mh-gold-line" aria-hidden="true" />
            </motion.div>
            <motion.p
              variants={fadeUp}
              className="mt-8 max-w-3xl text-right text-lg md:text-xl leading-[2.05] text-slate-300"
            >
              عندك سؤال؟ أو تحتاج توضيح لأي معلومة؟ تقدر تكتبلي بأي وقت بتعليقات
              اليوتيوب. أقرأ تعليقاتكم، وموجود دائماً حتى أجاوبكم وأدعمكم.
            </motion.p>
          </motion.div>
        </section>

        {/* -------------------------------------------------- final CTA */}
        <section className="mh-sec mh-cta" aria-label="ابدأ الآن">
          <div className="mh-glow mh-glow--cta" aria-hidden="true" />
          <motion.div
            className="mh-wrap"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
            variants={fadeUp}
          >
            <motion.button
              type="button"
              onClick={goToCta}
              className="mh-btn-primary mh-cta-btn group"
              style={ctaMagnetic.style}
              onPointerMove={ctaMagnetic.onPointerMove}
              onPointerLeave={ctaMagnetic.onPointerLeave}
              whileHover={reduced ? undefined : { scale: 1.04 }}
              whileTap={reduced ? undefined : { scale: 0.97 }}
            >
              جرب الآن 
            
            </motion.button>
          </motion.div>
        </section>
      </main>

      <footer className="mh-footer">
        <div className="mh-wrap flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div>
            © {new Date().getFullYear()} <span className="mh-en">Med Hub</span>. نتعلم ونكبر سوية.
          </div>
          {/* social links — fill in the hrefs */}
          <div className="flex items-center gap-2">
            <a
              href="https://www.youtube.com/@MedHuub"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Med Hub on YouTube"
              className="rounded-full p-2 text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-[#63C4F1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8fd0f5]"
            >
              <Youtube className="h-5 w-5" aria-hidden="true" />
            </a>
            <a
              href="https://www.instagram.com/medhuub/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Med Hub on Instagram"
              className="rounded-full p-2 text-white/60 transition-colors duration-200 hover:bg-white/10 hover:text-[#63C4F1] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8fd0f5]"
            >
              <Instagram className="h-5 w-5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </footer>

      <ScrollTopFab reduced={reduced} />
    </div>
  );
}
