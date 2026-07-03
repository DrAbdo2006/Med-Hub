/** @type {import('tailwindcss').Config} */
// Med Hub brand design system (see design-system.md).
import typography from "@tailwindcss/typography";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        med: {
          bg: "#F7F9FA",
          primary: "#1B98E0",
          accent: "#E83151",
          text: "#61636b",
          lines: "#C9A86A",
        },
      },
      fontFamily: {
        sans: ['"Public Sans"', "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [typography],
};
