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
          { src: "/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
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
        cleanupOutdatedCaches: true,
        runtimeCaching: [
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvZWxlZ2FudC1hd2Vzb21lLWNvcmkvbW50L01lZCBIdWIgV2Vic2lkZS9tZWRodWItcHdhXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvc2Vzc2lvbnMvZWxlZ2FudC1hd2Vzb21lLWNvcmkvbW50L01lZCBIdWIgV2Vic2lkZS9tZWRodWItcHdhL3ZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9zZXNzaW9ucy9lbGVnYW50LWF3ZXNvbWUtY29yaS9tbnQvTWVkJTIwSHViJTIwV2Vic2lkZS9tZWRodWItcHdhL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3RcIjtcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tIFwidml0ZS1wbHVnaW4tcHdhXCI7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gTWVkIEh1YiBcdTIwMTQgVml0ZSArIFJlYWN0ICsgUFdBIChvZmZsaW5lLWNhcGFibGUsIGluc3RhbGxhYmxlKS5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgVml0ZVBXQSh7XG4gICAgICByZWdpc3RlclR5cGU6IFwiYXV0b1VwZGF0ZVwiLCAgICAgICAvLyBuZXcgU1cgYWN0aXZhdGVzIGFzIHNvb24gYXMgaXQncyByZWFkeVxuICAgICAgc3RyYXRlZ2llczogXCJnZW5lcmF0ZVNXXCIsICAgICAgICAgLy8gbGV0IFdvcmtib3ggZ2VuZXJhdGUgdGhlIHNlcnZpY2Ugd29ya2VyXG4gICAgICAvLyBQcmVjYWNoZSBib3RoIGljb24gc2V0cyAoaW5zdGFsbCB3b3JkbWFyayArIHRhYiBcIk1cIiBmYXZpY29uKSBmb3Igb2ZmbGluZS5cbiAgICAgIGluY2x1ZGVBc3NldHM6IFtcImljb24tMTkyLnBuZ1wiLCBcImljb24tNTEyLnBuZ1wiLCBcIm1hc2thYmxlLTUxMi5wbmdcIiwgXCJhcHBsZS10b3VjaC1pY29uLnBuZ1wiLCBcImZhdmljb24tNDgucG5nXCIsIFwibG9nby13b3JkbWFyay5wbmdcIl0sXG4gICAgICBtYW5pZmVzdDoge1xuICAgICAgICBuYW1lOiBcIk1lZCBIdWJcIixcbiAgICAgICAgc2hvcnRfbmFtZTogXCJNZWRIdWJcIixcbiAgICAgICAgZGVzY3JpcHRpb246IFwiT2ZmbGluZSBmbGFzaGNhcmRzLCBnYXBzLCBxdWl6emVzICYgaW1hZ2Ugb2NjbHVzaW9uIHdpdGggU00tMiBzcGFjZWQgcmVwZXRpdGlvbi5cIixcbiAgICAgICAgdGhlbWVfY29sb3I6IFwiI0Y3RjlGQVwiLFxuICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiBcIiNGN0Y5RkFcIixcbiAgICAgICAgZGlzcGxheTogXCJzdGFuZGFsb25lXCIsXG4gICAgICAgIC8vIEluc3RhbGxlZC1hcHAgbGF1bmNoZXMgYm9vdCBzdHJhaWdodCBpbnRvIHRoZSBzdHVkZW50IHBvcnRhbCBcdTIwMTQgXCIvXCJcbiAgICAgICAgLy8gaXMgdGhlIHB1YmxpYyBtYXJrZXRpbmcgbGFuZGluZyBwYWdlIG5vdy4gTG9nZ2VkLW91dCB1c2VycyBzdGlsbCBnZXRcbiAgICAgICAgLy8gdGhlIGxvZ2luIHNjcmVlbiAoUHJvdGVjdGVkUm91dGUpLCB0aGVuIGNvbnRpbnVlIHRvIC9kYXNoYm9hcmQuXG4gICAgICAgIHN0YXJ0X3VybDogXCIvZGFzaGJvYXJkXCIsXG4gICAgICAgIHNjb3BlOiBcIi9cIixcbiAgICAgICAgLy8gU2VwYXJhdGUgZW50cmllcyBcdTIwMTQgbmV2ZXIgJ2FueSBtYXNrYWJsZScgb24gb25lIGljb24gXHUyMDE0IHNvIHRoZSB0YWIvZGVza3RvcFxuICAgICAgICAvLyBpY29uICgnYW55JykgaXMgc2hvd24gaW50YWN0IGFuZCBBbmRyb2lkIHVzZXMgdGhlICdtYXNrYWJsZScgb25lLlxuICAgICAgICBpY29uczogW1xuICAgICAgICAgIHsgc3JjOiBcIi9pY29uLTE5Mi5wbmdcIiwgc2l6ZXM6IFwiMTkyeDE5MlwiLCB0eXBlOiBcImltYWdlL3BuZ1wiLCBwdXJwb3NlOiBcImFueVwiIH0sXG4gICAgICAgICAgeyBzcmM6IFwiL2ljb24tNTEyLnBuZ1wiLCBzaXplczogXCI1MTJ4NTEyXCIsIHR5cGU6IFwiaW1hZ2UvcG5nXCIsIHB1cnBvc2U6IFwiYW55XCIgfSxcbiAgICAgICAgICAvLyBwYWRkZWQgc2FmZS16b25lIHZlcnNpb24gc28gQW5kcm9pZCdzIGFkYXB0aXZlIG1hc2sgZG9lc24ndCBjbGlwIGl0XG4gICAgICAgICAgeyBzcmM6IFwiL21hc2thYmxlLTUxMi5wbmdcIiwgc2l6ZXM6IFwiNTEyeDUxMlwiLCB0eXBlOiBcImltYWdlL3BuZ1wiLCBwdXJwb3NlOiBcIm1hc2thYmxlXCIgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgICB3b3JrYm94OiB7XG4gICAgICAgIC8vIFByZWNhY2hlIGV2ZXJ5IGJ1aWxkIGFzc2V0IFx1MjAxNCBpbmNsLiBBTEwgbGF6eSBKUyBjaHVua3MgKHNvIHRoZVxuICAgICAgICAvLyBtYW51YWxDaHVua3Mgc3BsaXQgYmVsb3cgc3RheXMgZnVsbHkgb2ZmbGluZS1jYXBhYmxlKSBhbmQgd29mZjJcbiAgICAgICAgLy8gZm9udHMgKFZhemlybWF0biArIEthVGVYKS4gdHRmIGRlbGliZXJhdGVseSBOT1QgcHJlY2FjaGVkOiB0aGVcbiAgICAgICAgLy8gLnR0ZiBmaWxlcyByZW1haW4gYXMgYW4gQGZvbnQtZmFjZSBmYWxsYmFjayBmb3IgYW5jaWVudCBicm93c2VycyxcbiAgICAgICAgLy8gYnV0IHByZWNhY2hpbmcgYm90aCBmb3JtYXRzIHdvdWxkIGRvdWJsZSB0aGUgb2ZmbGluZSBmb250IHdlaWdodC5cbiAgICAgICAgZ2xvYlBhdHRlcm5zOiBbXCIqKi8qLntqcyxjc3MsaHRtbCxpY28scG5nLHN2Zyx3b2ZmLHdvZmYyfVwiXSxcbiAgICAgICAgbmF2aWdhdGVGYWxsYmFjazogXCIvaW5kZXguaHRtbFwiLFxuICAgICAgICBjbGVhbnVwT3V0ZGF0ZWRDYWNoZXM6IHRydWUsXG4gICAgICAgIHJ1bnRpbWVDYWNoaW5nOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgLy8gR29vZ2xlIEZvbnRzIHN0eWxlc2hlZXRcbiAgICAgICAgICAgIHVybFBhdHRlcm46ICh7IHVybCB9KSA9PiB1cmwub3JpZ2luID09PSBcImh0dHBzOi8vZm9udHMuZ29vZ2xlYXBpcy5jb21cIixcbiAgICAgICAgICAgIGhhbmRsZXI6IFwiQ2FjaGVGaXJzdFwiLFxuICAgICAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgICAgICBjYWNoZU5hbWU6IFwiZ29vZ2xlLWZvbnRzLXN0eWxlc2hlZXRzXCIsXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHsgbWF4RW50cmllczogMTAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDM2NSB9LFxuICAgICAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZTogeyBzdGF0dXNlczogWzAsIDIwMF0gfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICAvLyBHb29nbGUgRm9udHMgd2ViZm9udCBmaWxlcyAoUHVibGljIFNhbnMpIFx1MjAxNCBrZWVwIHRoZW0gZm9yIG9mZmxpbmUuXG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAoeyB1cmwgfSkgPT4gdXJsLm9yaWdpbiA9PT0gXCJodHRwczovL2ZvbnRzLmdzdGF0aWMuY29tXCIsXG4gICAgICAgICAgICBoYW5kbGVyOiBcIkNhY2hlRmlyc3RcIixcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiBcImdvb2dsZS1mb250cy13ZWJmb250c1wiLFxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDMwLCBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiAzNjUgfSxcbiAgICAgICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFswLCAyMDBdIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAgZGV2T3B0aW9uczoge1xuICAgICAgICBlbmFibGVkOiB0cnVlLCAgICAgICAgICAgICAgICAgIC8vIHRlc3QgdGhlIFNXIHdpdGggYG5wbSBydW4gZGV2YFxuICAgICAgICB0eXBlOiBcIm1vZHVsZVwiLFxuICAgICAgfSxcbiAgICB9KSxcbiAgXSxcblxuICBidWlsZDoge1xuICAgIHJvbGx1cE9wdGlvbnM6IHtcbiAgICAgIG91dHB1dDoge1xuICAgICAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgICAgIC8vIFZlbmRvciBzcGxpdHRpbmcuIEZ1bmN0aW9uIGZvcm0gKHJvYnVzdCBhY3Jvc3MgZGVwIHVwZGF0ZXMpLlxuICAgICAgICAvL1xuICAgICAgICAvLyBUSEUgT05FIFJVTEUgVEhBVCBNQVRURVJTOiByZWFjdCArIHJlYWN0LWRvbSAoKyBzY2hlZHVsZXIsIHJlYWN0J3NcbiAgICAgICAgLy8gaW50ZXJuYWwgZGVwKSBsaXZlIFRPR0VUSEVSIGluIG9uZSAncmVhY3QtdmVuZG9yJyBjaHVuay4gU3BsaXR0aW5nXG4gICAgICAgIC8vIHRoZW0gXHUyMDE0IG9yIGhvaXN0aW5nIGEgUmVhY3QtZGVwZW5kZW50IGxpYiBpbnRvIGEgY2h1bmsgdGhhdCBjYW4gbG9hZFxuICAgICAgICAvLyBiZWZvcmUgUmVhY3QgXHUyMDE0IGNhdXNlcyBpbml0LW9yZGVyIGVycm9ycyBhbmQgd2hpdGUgc2NyZWVucy5cbiAgICAgICAgLy8gcmVhY3Qtcm91dGVyIGlzIFJlYWN0LWRlcGVuZGVudCBhbmQgYWx3YXlzIG5lZWRlZCBhdCBib290LCBzbyBpdFxuICAgICAgICAvLyByaWRlcyBpbiByZWFjdC12ZW5kb3IgdG9vIChsb2FkaW5nIGl0IHNlcGFyYXRlbHkgYnV5cyBub3RoaW5nKS5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gZnJhbWVyLW1vdGlvbiBhbmQgbHVjaWRlLXJlYWN0IGdldCB0aGVpciBvd24gY2h1bmtzOiBpbmRlcGVuZGVudFxuICAgICAgICAvLyBsaWJzLCBzYWZlIHRvIGxvYWQgaW4gcGFyYWxsZWwsIGNhY2hlIHNlcGFyYXRlbHkgYWNyb3NzIGRlcGxveXMuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIEV2ZXJ5dGhpbmcgZWxzZSAoS2FUZVgvbWFya2Rvd24gc3RhY2ssIFN1cGFiYXNlLCBEZXhpZVx1MjAyNikgaXMgbGVmdCB0b1xuICAgICAgICAvLyBSb2xsdXAgc28gaXQgc3RheXMgYXR0YWNoZWQgdG8gdGhlIExBWlkgcm91dGUgY2h1bmtzIHRoYXQgaW1wb3J0IGl0XG4gICAgICAgIC8vIFx1MjAxNCBuYW1pbmcgdGhvc2UgaGVyZSB3b3VsZCBub3QgbWFrZSB0aGVtIGVhZ2VyLCBidXQgbGVhdmluZyB0aGVtXG4gICAgICAgIC8vIGFsb25lIGtlZXBzIHRoaXMgbGlzdCBmcm9tIHJvdHRpbmcgYXMgZGVwcyBjaGFuZ2UuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIFBXQTogbWFudWFsQ2h1bmtzIG9ubHkgcmVuYW1lcy9yZWdyb3VwcyBoYXNoZWQgYXNzZXRzIGluIGRpc3QvO1xuICAgICAgICAvLyBXb3JrYm94J3MgZ2xvYlBhdHRlcm5zICgqKi8qLmpzKSBwcmVjYWNoZXMgd2hpY2hldmVyIGNodW5rcyBleGlzdCxcbiAgICAgICAgLy8gc28gb2ZmbGluZSBrZWVwcyB3b3JraW5nIFx1MjAxNCB2ZXJpZmllZCBieSB0aGUgcHJlY2FjaGUgY291bnQuXG4gICAgICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAgICAgbWFudWFsQ2h1bmtzKGlkKSB7XG4gICAgICAgICAgaWYgKCFpZC5pbmNsdWRlcyhcIm5vZGVfbW9kdWxlc1wiKSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICBpZiAoL1tcXFxcL11ub2RlX21vZHVsZXNbXFxcXC9dKHJlYWN0fHJlYWN0LWRvbXxzY2hlZHVsZXJ8cmVhY3Qtcm91dGVyfHJlYWN0LXJvdXRlci1kb20pW1xcXFwvXS8udGVzdChpZCkpIHtcbiAgICAgICAgICAgIHJldHVybiBcInJlYWN0LXZlbmRvclwiO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoL1tcXFxcL11ub2RlX21vZHVsZXNbXFxcXC9dZnJhbWVyLW1vdGlvbltcXFxcL10vLnRlc3QoaWQpKSByZXR1cm4gXCJtb3Rpb25cIjtcbiAgICAgICAgICBpZiAoL1tcXFxcL11ub2RlX21vZHVsZXNbXFxcXC9dbHVjaWRlLXJlYWN0W1xcXFwvXS8udGVzdChpZCkpIHJldHVybiBcImljb25zXCI7XG4gICAgICAgICAgaWYgKC9bXFxcXC9dbm9kZV9tb2R1bGVzW1xcXFwvXUBzdXBhYmFzZVtcXFxcL10vLnRlc3QoaWQpKSByZXR1cm4gXCJzdXBhYmFzZVwiO1xuICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBNlcsU0FBUyxvQkFBb0I7QUFDMVksT0FBTyxXQUFX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
