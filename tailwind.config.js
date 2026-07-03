/** @type {import('tailwindcss').Config} */
// ===========================================================================
// Med Hub — Tailwind theme extension for the brand design system.
// Enables classes like: bg-med-bg, text-med-primary, text-med-accent,
// border-med-lines, text-med-text — plus Public Sans as the default sans font.
// ===========================================================================
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        med: {
          bg: "#F7F9FA",      // 60% background
          primary: "#1B98E0", // 30% headings / topics / icons
          accent: "#E83151",  // 10% keywords / primary buttons
          text: "#61636b",    // body text
          lines: "#C9A86A",   // divider lines / borders
        },
      },
      fontFamily: {
        // Public Sans becomes the default `font-sans`.
        sans: ['"Public Sans"', "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
};
