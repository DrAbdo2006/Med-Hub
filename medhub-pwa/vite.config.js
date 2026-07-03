import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// ===========================================================================
// Med Hub — Vite + React + PWA (offline-capable, installable).
// ===========================================================================
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",       // new SW activates as soon as it's ready
      strategies: "generateSW",         // let Workbox generate the service worker
      // Precache both icon sets (install wordmark + tab "M" favicon) for offline.
      includeAssets: ["icon-192.png", "icon-512.png", "maskable-512.png", "apple-touch-icon.png", "favicon-48.png", "logo-wordmark.png"],
      manifest: {
        name: "Med Hub",
        short_name: "MedHub",
        description: "Offline flashcards, gaps, quizzes & image occlusion with SM-2 spaced repetition.",
        theme_color: "#F7F9FA",
        background_color: "#F7F9FA",
        display: "standalone",
        // Installed-app launches boot straight into the student portal — "/"
        // is the public marketing landing page now. Logged-out users still get
        // the login screen (ProtectedRoute), then continue to /dashboard.
        start_url: "/dashboard",
        scope: "/",
        // Separate entries — never 'any maskable' on one icon — so the tab/desktop
        // icon ('any') is shown intact and Android uses the 'maskable' one.
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          // padded safe-zone version so Android's adaptive mask doesn't clip it
          { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache every build asset so the whole app shell works offline.
        // Precache every build asset — incl. lazy JS chunks (js) and KaTeX
        // fonts (woff2/woff/ttf) — so code-split routes & math work OFFLINE.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Google Fonts stylesheet
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts webfont files (Public Sans) — keep them for offline.
            urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,                  // test the SW with `npm run dev`
        type: "module",
      },
    }),
  ],
});
