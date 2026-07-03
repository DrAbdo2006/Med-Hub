// ===========================================================================
// RouteBoundary — error boundary + Suspense wrapper for lazy routes.
//
// Why: with React.lazy, a chunk fetch can fail (flaky network, or a NEW deploy
// invalidating the old chunk URLs while a tab is still open). Without a boundary
// that shows a white screen. This catches the error and offers Retry (re-mounts
// the children so the import is attempted again) and a hard Reload (pulls the
// latest index.html / chunk manifest).
//
// It also provides the Suspense fallback (an on-brand spinner) so there's no
// blank flash while a lazy chunk downloads.
// ===========================================================================
import { Component, Suspense } from "react";

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-med-bg dark:bg-[#0e172a]">
      <div className="h-10 w-10 rounded-full border-2 border-med-primary/30 border-t-med-primary animate-spin" />
    </div>
  );
}

class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error("[route] failed to load:", error);
  }
  retry = () => this.setState({ error: null });
  reload = () => window.location.reload();

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-med-bg dark:bg-[#0e172a] px-5">
          <div className="max-w-sm rounded-2xl border border-gray-200/80 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-white/10">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Couldn't load this page</h1>
            <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-300">
              Check your connection and try again. If the app was just updated, reloading fixes it.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={this.retry}
                className="btn-premium rounded-lg bg-med-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1577B0]"
              >
                Retry
              </button>
              <button
                onClick={this.reload}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors dark:border-white/10 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/10"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function RouteBoundary({ children }) {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<Spinner />}>{children}</Suspense>
    </ChunkErrorBoundary>
  );
}
