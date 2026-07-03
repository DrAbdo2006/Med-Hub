// ===========================================================================
// ThemeProvider / useTheme — class-strategy dark mode manager.
//
// Three modes: 'light' | 'dark' | 'system'.
//   • Defaults to 'system' (follows the OS prefers-color-scheme).
//   • A manual choice is persisted to localStorage ("medhub-theme").
//   • The resolved theme toggles the `dark` class on <html>.
//   • When in 'system' mode it live-updates if the OS theme changes.
//
// A tiny inline script in index.html sets the class BEFORE first paint to avoid
// a flash of the wrong theme; this provider keeps it in sync afterwards.
// ===========================================================================
import { createContext, useContext, useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "medhub-theme";
const ThemeContext = createContext(null);

const systemPrefersDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

// Explicitly add/remove the `dark` class on <html> (never relies on effect
// timing). Returns nothing; safe to call synchronously from event handlers.
function applyResolved(resolved) {
  const root = document.documentElement;
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.style.colorScheme = resolved; // native form controls / scrollbars match
}

function resolve(theme, systemDark) {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored); // 'light'|'dark'|'system'
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Track OS preference changes (only matters while in 'system').
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => {
      setSystemDark(e.matches);
      // If we're following the OS, reflect the change immediately.
      if (readStored() === "system") applyResolved(e.matches ? "dark" : "light");
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const resolved = resolve(theme, systemDark);

  // Safety net: keep <html> in sync if resolved ever changes via state.
  useEffect(() => { applyResolved(resolved); }, [resolved]);

  // Set theme: update React state, persist to localStorage, AND apply the
  // `dark` class synchronously so the UI flips on the very same click.
  const setTheme = useCallback((next) => {
    setThemeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    applyResolved(resolve(next, systemPrefersDark()));
  }, []);

  // Toggle cycles the *resolved* look: light <-> dark (drops 'system'). Reads
  // the live class on <html> so it can't get out of sync with the DOM.
  const toggle = useCallback(() => {
    const isDarkNow = document.documentElement.classList.contains("dark");
    setTheme(isDarkNow ? "light" : "dark");
  }, [setTheme]);

  const value = useMemo(
    () => ({ theme, resolved, isDark: resolved === "dark", setTheme, toggle }),
    [theme, resolved, setTheme, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
