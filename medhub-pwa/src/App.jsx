// ===========================================================================
// App — the application router.
//
// Structure:
//   <BrowserRouter>
//     <AuthProvider>            session/profile context for the whole tree
//       /           -> LandingPage         (public — marketing front door)
//       /login      -> AuthPage            (public)
//       /dashboard  -> PortalHome          (protected — the student portal)
//       /course/:id -> CourseDetail        (protected)
//       /lecture/:id-> LectureView         (protected)
//       /flashcards -> StudyModule         (protected — personal flashcards
//                      tool; old /course redirects here)
//       /admin      -> AdminDashboard      (protected + admin-only)
//       *           -> redirect to / (public landing; it offers "Go to
//                      Dashboard" when a session exists)
//
// Protected routes sit under <ProtectedRoute/> (must be logged in). The admin
// panel sits additionally under <RequireAdmin/>, which redirects non-admins
// away — the UI guard mirrors the is_admin() RLS that actually protects writes.
// ===========================================================================
import { lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthProvider";
import ProtectedRoute from "./ProtectedRoute";
import RouteBoundary from "./RouteBoundary";

// Route components are code-split with React.lazy so the heavy stacks load only
// when their route is visited. In particular this keeps the Markdown parser +
// KaTeX (LectureView / AdminDashboard→LectureEditor) and the large Flashcards
// study module (StudyModule) OUT of the entry bundle.
//
// EXCEPTION — LandingPage loads EAGERLY: it's the public first paint at "/",
// so its first render shouldn't wait on a second network round-trip. All
// internal (auth-gated) routes stay lazy behind RouteBoundary, which already
// provides the Suspense spinner + failed-chunk Retry/Reload fallback.
import LandingPage from "./LandingPage";
const AuthPage = lazy(() => import("./AuthPage"));
const PortalHome = lazy(() => import("./PortalHome"));
const CourseDetail = lazy(() => import("./CourseDetail"));
const LectureView = lazy(() => import("./LectureView"));
const StudyModule = lazy(() => import("./StudyModule"));
const UnifiedStudyRoom = lazy(() => import("./UnifiedStudyRoom"));
const AdminDashboard = lazy(() => import("./AdminDashboard"));
const Profile = lazy(() => import("./Profile"));

// Root gate for "/". Authenticated users skip the marketing landing and go
// straight to the dashboard. Critically, it waits for the ASYNC session check
// to RESOLVE (loading) before deciding: on first render the session is still
// loading (not "logged out"), so gating on `loading` avoids both the
// logged-in-user landing flash and any redirect loop. AuthProvider already
// subscribes to onAuthStateChange, so this re-renders the moment auth is
// confirmed. Scoped to "/" ONLY — deep links stay under ProtectedRoute, so a
// logged-in user opening /lecture/123 lands there, not the dashboard.
function RootRoute() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-med-bg dark:bg-[#0e172a]">
        <div className="h-10 w-10 rounded-full border-2 border-med-primary/30 border-t-med-primary animate-spin" />
      </div>
    );
  }
  if (session) return <Navigate to="/dashboard" replace />;
  return <LandingPage />;
}

// Admin gate. Waits for the auth/profile check to resolve (so it never flashes
// the admin UI before the role is known), then redirects non-admins home.
function RequireAdmin() {
  const { loading, isAdmin } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-med-bg">
        <div className="h-10 w-10 rounded-full border-2 border-med-primary/30 border-t-med-primary animate-spin" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* One boundary handles lazy-chunk loading (spinner) + load failures
            (retry/reload), so a flaky network or a fresh deploy never white-screens. */}
        <RouteBoundary>
          <Routes>
            {/* public — landing stays OUTSIDE the auth guard; RootRoute only
                auto-forwards ALREADY-authenticated visitors to the dashboard */}
            <Route path="/" element={<RootRoute />} />
            <Route path="/login" element={<AuthPage />} />

            {/* protected */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<PortalHome />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/course/:id" element={<CourseDetail />} />
              <Route path="/lecture/:id" element={<LectureView />} />
              {/* personal flashcards tool (user-generated, Anki-style).
                  Old bare /course URL redirects here so bookmarks keep working. */}
              <Route path="/flashcards" element={<StudyModule />} />
              <Route path="/course" element={<Navigate to="/flashcards" replace />} />
              {/* Unified Study Room — all four modes for one deck, tabbed */}
              <Route path="/study/:deckId" element={<UnifiedStudyRoom />} />

              {/* admin-only */}
              <Route element={<RequireAdmin />}>
                <Route path="/admin" element={<AdminDashboard />} />
              </Route>
            </Route>

            {/* anything else -> public landing (no auth surprise on bad URLs) */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RouteBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
