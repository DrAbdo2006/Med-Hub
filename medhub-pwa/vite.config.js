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
        // Precache every build asset — incl. ALL lazy JS chunks (so the
        // manualChunks split below stays fully offline-capable) and woff2
        // fonts (Vazirmatn + KaTeX). ttf deliberately NOT precached: the
        // .ttf files remain as an @font-face fallback for ancient browsers,
        // but precaching both formats would double the offline font weight.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
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

  build: {
    rollupOptions: {
      output: {
        // -------------------------------------------------------------------
        // Vendor splitting. Function form (robust across dep updates).
        //
        // THE ONE RULE THAT MATTERS: react + react-dom (+ scheduler, react's
        // internal dep) live TOGETHER in one 'react-vendor' chunk. Splitting
        // them — or hoisting a React-dependent lib into a chunk that can load
        // before React — causes init-order errors and white screens.
        // react-router is React-dependent and always needed at boot, so it
        // rides in react-vendor too (loading it separately buys nothing).
        //
        // framer-motion and lucide-react get their own chunks: independent
        // libs, safe to load in parallel, cache separately across deploys.
        //
        // Everything else (KaTeX/markdown stack, Supabase, Dexie…) is left to
        // Rollup so it stays attached to the LAZY route chunks that import it
        // — naming those here would not make them eager, but leaving them
        // alone keeps this list from rotting as deps change.
        //
        // PWA: manualChunks only renames/regroups hashed assets in dist/;
        // Workbox's globPatterns (**/*.js) precaches whichever chunks exist,
        // so offline keeps working — verified by the precache count.
        // -------------------------------------------------------------------
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) {
            return "react-vendor";
          }
          if (/[\\/]node_modules[\\/]framer-motion[\\/]/.test(id)) return "motion";
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return "icons";
          if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return "supabase";
          return undefined;
        },
      },
    },
  },
});
