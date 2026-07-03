// vite.config.js
import { defineConfig } from "file:///sessions/elegant-awesome-cori/mnt/medhub-pwa/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/elegant-awesome-cori/mnt/medhub-pwa/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///sessions/elegant-awesome-cori/mnt/medhub-pwa/node_modules/vite-plugin-pwa/dist/index.js";
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
  ]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvZWxlZ2FudC1hd2Vzb21lLWNvcmkvbW50L21lZGh1Yi1wd2FcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9zZXNzaW9ucy9lbGVnYW50LWF3ZXNvbWUtY29yaS9tbnQvbWVkaHViLXB3YS92aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vc2Vzc2lvbnMvZWxlZ2FudC1hd2Vzb21lLWNvcmkvbW50L21lZGh1Yi1wd2Evdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdFwiO1xuaW1wb3J0IHsgVml0ZVBXQSB9IGZyb20gXCJ2aXRlLXBsdWdpbi1wd2FcIjtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBNZWQgSHViIFx1MjAxNCBWaXRlICsgUmVhY3QgKyBQV0EgKG9mZmxpbmUtY2FwYWJsZSwgaW5zdGFsbGFibGUpLlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbXG4gICAgcmVhY3QoKSxcbiAgICBWaXRlUFdBKHtcbiAgICAgIHJlZ2lzdGVyVHlwZTogXCJhdXRvVXBkYXRlXCIsICAgICAgIC8vIG5ldyBTVyBhY3RpdmF0ZXMgYXMgc29vbiBhcyBpdCdzIHJlYWR5XG4gICAgICBzdHJhdGVnaWVzOiBcImdlbmVyYXRlU1dcIiwgICAgICAgICAvLyBsZXQgV29ya2JveCBnZW5lcmF0ZSB0aGUgc2VydmljZSB3b3JrZXJcbiAgICAgIC8vIFByZWNhY2hlIGJvdGggaWNvbiBzZXRzIChpbnN0YWxsIHdvcmRtYXJrICsgdGFiIFwiTVwiIGZhdmljb24pIGZvciBvZmZsaW5lLlxuICAgICAgaW5jbHVkZUFzc2V0czogW1wiaWNvbi0xOTIucG5nXCIsIFwiaWNvbi01MTIucG5nXCIsIFwibWFza2FibGUtNTEyLnBuZ1wiLCBcImFwcGxlLXRvdWNoLWljb24ucG5nXCIsIFwiZmF2aWNvbi00OC5wbmdcIiwgXCJsb2dvLXdvcmRtYXJrLnBuZ1wiXSxcbiAgICAgIG1hbmlmZXN0OiB7XG4gICAgICAgIG5hbWU6IFwiTWVkIEh1YlwiLFxuICAgICAgICBzaG9ydF9uYW1lOiBcIk1lZEh1YlwiLFxuICAgICAgICBkZXNjcmlwdGlvbjogXCJPZmZsaW5lIGZsYXNoY2FyZHMsIGdhcHMsIHF1aXp6ZXMgJiBpbWFnZSBvY2NsdXNpb24gd2l0aCBTTS0yIHNwYWNlZCByZXBldGl0aW9uLlwiLFxuICAgICAgICB0aGVtZV9jb2xvcjogXCIjRjdGOUZBXCIsXG4gICAgICAgIGJhY2tncm91bmRfY29sb3I6IFwiI0Y3RjlGQVwiLFxuICAgICAgICBkaXNwbGF5OiBcInN0YW5kYWxvbmVcIixcbiAgICAgICAgLy8gSW5zdGFsbGVkLWFwcCBsYXVuY2hlcyBib290IHN0cmFpZ2h0IGludG8gdGhlIHN0dWRlbnQgcG9ydGFsIFx1MjAxNCBcIi9cIlxuICAgICAgICAvLyBpcyB0aGUgcHVibGljIG1hcmtldGluZyBsYW5kaW5nIHBhZ2Ugbm93LiBMb2dnZWQtb3V0IHVzZXJzIHN0aWxsIGdldFxuICAgICAgICAvLyB0aGUgbG9naW4gc2NyZWVuIChQcm90ZWN0ZWRSb3V0ZSksIHRoZW4gY29udGludWUgdG8gL2Rhc2hib2FyZC5cbiAgICAgICAgc3RhcnRfdXJsOiBcIi9kYXNoYm9hcmRcIixcbiAgICAgICAgc2NvcGU6IFwiL1wiLFxuICAgICAgICAvLyBTZXBhcmF0ZSBlbnRyaWVzIFx1MjAxNCBuZXZlciAnYW55IG1hc2thYmxlJyBvbiBvbmUgaWNvbiBcdTIwMTQgc28gdGhlIHRhYi9kZXNrdG9wXG4gICAgICAgIC8vIGljb24gKCdhbnknKSBpcyBzaG93biBpbnRhY3QgYW5kIEFuZHJvaWQgdXNlcyB0aGUgJ21hc2thYmxlJyBvbmUuXG4gICAgICAgIGljb25zOiBbXG4gICAgICAgICAgeyBzcmM6IFwiL2ljb24tMTkyLnBuZ1wiLCBzaXplczogXCIxOTJ4MTkyXCIsIHR5cGU6IFwiaW1hZ2UvcG5nXCIsIHB1cnBvc2U6IFwiYW55XCIgfSxcbiAgICAgICAgICB7IHNyYzogXCIvaWNvbi01MTIucG5nXCIsIHNpemVzOiBcIjUxMng1MTJcIiwgdHlwZTogXCJpbWFnZS9wbmdcIiwgcHVycG9zZTogXCJhbnlcIiB9LFxuICAgICAgICAgIC8vIHBhZGRlZCBzYWZlLXpvbmUgdmVyc2lvbiBzbyBBbmRyb2lkJ3MgYWRhcHRpdmUgbWFzayBkb2Vzbid0IGNsaXAgaXRcbiAgICAgICAgICB7IHNyYzogXCIvbWFza2FibGUtNTEyLnBuZ1wiLCBzaXplczogXCI1MTJ4NTEyXCIsIHR5cGU6IFwiaW1hZ2UvcG5nXCIsIHB1cnBvc2U6IFwibWFza2FibGVcIiB9LFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICAgIHdvcmtib3g6IHtcbiAgICAgICAgLy8gUHJlY2FjaGUgZXZlcnkgYnVpbGQgYXNzZXQgc28gdGhlIHdob2xlIGFwcCBzaGVsbCB3b3JrcyBvZmZsaW5lLlxuICAgICAgICAvLyBQcmVjYWNoZSBldmVyeSBidWlsZCBhc3NldCBcdTIwMTQgaW5jbC4gbGF6eSBKUyBjaHVua3MgKGpzKSBhbmQgS2FUZVhcbiAgICAgICAgLy8gZm9udHMgKHdvZmYyL3dvZmYvdHRmKSBcdTIwMTQgc28gY29kZS1zcGxpdCByb3V0ZXMgJiBtYXRoIHdvcmsgT0ZGTElORS5cbiAgICAgICAgZ2xvYlBhdHRlcm5zOiBbXCIqKi8qLntqcyxjc3MsaHRtbCxpY28scG5nLHN2Zyx3b2ZmLHdvZmYyLHR0Zn1cIl0sXG4gICAgICAgIG5hdmlnYXRlRmFsbGJhY2s6IFwiL2luZGV4Lmh0bWxcIixcbiAgICAgICAgY2xlYW51cE91dGRhdGVkQ2FjaGVzOiB0cnVlLFxuICAgICAgICBydW50aW1lQ2FjaGluZzogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIC8vIEdvb2dsZSBGb250cyBzdHlsZXNoZWV0XG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAoeyB1cmwgfSkgPT4gdXJsLm9yaWdpbiA9PT0gXCJodHRwczovL2ZvbnRzLmdvb2dsZWFwaXMuY29tXCIsXG4gICAgICAgICAgICBoYW5kbGVyOiBcIkNhY2hlRmlyc3RcIixcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiBcImdvb2dsZS1mb250cy1zdHlsZXNoZWV0c1wiLFxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDEwLCBtYXhBZ2VTZWNvbmRzOiA2MCAqIDYwICogMjQgKiAzNjUgfSxcbiAgICAgICAgICAgICAgY2FjaGVhYmxlUmVzcG9uc2U6IHsgc3RhdHVzZXM6IFswLCAyMDBdIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgLy8gR29vZ2xlIEZvbnRzIHdlYmZvbnQgZmlsZXMgKFB1YmxpYyBTYW5zKSBcdTIwMTQga2VlcCB0aGVtIGZvciBvZmZsaW5lLlxuICAgICAgICAgICAgdXJsUGF0dGVybjogKHsgdXJsIH0pID0+IHVybC5vcmlnaW4gPT09IFwiaHR0cHM6Ly9mb250cy5nc3RhdGljLmNvbVwiLFxuICAgICAgICAgICAgaGFuZGxlcjogXCJDYWNoZUZpcnN0XCIsXG4gICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogXCJnb29nbGUtZm9udHMtd2ViZm9udHNcIixcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiAzMCwgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDI0ICogMzY1IH0sXG4gICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMCwgMjAwXSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICAgIGRldk9wdGlvbnM6IHtcbiAgICAgICAgZW5hYmxlZDogdHJ1ZSwgICAgICAgICAgICAgICAgICAvLyB0ZXN0IHRoZSBTVyB3aXRoIGBucG0gcnVuIGRldmBcbiAgICAgICAgdHlwZTogXCJtb2R1bGVcIixcbiAgICAgIH0sXG4gICAgfSksXG4gIF0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBeVQsU0FBUyxvQkFBb0I7QUFDdFYsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsZUFBZTtBQUt4QixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxNQUFNO0FBQUEsSUFDTixRQUFRO0FBQUEsTUFDTixjQUFjO0FBQUE7QUFBQSxNQUNkLFlBQVk7QUFBQTtBQUFBO0FBQUEsTUFFWixlQUFlLENBQUMsZ0JBQWdCLGdCQUFnQixvQkFBb0Isd0JBQXdCLGtCQUFrQixtQkFBbUI7QUFBQSxNQUNqSSxVQUFVO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWixhQUFhO0FBQUEsUUFDYixhQUFhO0FBQUEsUUFDYixrQkFBa0I7QUFBQSxRQUNsQixTQUFTO0FBQUE7QUFBQTtBQUFBO0FBQUEsUUFJVCxXQUFXO0FBQUEsUUFDWCxPQUFPO0FBQUE7QUFBQTtBQUFBLFFBR1AsT0FBTztBQUFBLFVBQ0wsRUFBRSxLQUFLLGlCQUFpQixPQUFPLFdBQVcsTUFBTSxhQUFhLFNBQVMsTUFBTTtBQUFBLFVBQzVFLEVBQUUsS0FBSyxpQkFBaUIsT0FBTyxXQUFXLE1BQU0sYUFBYSxTQUFTLE1BQU07QUFBQTtBQUFBLFVBRTVFLEVBQUUsS0FBSyxxQkFBcUIsT0FBTyxXQUFXLE1BQU0sYUFBYSxTQUFTLFdBQVc7QUFBQSxRQUN2RjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFNBQVM7QUFBQTtBQUFBO0FBQUE7QUFBQSxRQUlQLGNBQWMsQ0FBQywrQ0FBK0M7QUFBQSxRQUM5RCxrQkFBa0I7QUFBQSxRQUNsQix1QkFBdUI7QUFBQSxRQUN2QixnQkFBZ0I7QUFBQSxVQUNkO0FBQUE7QUFBQSxZQUVFLFlBQVksQ0FBQyxFQUFFLElBQUksTUFBTSxJQUFJLFdBQVc7QUFBQSxZQUN4QyxTQUFTO0FBQUEsWUFDVCxTQUFTO0FBQUEsY0FDUCxXQUFXO0FBQUEsY0FDWCxZQUFZLEVBQUUsWUFBWSxJQUFJLGVBQWUsS0FBSyxLQUFLLEtBQUssSUFBSTtBQUFBLGNBQ2hFLG1CQUFtQixFQUFFLFVBQVUsQ0FBQyxHQUFHLEdBQUcsRUFBRTtBQUFBLFlBQzFDO0FBQUEsVUFDRjtBQUFBLFVBQ0E7QUFBQTtBQUFBLFlBRUUsWUFBWSxDQUFDLEVBQUUsSUFBSSxNQUFNLElBQUksV0FBVztBQUFBLFlBQ3hDLFNBQVM7QUFBQSxZQUNULFNBQVM7QUFBQSxjQUNQLFdBQVc7QUFBQSxjQUNYLFlBQVksRUFBRSxZQUFZLElBQUksZUFBZSxLQUFLLEtBQUssS0FBSyxJQUFJO0FBQUEsY0FDaEUsbUJBQW1CLEVBQUUsVUFBVSxDQUFDLEdBQUcsR0FBRyxFQUFFO0FBQUEsWUFDMUM7QUFBQSxVQUNGO0FBQUEsUUFDRjtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFlBQVk7QUFBQSxRQUNWLFNBQVM7QUFBQTtBQUFBLFFBQ1QsTUFBTTtBQUFBLE1BQ1I7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNIO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
