import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./lib/interactions.js"; // ripple + particle micro-interactions for .btn-premium
import App from "./App.jsx";
import { ThemeProvider } from "./ThemeProvider";
import { requestPersistentStorage, migrateFromLocalStorageIfNeeded } from "./db";

// Boot sequence (runs once, before the app renders any data):
//   1. Ask the browser for PERSISTENT storage so our IndexedDB isn't evicted.
//   2. One-time migrate the legacy localStorage snapshot into IndexedDB
//      (normalizes nested decks + converts base64 occlusion images → Blob
//      assets). This is the SOLE owner of the legacy key; the UI never reads it.
// The service worker is auto-registered by vite-plugin-pwa (autoUpdate).
async function boot() {
  // LTR layout shell (bilingual). Arabic *text* is scoped to dir="rtl"/"auto"
  // containers at the component level; the overall chrome flows left-to-right.
  document.documentElement.setAttribute("dir", "ltr");

  await requestPersistentStorage();
  await migrateFromLocalStorageIfNeeded();

  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </React.StrictMode>
  );
}

boot();
