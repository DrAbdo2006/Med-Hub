// ===========================================================================
// ThemeToggle — premium light/dark switch for the navbar / top bars.
// Sun in dark mode (tap to go light), Moon in light mode (tap to go dark),
// with a smooth icon cross-fade/rotate. Uses the shared useTheme().
// ===========================================================================
import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle({ className = "" }) {
  const { isDark, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={
        "relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 " +
        "hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-white/10 transition-colors " +
        className
      }
    >
      {/* Sun (shown in dark mode) */}
      <Sun
        className={
          "absolute h-5 w-5 transition-all duration-300 " +
          (isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0")
        }
      />
      {/* Moon (shown in light mode) */}
      <Moon
        className={
          "absolute h-5 w-5 transition-all duration-300 " +
          (isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100")
        }
      />
    </button>
  );
}
