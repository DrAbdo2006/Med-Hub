// ===========================================================================
// ratingStyles.js — the ONLY place SM-2 rating colors are defined.
// Every surface (grade buttons, in-study controls, MixRow stats, the project
// progress bar, CompleteView boxes) imports from here so colors can't drift.
// All colors are in-system Med Hub tokens, so PALETTE_CSS never remaps them.
// ===========================================================================
export const RATING_META = {
  again: { label: "Again", token: "med-accent",  hex: "#E83151" }, // Red
  hard:  { label: "Hard",  token: "med-text",    hex: "#61636b" }, // Gray
  good:  { label: "Good",  token: "med-primary", hex: "#1B98E0" }, // Blue
  easy:  { label: "Easy",  token: "med-lines",   hex: "#C9A86A" }, // Gold
};
export const RATING_ORDER = ["again", "hard", "good", "easy"];

const tokenOf = (r) => RATING_META[r]?.token || "med-text";

export const label = (r) => RATING_META[r]?.label || r;
export const initial = (r) => (RATING_META[r]?.label || r)[0]; // A / H / G / E

// Per-surface helpers (Tailwind utilities backed by the med-* design tokens).
export const textClass = (r) => `text-${tokenOf(r)}`;
export const bgClass = (r) => `bg-${tokenOf(r)}`;
export const borderClass = (r) => `border-${tokenOf(r)}`;

// Soft tint backgrounds (for stat boxes / chips).
const SOFT = { again: "bg-med-accent-soft", hard: "bg-med-text-soft", good: "bg-med-primary-soft", easy: "bg-med-lines-soft" };
export const softBgClass = (r) => SOFT[r] || "bg-med-text-soft";

// Exact hex for inline fills (progress-bar segments / SVG) — bypasses Tailwind
// entirely, so PALETTE_CSS cannot touch it.
export const fillHex = (r) => RATING_META[r]?.hex || "#61636b";
