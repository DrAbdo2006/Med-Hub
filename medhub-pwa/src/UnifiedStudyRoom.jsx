// ===========================================================================
// UnifiedStudyRoom — /study/:deckId
//
// One screen, four study modes (Flashcards / Gaps / Quiz / Images) for a
// single personal deck, as a sticky segmented tab bar over the EXISTING
// flashcards-module views (imported via the additive adapters at the bottom
// of Flashcards.jsx — SM-2, grading, and offline-sync internals unchanged).
//
// State preservation (the critical requirement): every mode with content is
// MOUNTED once and kept mounted; tab switches only toggle a `hidden` class.
// A student on card 7/20 can peek at Quiz and come back to card 7/20 — no
// unmount, no re-fetch, no session reset. (display:none also hides StudyView's
// fixed bottom grading bar, so hidden panes never overlay the active one.)
//
// Sync safety: the offline outbox engine is module-scoped and started here
// too (startSync is idempotent); it flushes in the background regardless of
// which tab is active and is never torn down on tab changes.
//
// Direction: LTR shell (matches the module's English chrome); deck titles and
// card content render with dir="auto" inside the existing views, so Arabic
// text stays RTL where it should be.
// ===========================================================================
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Layers, AlignLeft, ListChecks, Image as ImageIcon } from "lucide-react";
import { useMedHubStore } from "./useMedHubStore";
import { startSync } from "./lib/sync";
import PageTransition from "./PageTransition";
import { StudyRoomChrome, StudyPane, OcclusionPane } from "./Flashcards.jsx";

const MODES = [
  { key: "cards", label: "Flashcards", icon: Layers, paneMode: "flip" },
  { key: "gaps", label: "Gaps", icon: AlignLeft, paneMode: "gap" },
  { key: "quiz", label: "Quiz", icon: ListChecks, paneMode: "quiz" },
  { key: "images", label: "Images", icon: ImageIcon, paneMode: null },
];

function hasContent(key, deck, occ) {
  if (!deck) return false;
  if (key === "cards") return (deck.cards?.length || 0) > 0;
  if (key === "gaps") return (deck.gaps?.length || 0) > 0;
  if (key === "quiz") return (deck.mcqs?.length || 0) > 0;
  return occ.some((o) => (o.shapes?.length || 0) > 0);
}

export default function UnifiedStudyRoom() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const { loading, decks, occlusions } = useMedHubStore();

  // Keep the offline sync engine alive independent of tabs (idempotent).
  useEffect(() => startSync(), []);

  const deck = decks.find((d) => d.id === deckId) || null;
  const occ = occlusions.filter((o) => o.projectId === deckId);
  const tabs = MODES.map((m) => ({ ...m, enabled: hasContent(m.key, deck, occ) }));
  const anyContent = tabs.some((t) => t.enabled);

  // Default to the FIRST mode that actually has content — never an empty tab.
  const [activeTab, setActiveTab] = useState(null);
  useEffect(() => {
    if (loading || activeTab) return;
    const first = tabs.find((t) => t.enabled);
    if (first) setActiveTab(first.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, activeTab, deck, occlusions]);

  return (
    <div className="min-h-screen bg-med-bg dark:bg-[#0e172a]">
      {/* sticky header: back + deck title + segmented tabs */}
      <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-white/85 backdrop-blur-md dark:border-white/10 dark:bg-[#0e172a]/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 pt-3">
          <button
            onClick={() => navigate("/flashcards")}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {/* dir=auto: Arabic deck titles read RTL inside the LTR shell */}
          <h1 dir="auto" className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
            {deck ? deck.title : ""}
          </h1>
        </div>
        {/* tab row — LTR, horizontally scrollable, hidden scrollbar, ≥44px
            targets (same pattern as the dashboard subject nav) */}
        <nav dir="ltr" className="no-scrollbar mx-auto max-w-5xl overflow-x-auto whitespace-nowrap px-5 py-2.5" aria-label="Study modes">
          <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/10">
            {tabs.map((t) => {
              const active = activeTab === t.key;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => t.enabled && setActiveTab(t.key)}
                  disabled={!t.enabled}
                  title={t.enabled ? t.label : `${t.label} — no content in this deck yet`}
                  aria-pressed={active}
                  className={
                    "inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors " +
                    (active
                      ? "bg-[#1B98E0] text-white shadow-sm"
                      : t.enabled
                        ? "text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-white/10"
                        : "cursor-not-allowed text-slate-400 opacity-40 dark:text-slate-500")
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <PageTransition className="mx-auto w-full max-w-5xl px-4 py-8">
        <StudyRoomChrome>
          {loading ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <div className="h-10 w-10 rounded-full border-2 border-med-primary/30 border-t-med-primary animate-spin" />
            </div>
          ) : !deck ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
              <p className="text-sm font-semibold text-slate-700">Deck not found</p>
              <p className="mt-1 text-sm text-slate-400">It may have been deleted on another device.</p>
            </div>
          ) : !anyContent ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
              <Layers className="mx-auto h-8 w-8 text-med-primary" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-slate-700">Nothing to study in this deck yet</p>
              <p className="mt-1 text-sm text-slate-400">Add flashcards, gaps, quiz questions, or an image board first.</p>
            </div>
          ) : (
            // Every enabled pane stays MOUNTED; only visibility toggles.
            tabs.map(
              (t) =>
                t.enabled && (
                  <div key={t.key} className={activeTab === t.key ? "" : "hidden"}>
                    {t.key === "images" ? (
                      <OcclusionPane deckId={deckId} />
                    ) : (
                      <StudyPane deckId={deckId} mode={t.paneMode} />
                    )}
                  </div>
                )
            )
          )}
        </StudyRoomChrome>
      </PageTransition>
    </div>
  );
}
