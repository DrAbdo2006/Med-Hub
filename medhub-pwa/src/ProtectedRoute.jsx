// ===========================================================================
// ProtectedRoute — gate for authenticated-only routes + the route-transition
// stage.
//
// While the initial session check runs, show a lightweight splash (avoids a
// flash of the login screen for already-signed-in users). Once resolved:
//   - no session  -> redirect to /login (remembering where they were headed)
//   - has session -> render the route inside <AnimatePresence mode="wait">
//     keyed on pathname, so pages that wrap their content in <PageTransition>
//     cross-fade + slide between routes. Scoped HERE (not App.jsx) so the
//     public landing/login pages are untouched.
// ===========================================================================
import { useState } from "react";
import { Navigate, useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "./AuthProvider";

function Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-med-bg dark:bg-[#0e172a]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-2 border-med-primary/30 border-t-med-primary animate-spin" />
        <p className="text-sm text-med-text/70">Loading Med Hub…</p>
      </div>
    </div>
  );
}

// Freezes the outlet element per keyed instance: during an exit animation the
// router already points at the NEW route, so without freezing, the exiting
// copy would re-render as the new page mid-exit.
function FrozenOutlet() {
  const outlet = useOutlet();
  const [frozen] = useState(outlet);
  return frozen;
}

export default function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <FrozenOutlet key={location.pathname} />
    </AnimatePresence>
  );
}
