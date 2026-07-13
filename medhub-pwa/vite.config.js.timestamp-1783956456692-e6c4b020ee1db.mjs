// vite.config.js
import { defineConfig } from "file:///sessions/elegant-awesome-cori/mnt/Med%20Hub%20Webside/medhub-pwa/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/elegant-awesome-cori/mnt/Med%20Hub%20Webside/medhub-pwa/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///sessions/elegant-awesome-cori/mnt/Med%20Hub%20Webside/medhub-pwa/node_modules/vite-plugin-pwa/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // new SW activates as soon as it's ready
      strategies: "generateSW",
      // let Workbox generate the service worker
      // Precache the icon set (incl. the new rounded + square marks) so the
      // install icons are available offline on first launch.
      includeAssets: ["logo-rounded.png", "logo-square.png", "apple-touch-icon.png", "favicon-48.png", "logo-wordmark.png"],
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
          // 'any' entries → the transparent rounded mark (Chrome/Edge/Android install)
          { src: "/logo-rounded.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/logo-rounded.png", sizes: "512x512", type: "image/png", purpose: "any" },
          // 'maskable' entry → the solid, square, safe-zone-padded mark so
          // Android's adaptive mask fills no transparent corners and crops nothing.
          { src: "/logo-square.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        // Precache every build asset — incl. ALL lazy JS chunks (so the
        // manualChunks split below stays fully offline-capable) and woff2
        // fonts (Vazirmatn + KaTeX). ttf deliberately NOT precached: the
        // .ttf files remain as an @font-face fallback for ancient browsers,
        // but precaching both formats would double the offline font weight.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        navigateFallback: "/index.html",
        // The SPA fallback is for NAVIGATION requests only. Never let it (or any
        // route) shadow Supabase API/auth calls — those must always hit the
        // network so writes aren't served a stale/empty cached response.
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /supabase\.co/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // ── Supabase: NEVER cache. Writes (POST/PATCH/DELETE to /rest/v1/)
            //    and auth must be NetworkOnly — caching a write response is
            //    wrong and can make the client hang on a stale/empty result.
            //    This explicit rule guarantees the SW never intercepts them.
            urlPattern: ({ url }) => url.hostname.endsWith(".supabase.co"),
            handler: "NetworkOnly",
            method: "GET",
            options: { cacheName: "supabase-networkonly" }
          },
          {
            // Google Fonts stylesheet
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Google Fonts webfont files (Public Sans) — keep them for offline.
            urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      },
      devOptions: {
        enabled: true,
        // test the SW with `npm run dev`
        type: "module"
      }
    })
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
          if (!id.includes("node_modules")) return void 0;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) {
            return "react-vendor";
          }
          if (/[\\/]node_modules[\\/]framer-motion[\\/]/.test(id)) return "motion";
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return "icons";
          if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return "supabase";
          return void 0;
        }
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvZWxlZ2FudC1hd2Vzb21lLWNvcmkvbW50L01lZCBIdWIgV2Vic2lkZS9tZWRodWItcHdhXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvc2Vzc2lvbnMvZWxlZ2FudC1hd2Vzb21lLWNvcmkvbW50L01lZCBIdWIgV2Vic2lkZS9tZWRodWItcHdhL3ZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9zZXNzaW9ucy9lbGVnYW50LWF3ZXNvbWUtY29yaS9tbnQvTWVkJTIwSHViJTIwV2Vic2lkZS9tZWRodWItcHdhL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3RcIjtcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tIFwidml0ZS1wbHVnaW4tcHdhXCI7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gTWVkIEh1YiBcdTIwMTQgVml0ZSArIFJlYWN0ICsgUFdBIChvZmZsaW5lLWNhcGFibGUsIGluc3RhbGxhYmxlKS5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgVml0ZVBXQSh7XG4gICAgICByZWdpc3RlclR5cGU6IFwiYXV0b1VwZGF0ZVwiLCAgICAgICAvLyBuZXcgU1cgYWN0aXZhdGVzIGFzIHNvb24gYXMgaXQncyByZWFkeVxuICAgICAgc3RyYXRlZ2llczogXCJnZW5lcmF0ZVNXXCIsICAgICAgICAgLy8gbGV0IFdvcmtib3ggZ2VuZXJhdGUgdGhlIHNlcnZpY2Ugd29ya2VyXG4gICAgICAvLyBQcmVjYWNoZSB0aGUgaWNvbiBzZXQgKGluY2wuIHRoZSBuZXcgcm91bmRlZCArIHNxdWFyZSBtYXJrcykgc28gdGhlXG4gICAgICAvLyBpbnN0YWxsIGljb25zIGFyZSBhdmFpbGFibGUgb2ZmbGluZSBvbiBmaXJzdCBsYXVuY2guXG4gICAgICBpbmNsdWRlQXNzZXRzOiBbXCJsb2dvLXJvdW5kZWQucG5nXCIsIFwibG9nby1zcXVhcmUucG5nXCIsIFwiYXBwbGUtdG91Y2gtaWNvbi5wbmdcIiwgXCJmYXZpY29uLTQ4LnBuZ1wiLCBcImxvZ28td29yZG1hcmsucG5nXCJdLFxuICAgICAgbWFuaWZlc3Q6IHtcbiAgICAgICAgbmFtZTogXCJNZWQgSHViXCIsXG4gICAgICAgIHNob3J0X25hbWU6IFwiTWVkSHViXCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIk9mZmxpbmUgZmxhc2hjYXJkcywgZ2FwcywgcXVpenplcyAmIGltYWdlIG9jY2x1c2lvbiB3aXRoIFNNLTIgc3BhY2VkIHJlcGV0aXRpb24uXCIsXG4gICAgICAgIHRoZW1lX2NvbG9yOiBcIiNGN0Y5RkFcIixcbiAgICAgICAgYmFja2dyb3VuZF9jb2xvcjogXCIjRjdGOUZBXCIsXG4gICAgICAgIGRpc3BsYXk6IFwic3RhbmRhbG9uZVwiLFxuICAgICAgICAvLyBJbnN0YWxsZWQtYXBwIGxhdW5jaGVzIGJvb3Qgc3RyYWlnaHQgaW50byB0aGUgc3R1ZGVudCBwb3J0YWwgXHUyMDE0IFwiL1wiXG4gICAgICAgIC8vIGlzIHRoZSBwdWJsaWMgbWFya2V0aW5nIGxhbmRpbmcgcGFnZSBub3cuIExvZ2dlZC1vdXQgdXNlcnMgc3RpbGwgZ2V0XG4gICAgICAgIC8vIHRoZSBsb2dpbiBzY3JlZW4gKFByb3RlY3RlZFJvdXRlKSwgdGhlbiBjb250aW51ZSB0byAvZGFzaGJvYXJkLlxuICAgICAgICBzdGFydF91cmw6IFwiL2Rhc2hib2FyZFwiLFxuICAgICAgICBzY29wZTogXCIvXCIsXG4gICAgICAgIC8vIFNlcGFyYXRlIGVudHJpZXMgXHUyMDE0IG5ldmVyICdhbnkgbWFza2FibGUnIG9uIG9uZSBpY29uIFx1MjAxNCBzbyB0aGUgdGFiL2Rlc2t0b3BcbiAgICAgICAgLy8gaWNvbiAoJ2FueScpIGlzIHNob3duIGludGFjdCBhbmQgQW5kcm9pZCB1c2VzIHRoZSAnbWFza2FibGUnIG9uZS5cbiAgICAgICAgaWNvbnM6IFtcbiAgICAgICAgICAvLyAnYW55JyBlbnRyaWVzIFx1MjE5MiB0aGUgdHJhbnNwYXJlbnQgcm91bmRlZCBtYXJrIChDaHJvbWUvRWRnZS9BbmRyb2lkIGluc3RhbGwpXG4gICAgICAgICAgeyBzcmM6IFwiL2xvZ28tcm91bmRlZC5wbmdcIiwgc2l6ZXM6IFwiMTkyeDE5MlwiLCB0eXBlOiBcImltYWdlL3BuZ1wiLCBwdXJwb3NlOiBcImFueVwiIH0sXG4gICAgICAgICAgeyBzcmM6IFwiL2xvZ28tcm91bmRlZC5wbmdcIiwgc2l6ZXM6IFwiNTEyeDUxMlwiLCB0eXBlOiBcImltYWdlL3BuZ1wiLCBwdXJwb3NlOiBcImFueVwiIH0sXG4gICAgICAgICAgLy8gJ21hc2thYmxlJyBlbnRyeSBcdTIxOTIgdGhlIHNvbGlkLCBzcXVhcmUsIHNhZmUtem9uZS1wYWRkZWQgbWFyayBzb1xuICAgICAgICAgIC8vIEFuZHJvaWQncyBhZGFwdGl2ZSBtYXNrIGZpbGxzIG5vIHRyYW5zcGFyZW50IGNvcm5lcnMgYW5kIGNyb3BzIG5vdGhpbmcuXG4gICAgICAgICAgeyBzcmM6IFwiL2xvZ28tc3F1YXJlLnBuZ1wiLCBzaXplczogXCI1MTJ4NTEyXCIsIHR5cGU6IFwiaW1hZ2UvcG5nXCIsIHB1cnBvc2U6IFwibWFza2FibGVcIiB9LFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICAgIHdvcmtib3g6IHtcbiAgICAgICAgLy8gUHJlY2FjaGUgZXZlcnkgYnVpbGQgYXNzZXQgXHUyMDE0IGluY2wuIEFMTCBsYXp5IEpTIGNodW5rcyAoc28gdGhlXG4gICAgICAgIC8vIG1hbnVhbENodW5rcyBzcGxpdCBiZWxvdyBzdGF5cyBmdWxseSBvZmZsaW5lLWNhcGFibGUpIGFuZCB3b2ZmMlxuICAgICAgICAvLyBmb250cyAoVmF6aXJtYXRuICsgS2FUZVgpLiB0dGYgZGVsaWJlcmF0ZWx5IE5PVCBwcmVjYWNoZWQ6IHRoZVxuICAgICAgICAvLyAudHRmIGZpbGVzIHJlbWFpbiBhcyBhbiBAZm9udC1mYWNlIGZhbGxiYWNrIGZvciBhbmNpZW50IGJyb3dzZXJzLFxuICAgICAgICAvLyBidXQgcHJlY2FjaGluZyBib3RoIGZvcm1hdHMgd291bGQgZG91YmxlIHRoZSBvZmZsaW5lIGZvbnQgd2VpZ2h0LlxuICAgICAgICBnbG9iUGF0dGVybnM6IFtcIioqLyoue2pzLGNzcyxodG1sLGljbyxwbmcsc3ZnLHdvZmYsd29mZjJ9XCJdLFxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrOiBcIi9pbmRleC5odG1sXCIsXG4gICAgICAgIC8vIFRoZSBTUEEgZmFsbGJhY2sgaXMgZm9yIE5BVklHQVRJT04gcmVxdWVzdHMgb25seS4gTmV2ZXIgbGV0IGl0IChvciBhbnlcbiAgICAgICAgLy8gcm91dGUpIHNoYWRvdyBTdXBhYmFzZSBBUEkvYXV0aCBjYWxscyBcdTIwMTQgdGhvc2UgbXVzdCBhbHdheXMgaGl0IHRoZVxuICAgICAgICAvLyBuZXR3b3JrIHNvIHdyaXRlcyBhcmVuJ3Qgc2VydmVkIGEgc3RhbGUvZW1wdHkgY2FjaGVkIHJlc3BvbnNlLlxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrRGVueWxpc3Q6IFsvXlxcL3Jlc3RcXC8vLCAvXlxcL2F1dGhcXC8vLCAvc3VwYWJhc2VcXC5jby9dLFxuICAgICAgICBjbGVhbnVwT3V0ZGF0ZWRDYWNoZXM6IHRydWUsXG4gICAgICAgIHJ1bnRpbWVDYWNoaW5nOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgLy8gXHUyNTAwXHUyNTAwIFN1cGFiYXNlOiBORVZFUiBjYWNoZS4gV3JpdGVzIChQT1NUL1BBVENIL0RFTEVURSB0byAvcmVzdC92MS8pXG4gICAgICAgICAgICAvLyAgICBhbmQgYXV0aCBtdXN0IGJlIE5ldHdvcmtPbmx5IFx1MjAxNCBjYWNoaW5nIGEgd3JpdGUgcmVzcG9uc2UgaXNcbiAgICAgICAgICAgIC8vICAgIHdyb25nIGFuZCBjYW4gbWFrZSB0aGUgY2xpZW50IGhhbmcgb24gYSBzdGFsZS9lbXB0eSByZXN1bHQuXG4gICAgICAgICAgICAvLyAgICBUaGlzIGV4cGxpY2l0IHJ1bGUgZ3VhcmFudGVlcyB0aGUgU1cgbmV2ZXIgaW50ZXJjZXB0cyB0aGVtLlxuICAgICAgICAgICAgdXJsUGF0dGVybjogKHsgdXJsIH0pID0+IHVybC5ob3N0bmFtZS5lbmRzV2l0aChcIi5zdXBhYmFzZS5jb1wiKSxcbiAgICAgICAgICAgIGhhbmRsZXI6IFwiTmV0d29ya09ubHlcIixcbiAgICAgICAgICAgIG1ldGhvZDogXCJHRVRcIixcbiAgICAgICAgICAgIG9wdGlvbnM6IHsgY2FjaGVOYW1lOiBcInN1cGFiYXNlLW5ldHdvcmtvbmx5XCIgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIC8vIEdvb2dsZSBGb250cyBzdHlsZXNoZWV0XG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAoeyB1cmwgfSkgPT4gdXJsLm9yaWdpbiA9PT0gXCJodHRwczovL2ZvbnRzLmdvb2dsZWFwaXMuY29tXCIsXG4gICAgICAgICAgICBoYW5kbGVyOiBcIkNhY2hlRmlyc3RcIixcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiBcImdvb2dsZS1mb250cy1zdHlsZXNoZWV0c1wiLFxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDEwLCBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiAzNjUgfSxcbiAgICAgICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFswLCAyMDBdIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgLy8gR29vZ2xlIEZvbnRzIHdlYmZvbnQgZmlsZXMgKFB1YmxpYyBTYW5zKSBcdTIwMTQga2VlcCB0aGVtIGZvciBvZmZsaW5lLlxuICAgICAgICAgICAgdXJsUGF0dGVybjogKHsgdXJsIH0pID0+IHVybC5vcmlnaW4gPT09IFwiaHR0cHM6Ly9mb250cy5nc3RhdGljLmNvbVwiLFxuICAgICAgICAgICAgaGFuZGxlcjogXCJDYWNoZUZpcnN0XCIsXG4gICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogXCJnb29nbGUtZm9udHMtd2ViZm9udHNcIixcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiAzMCwgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDI0ICogMzY1IH0sXG4gICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMCwgMjAwXSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICAgIGRldk9wdGlvbnM6IHtcbiAgICAgICAgZW5hYmxlZDogdHJ1ZSwgICAgICAgICAgICAgICAgICAvLyB0ZXN0IHRoZSBTVyB3aXRoIGBucG0gcnVuIGRldmBcbiAgICAgICAgdHlwZTogXCJtb2R1bGVcIixcbiAgICAgIH0sXG4gICAgfSksXG4gIF0sXG5cbiAgYnVpbGQ6IHtcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICAgICAgICAvLyBWZW5kb3Igc3BsaXR0aW5nLiBGdW5jdGlvbiBmb3JtIChyb2J1c3QgYWNyb3NzIGRlcCB1cGRhdGVzKS5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gVEhFIE9ORSBSVUxFIFRIQVQgTUFUVEVSUzogcmVhY3QgKyByZWFjdC1kb20gKCsgc2NoZWR1bGVyLCByZWFjdCdzXG4gICAgICAgIC8vIGludGVybmFsIGRlcCkgbGl2ZSBUT0dFVEhFUiBpbiBvbmUgJ3JlYWN0LXZlbmRvcicgY2h1bmsuIFNwbGl0dGluZ1xuICAgICAgICAvLyB0aGVtIFx1MjAxNCBvciBob2lzdGluZyBhIFJlYWN0LWRlcGVuZGVudCBsaWIgaW50byBhIGNodW5rIHRoYXQgY2FuIGxvYWRcbiAgICAgICAgLy8gYmVmb3JlIFJlYWN0IFx1MjAxNCBjYXVzZXMgaW5pdC1vcmRlciBlcnJvcnMgYW5kIHdoaXRlIHNjcmVlbnMuXG4gICAgICAgIC8vIHJlYWN0LXJvdXRlciBpcyBSZWFjdC1kZXBlbmRlbnQgYW5kIGFsd2F5cyBuZWVkZWQgYXQgYm9vdCwgc28gaXRcbiAgICAgICAgLy8gcmlkZXMgaW4gcmVhY3QtdmVuZG9yIHRvbyAobG9hZGluZyBpdCBzZXBhcmF0ZWx5IGJ1eXMgbm90aGluZykuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIGZyYW1lci1tb3Rpb24gYW5kIGx1Y2lkZS1yZWFjdCBnZXQgdGhlaXIgb3duIGNodW5rczogaW5kZXBlbmRlbnRcbiAgICAgICAgLy8gbGlicywgc2FmZSB0byBsb2FkIGluIHBhcmFsbGVsLCBjYWNoZSBzZXBhcmF0ZWx5IGFjcm9zcyBkZXBsb3lzLlxuICAgICAgICAvL1xuICAgICAgICAvLyBFdmVyeXRoaW5nIGVsc2UgKEthVGVYL21hcmtkb3duIHN0YWNrLCBTdXBhYmFzZSwgRGV4aWVcdTIwMjYpIGlzIGxlZnQgdG9cbiAgICAgICAgLy8gUm9sbHVwIHNvIGl0IHN0YXlzIGF0dGFjaGVkIHRvIHRoZSBMQVpZIHJvdXRlIGNodW5rcyB0aGF0IGltcG9ydCBpdFxuICAgICAgICAvLyBcdTIwMTQgbmFtaW5nIHRob3NlIGhlcmUgd291bGQgbm90IG1ha2UgdGhlbSBlYWdlciwgYnV0IGxlYXZpbmcgdGhlbVxuICAgICAgICAvLyBhbG9uZSBrZWVwcyB0aGlzIGxpc3QgZnJvbSByb3R0aW5nIGFzIGRlcHMgY2hhbmdlLlxuICAgICAgICAvL1xuICAgICAgICAvLyBQV0E6IG1hbnVhbENodW5rcyBvbmx5IHJlbmFtZXMvcmVncm91cHMgaGFzaGVkIGFzc2V0cyBpbiBkaXN0LztcbiAgICAgICAgLy8gV29ya2JveCdzIGdsb2JQYXR0ZXJucyAoKiovKi5qcykgcHJlY2FjaGVzIHdoaWNoZXZlciBjaHVua3MgZXhpc3QsXG4gICAgICAgIC8vIHNvIG9mZmxpbmUga2VlcHMgd29ya2luZyBcdTIwMTQgdmVyaWZpZWQgYnkgdGhlIHByZWNhY2hlIGNvdW50LlxuICAgICAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAgIG1hbnVhbENodW5rcyhpZCkge1xuICAgICAgICAgIGlmICghaWQuaW5jbHVkZXMoXCJub2RlX21vZHVsZXNcIikpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgaWYgKC9bXFxcXC9dbm9kZV9tb2R1bGVzW1xcXFwvXShyZWFjdHxyZWFjdC1kb218c2NoZWR1bGVyfHJlYWN0LXJvdXRlcnxyZWFjdC1yb3V0ZXItZG9tKVtcXFxcL10vLnRlc3QoaWQpKSB7XG4gICAgICAgICAgICByZXR1cm4gXCJyZWFjdC12ZW5kb3JcIjtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKC9bXFxcXC9dbm9kZV9tb2R1bGVzW1xcXFwvXWZyYW1lci1tb3Rpb25bXFxcXC9dLy50ZXN0KGlkKSkgcmV0dXJuIFwibW90aW9uXCI7XG4gICAgICAgICAgaWYgKC9bXFxcXC9dbm9kZV9tb2R1bGVzW1xcXFwvXWx1Y2lkZS1yZWFjdFtcXFxcL10vLnRlc3QoaWQpKSByZXR1cm4gXCJpY29uc1wiO1xuICAgICAgICAgIGlmICgvW1xcXFwvXW5vZGVfbW9kdWxlc1tcXFxcL11Ac3VwYWJhc2VbXFxcXC9dLy50ZXN0KGlkKSkgcmV0dXJuIFwic3VwYWJhc2VcIjtcbiAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTZXLFNBQVMsb0JBQW9CO0FBQzFZLE9BQU8sV0FBVztBQUNsQixTQUFTLGVBQWU7QUFLeEIsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sUUFBUTtBQUFBLE1BQ04sY0FBYztBQUFBO0FBQUEsTUFDZCxZQUFZO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFHWixlQUFlLENBQUMsb0JBQW9CLG1CQUFtQix3QkFBd0Isa0JBQWtCLG1CQUFtQjtBQUFBLE1BQ3BILFVBQVU7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxRQUNaLGFBQWE7QUFBQSxRQUNiLGFBQWE7QUFBQSxRQUNiLGtCQUFrQjtBQUFBLFFBQ2xCLFNBQVM7QUFBQTtBQUFBO0FBQUE7QUFBQSxRQUlULFdBQVc7QUFBQSxRQUNYLE9BQU87QUFBQTtBQUFBO0FBQUEsUUFHUCxPQUFPO0FBQUE7QUFBQSxVQUVMLEVBQUUsS0FBSyxxQkFBcUIsT0FBTyxXQUFXLE1BQU0sYUFBYSxTQUFTLE1BQU07QUFBQSxVQUNoRixFQUFFLEtBQUsscUJBQXFCLE9BQU8sV0FBVyxNQUFNLGFBQWEsU0FBUyxNQUFNO0FBQUE7QUFBQTtBQUFBLFVBR2hGLEVBQUUsS0FBSyxvQkFBb0IsT0FBTyxXQUFXLE1BQU0sYUFBYSxTQUFTLFdBQVc7QUFBQSxRQUN0RjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFNBQVM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsUUFNUCxjQUFjLENBQUMsMkNBQTJDO0FBQUEsUUFDMUQsa0JBQWtCO0FBQUE7QUFBQTtBQUFBO0FBQUEsUUFJbEIsMEJBQTBCLENBQUMsYUFBYSxhQUFhLGNBQWM7QUFBQSxRQUNuRSx1QkFBdUI7QUFBQSxRQUN2QixnQkFBZ0I7QUFBQSxVQUNkO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxZQUtFLFlBQVksQ0FBQyxFQUFFLElBQUksTUFBTSxJQUFJLFNBQVMsU0FBUyxjQUFjO0FBQUEsWUFDN0QsU0FBUztBQUFBLFlBQ1QsUUFBUTtBQUFBLFlBQ1IsU0FBUyxFQUFFLFdBQVcsdUJBQXVCO0FBQUEsVUFDL0M7QUFBQSxVQUNBO0FBQUE7QUFBQSxZQUVFLFlBQVksQ0FBQyxFQUFFLElBQUksTUFBTSxJQUFJLFdBQVc7QUFBQSxZQUN4QyxTQUFTO0FBQUEsWUFDVCxTQUFTO0FBQUEsY0FDUCxXQUFXO0FBQUEsY0FDWCxZQUFZLEVBQUUsWUFBWSxJQUFJLGVBQWUsS0FBSyxLQUFLLEtBQUssSUFBSTtBQUFBLGNBQ2hFLG1CQUFtQixFQUFFLFVBQVUsQ0FBQyxHQUFHLEdBQUcsRUFBRTtBQUFBLFlBQzFDO0FBQUEsVUFDRjtBQUFBLFVBQ0E7QUFBQTtBQUFBLFlBRUUsWUFBWSxDQUFDLEVBQUUsSUFBSSxNQUFNLElBQUksV0FBVztBQUFBLFlBQ3hDLFNBQVM7QUFBQSxZQUNULFNBQVM7QUFBQSxjQUNQLFdBQVc7QUFBQSxjQUNYLFlBQVksRUFBRSxZQUFZLElBQUksZUFBZSxLQUFLLEtBQUssS0FBSyxJQUFJO0FBQUEsY0FDaEUsbUJBQW1CLEVBQUUsVUFBVSxDQUFDLEdBQUcsR0FBRyxFQUFFO0FBQUEsWUFDMUM7QUFBQSxVQUNGO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFlBQVk7QUFBQSxRQUNWLFNBQVM7QUFBQTtBQUFBLFFBQ1QsTUFBTTtBQUFBLE1BQ1I7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxPQUFPO0FBQUEsSUFDTCxlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxRQXVCTixhQUFhLElBQUk7QUFDZixjQUFJLENBQUMsR0FBRyxTQUFTLGNBQWMsRUFBRyxRQUFPO0FBQ3pDLGNBQUksdUZBQXVGLEtBQUssRUFBRSxHQUFHO0FBQ25HLG1CQUFPO0FBQUEsVUFDVDtBQUNBLGNBQUksMkNBQTJDLEtBQUssRUFBRSxFQUFHLFFBQU87QUFDaEUsY0FBSSwwQ0FBMEMsS0FBSyxFQUFFLEVBQUcsUUFBTztBQUMvRCxjQUFJLHVDQUF1QyxLQUFLLEVBQUUsRUFBRyxRQUFPO0FBQzVELGlCQUFPO0FBQUEsUUFDVDtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
