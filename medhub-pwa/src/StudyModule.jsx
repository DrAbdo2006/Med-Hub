// ===========================================================================
// StudyModule — the protected /flashcards route (old /course redirects here).
//
// Wraps the existing Flashcards/SM-2 application (Flashcards.jsx default export)
// with a slim top bar that links back to the portal. The study app itself is
// untouched — all its IndexedDB / spaced-repetition logic keeps working exactly
// as before; we only frame it.
// ===========================================================================
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import FlashcardsApp from "./Flashcards.jsx";
import PageTransition from "./PageTransition";

export default function StudyModule() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-med-bg dark:bg-[#0e172a]">
      <header className="sticky top-0 z-20 border-b border-gray-200/70 bg-white/85 backdrop-blur-md dark:border-white/10 dark:bg-[#0e172a]/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors dark:text-slate-300 dark:hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" /> Back to portal
            </button>
            {/* personal-tool identity: this is YOUR space, not course content */}
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-[#1B98E0]/40 bg-[#1B98E0]/10 px-3 py-1 text-xs font-semibold text-med-primary dark:text-[#63C4F1]">
              صانع البطاقات — مساحتك الخاصة
            </span>
          </div>
          <Link to="/" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-med-primary">
            <img src="/logo-wordmark.png" alt="Med Hub" className="h-7 w-auto object-contain" />
          </Link>
        </div>
      </header>

      {/* The full existing study experience renders here, unmodified. */}
      <PageTransition>
        <FlashcardsApp />
      </PageTransition>
    </div>
  );
}
