// ===========================================================================
// interactions — global micro-interaction layer for .btn-premium elements.
//
// Two effects, both spawned as short-lived DOM nodes and cleaned up on
// animationend (no timers, no leaks):
//   • Press: two concentric ripple rings expanding from the pointer position.
//   • Hover: a throttled "dust" particle trail following the cursor.
//
// Uses ONE pair of delegated listeners on document — works for every current
// and future .btn-premium without per-component wiring. Honors
// prefers-reduced-motion at event time (not just load time), and caps live
// particles per button so a fast cursor can't flood the DOM.
//
// Imported once for its side effects in main.jsx.
// ===========================================================================

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
const PARTICLE_THROTTLE_MS = 45;
const MAX_PARTICLES_PER_BUTTON = 12;

function premiumTarget(event) {
  const el = event.target instanceof Element ? event.target.closest(".btn-premium") : null;
  if (!el || el.disabled) return null;
  return el;
}

/* ---------------------------------------------------------------- ripple */
function spawnRipple(btn, clientX, clientY) {
  const rect = btn.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  // Ring must be able to cover the farthest corner from the press point.
  const dx = Math.max(x, rect.width - x);
  const dy = Math.max(y, rect.height - y);
  const size = Math.hypot(dx, dy) * 2;

  for (const outer of [false, true]) {
    const ring = document.createElement("span");
    ring.className = outer ? "btn-ripple btn-ripple-outer" : "btn-ripple";
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    ring.style.width = `${outer ? size * 1.25 : size}px`;
    ring.style.height = `${outer ? size * 1.25 : size}px`;
    ring.addEventListener("animationend", () => ring.remove(), { once: true });
    btn.appendChild(ring);
  }
}

document.addEventListener("pointerdown", (e) => {
  if (REDUCED.matches) return;
  const btn = premiumTarget(e);
  if (!btn) return;
  spawnRipple(btn, e.clientX, e.clientY);
});

/* -------------------------------------------------------------- particles */
let lastParticleAt = 0;

document.addEventListener("pointermove", (e) => {
  if (REDUCED.matches) return;
  const now = performance.now();
  if (now - lastParticleAt < PARTICLE_THROTTLE_MS) return;
  const btn = premiumTarget(e);
  if (!btn) return;
  if (btn.querySelectorAll(".btn-particle").length >= MAX_PARTICLES_PER_BUTTON) return;
  lastParticleAt = now;

  const rect = btn.getBoundingClientRect();
  const p = document.createElement("span");
  p.className = "btn-particle";
  p.style.left = `${e.clientX - rect.left}px`;
  p.style.top = `${e.clientY - rect.top}px`;
  // Random gentle drift, biased upward like settling dust.
  p.style.setProperty("--dx", `${(Math.random() - 0.5) * 22}px`);
  p.style.setProperty("--dy", `${-6 - Math.random() * 16}px`);
  p.addEventListener("animationend", () => p.remove(), { once: true });
  btn.appendChild(p);
});
