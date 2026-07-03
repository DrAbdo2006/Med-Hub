// ===========================================================================
// PageTransition — reusable enter/exit animator for authenticated content.
//
// Used two ways (see ProtectedRoute.jsx for the route-level stage):
//   1. Route changes  — ProtectedRoute wraps the outlet in
//      <AnimatePresence mode="wait"> keyed on pathname; each page wraps its
//      CONTENT (never its header) in <PageTransition>, so headers swap
//      statically while content cross-fades + slides.
//   2. State-driven tabs — PortalHome's Home/subject tabs switch via
//      `activeKey` state (the pathname never changes), so its content is
//      keyed on that state inside its own <AnimatePresence>.
//
// Scroll reset: with mode="wait" the incoming page would inherit the old
// scroll position. Resetting in a mount effect is exactly the right moment —
// the new page mounts only AFTER the old one's exit completes, so the jump
// is invisible (never mid-animation).
//
// Reduced motion: initial={false} + no exit variant means pages render
// instantly with zero exit delay — the scroll reset still applies.
// ===========================================================================
import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";

export default function PageTransition({ as = "div", className = "", children }) {
  const reduced = useReducedMotion();
  const Tag = motion[as] || motion.div;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <Tag
      className={className}
      initial={reduced ? false : { opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: -15 }}
      transition={{ duration: reduced ? 0 : 0.25, ease: "easeOut" }}
    >
      {children}
    </Tag>
  );
}
