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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvZWxlZ2FudC1hd2Vzb21lLWNvcmkvbW50L01lZCBIdWIgV2Vic2lkZS9tZWRodWItcHdhXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvc2Vzc2lvbnMvZWxlZ2FudC1hd2Vzb21lLWNvcmkvbW50L01lZCBIdWIgV2Vic2lkZS9tZWRodWItcHdhL3ZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9zZXNzaW9ucy9lbGVnYW50LWF3ZXNvbWUtY29yaS9tbnQvTWVkJTIwSHViJTIwV2Vic2lkZS9tZWRodWItcHdhL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3RcIjtcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tIFwidml0ZS1wbHVnaW4tcHdhXCI7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gTWVkIEh1YiBcdTIwMTQgVml0ZSArIFJlYWN0ICsgUFdBIChvZmZsaW5lLWNhcGFibGUsIGluc3RhbGxhYmxlKS5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgVml0ZVBXQSh7XG4gICAgICByZWdpc3RlclR5cGU6IFwiYXV0b1VwZGF0ZVwiLCAgICAgICAvLyBuZXcgU1cgYWN0aXZhdGVzIGFzIHNvb24gYXMgaXQncyByZWFkeVxuICAgICAgc3RyYXRlZ2llczogXCJnZW5lcmF0ZVNXXCIsICAgICAgICAgLy8gbGV0IFdvcmtib3ggZ2VuZXJhdGUgdGhlIHNlcnZpY2Ugd29ya2VyXG4gICAgICAvLyBQcmVjYWNoZSBib3RoIGljb24gc2V0cyAoaW5zdGFsbCB3b3JkbWFyayArIHRhYiBcIk1cIiBmYXZpY29uKSBmb3Igb2ZmbGluZS5cbiAgICAgIGluY2x1ZGVBc3NldHM6IFtcImljb24tMTkyLnBuZ1wiLCBcImljb24tNTEyLnBuZ1wiLCBcIm1hc2thYmxlLTUxMi5wbmdcIiwgXCJhcHBsZS10b3VjaC1pY29uLnBuZ1wiLCBcImZhdmljb24tNDgucG5nXCIsIFwibG9nby13b3JkbWFyay5wbmdcIl0sXG4gICAgICBtYW5pZmVzdDoge1xuICAgICAgICBuYW1lOiBcIk1lZCBIdWJcIixcbiAgICAgICAgc2hvcnRfbmFtZTogXCJNZWRIdWJcIixcbiAgICAgICAgZGVzY3JpcHRpb246IFwiT2ZmbGluZSBmbGFzaGNhcmRzLCBnYXBzLCBxdWl6emVzICYgaW1hZ2Ugb2NjbHVzaW9uIHdpdGggU00tMiBzcGFjZWQgcmVwZXRpdGlvbi5cIixcbiAgICAgICAgdGhlbWVfY29sb3I6IFwiI0Y3RjlGQVwiLFxuICAgICAgICBiYWNrZ3JvdW5kX2NvbG9yOiBcIiNGN0Y5RkFcIixcbiAgICAgICAgZGlzcGxheTogXCJzdGFuZGFsb25lXCIsXG4gICAgICAgIC8vIEluc3RhbGxlZC1hcHAgbGF1bmNoZXMgYm9vdCBzdHJhaWdodCBpbnRvIHRoZSBzdHVkZW50IHBvcnRhbCBcdTIwMTQgXCIvXCJcbiAgICAgICAgLy8gaXMgdGhlIHB1YmxpYyBtYXJrZXRpbmcgbGFuZGluZyBwYWdlIG5vdy4gTG9nZ2VkLW91dCB1c2VycyBzdGlsbCBnZXRcbiAgICAgICAgLy8gdGhlIGxvZ2luIHNjcmVlbiAoUHJvdGVjdGVkUm91dGUpLCB0aGVuIGNvbnRpbnVlIHRvIC9kYXNoYm9hcmQuXG4gICAgICAgIHN0YXJ0X3VybDogXCIvZGFzaGJvYXJkXCIsXG4gICAgICAgIHNjb3BlOiBcIi9cIixcbiAgICAgICAgLy8gU2VwYXJhdGUgZW50cmllcyBcdTIwMTQgbmV2ZXIgJ2FueSBtYXNrYWJsZScgb24gb25lIGljb24gXHUyMDE0IHNvIHRoZSB0YWIvZGVza3RvcFxuICAgICAgICAvLyBpY29uICgnYW55JykgaXMgc2hvd24gaW50YWN0IGFuZCBBbmRyb2lkIHVzZXMgdGhlICdtYXNrYWJsZScgb25lLlxuICAgICAgICBpY29uczogW1xuICAgICAgICAgIHsgc3JjOiBcIi9pY29uLTE5Mi5wbmdcIiwgc2l6ZXM6IFwiMTkyeDE5MlwiLCB0eXBlOiBcImltYWdlL3BuZ1wiLCBwdXJwb3NlOiBcImFueVwiIH0sXG4gICAgICAgICAgeyBzcmM6IFwiL2ljb24tNTEyLnBuZ1wiLCBzaXplczogXCI1MTJ4NTEyXCIsIHR5cGU6IFwiaW1hZ2UvcG5nXCIsIHB1cnBvc2U6IFwiYW55XCIgfSxcbiAgICAgICAgICAvLyBwYWRkZWQgc2FmZS16b25lIHZlcnNpb24gc28gQW5kcm9pZCdzIGFkYXB0aXZlIG1hc2sgZG9lc24ndCBjbGlwIGl0XG4gICAgICAgICAgeyBzcmM6IFwiL21hc2thYmxlLTUxMi5wbmdcIiwgc2l6ZXM6IFwiNTEyeDUxMlwiLCB0eXBlOiBcImltYWdlL3BuZ1wiLCBwdXJwb3NlOiBcIm1hc2thYmxlXCIgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgICB3b3JrYm94OiB7XG4gICAgICAgIC8vIFByZWNhY2hlIGV2ZXJ5IGJ1aWxkIGFzc2V0IHNvIHRoZSB3aG9sZSBhcHAgc2hlbGwgd29ya3Mgb2ZmbGluZS5cbiAgICAgICAgLy8gUHJlY2FjaGUgZXZlcnkgYnVpbGQgYXNzZXQgXHUyMDE0IGluY2wuIGxhenkgSlMgY2h1bmtzIChqcykgYW5kIEthVGVYXG4gICAgICAgIC8vIGZvbnRzICh3b2ZmMi93b2ZmL3R0ZikgXHUyMDE0IHNvIGNvZGUtc3BsaXQgcm91dGVzICYgbWF0aCB3b3JrIE9GRkxJTkUuXG4gICAgICAgIGdsb2JQYXR0ZXJuczogW1wiKiovKi57anMsY3NzLGh0bWwsaWNvLHBuZyxzdmcsd29mZix3b2ZmMix0dGZ9XCJdLFxuICAgICAgICBuYXZpZ2F0ZUZhbGxiYWNrOiBcIi9pbmRleC5odG1sXCIsXG4gICAgICAgIGNsZWFudXBPdXRkYXRlZENhY2hlczogdHJ1ZSxcbiAgICAgICAgcnVudGltZUNhY2hpbmc6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICAvLyBHb29nbGUgRm9udHMgc3R5bGVzaGVldFxuICAgICAgICAgICAgdXJsUGF0dGVybjogKHsgdXJsIH0pID0+IHVybC5vcmlnaW4gPT09IFwiaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbVwiLFxuICAgICAgICAgICAgaGFuZGxlcjogXCJDYWNoZUZpcnN0XCIsXG4gICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogXCJnb29nbGUtZm9udHMtc3R5bGVzaGVldHNcIixcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjogeyBtYXhFbnRyaWVzOiAxMCwgbWF4QWdlU2Vjb25kczogNjAgKiA2MCAqIDI0ICogMzY1IH0sXG4gICAgICAgICAgICAgIGNhY2hlYWJsZVJlc3BvbnNlOiB7IHN0YXR1c2VzOiBbMCwgMjAwXSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIC8vIEdvb2dsZSBGb250cyB3ZWJmb250IGZpbGVzIChQdWJsaWMgU2FucykgXHUyMDE0IGtlZXAgdGhlbSBmb3Igb2ZmbGluZS5cbiAgICAgICAgICAgIHVybFBhdHRlcm46ICh7IHVybCB9KSA9PiB1cmwub3JpZ2luID09PSBcImh0dHBzOi8vZm9udHMuZ3N0YXRpYy5jb21cIixcbiAgICAgICAgICAgIGhhbmRsZXI6IFwiQ2FjaGVGaXJzdFwiLFxuICAgICAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgICAgICBjYWNoZU5hbWU6IFwiZ29vZ2xlLWZvbnRzLXdlYmZvbnRzXCIsXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHsgbWF4RW50cmllczogMzAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDM2NSB9LFxuICAgICAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZTogeyBzdGF0dXNlczogWzAsIDIwMF0gfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgICBkZXZPcHRpb25zOiB7XG4gICAgICAgIGVuYWJsZWQ6IHRydWUsICAgICAgICAgICAgICAgICAgLy8gdGVzdCB0aGUgU1cgd2l0aCBgbnBtIHJ1biBkZXZgXG4gICAgICAgIHR5cGU6IFwibW9kdWxlXCIsXG4gICAgICB9LFxuICAgIH0pLFxuICBdLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQTZXLFNBQVMsb0JBQW9CO0FBQzFZLE9BQU8sV0FBVztBQUNsQixTQUFTLGVBQWU7QUFLeEIsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sUUFBUTtBQUFBLE1BQ04sY0FBYztBQUFBO0FBQUEsTUFDZCxZQUFZO0FBQUE7QUFBQTtBQUFBLE1BRVosZUFBZSxDQUFDLGdCQUFnQixnQkFBZ0Isb0JBQW9CLHdCQUF3QixrQkFBa0IsbUJBQW1CO0FBQUEsTUFDakksVUFBVTtBQUFBLFFBQ1IsTUFBTTtBQUFBLFFBQ04sWUFBWTtBQUFBLFFBQ1osYUFBYTtBQUFBLFFBQ2IsYUFBYTtBQUFBLFFBQ2Isa0JBQWtCO0FBQUEsUUFDbEIsU0FBUztBQUFBO0FBQUE7QUFBQTtBQUFBLFFBSVQsV0FBVztBQUFBLFFBQ1gsT0FBTztBQUFBO0FBQUE7QUFBQSxRQUdQLE9BQU87QUFBQSxVQUNMLEVBQUUsS0FBSyxpQkFBaUIsT0FBTyxXQUFXLE1BQU0sYUFBYSxTQUFTLE1BQU07QUFBQSxVQUM1RSxFQUFFLEtBQUssaUJBQWlCLE9BQU8sV0FBVyxNQUFNLGFBQWEsU0FBUyxNQUFNO0FBQUE7QUFBQSxVQUU1RSxFQUFFLEtBQUsscUJBQXFCLE9BQU8sV0FBVyxNQUFNLGFBQWEsU0FBUyxXQUFXO0FBQUEsUUFDdkY7QUFBQSxNQUNGO0FBQUEsTUFDQSxTQUFTO0FBQUE7QUFBQTtBQUFBO0FBQUEsUUFJUCxjQUFjLENBQUMsK0NBQStDO0FBQUEsUUFDOUQsa0JBQWtCO0FBQUEsUUFDbEIsdUJBQXVCO0FBQUEsUUFDdkIsZ0JBQWdCO0FBQUEsVUFDZDtBQUFBO0FBQUEsWUFFRSxZQUFZLENBQUMsRUFBRSxJQUFJLE1BQU0sSUFBSSxXQUFXO0FBQUEsWUFDeEMsU0FBUztBQUFBLFlBQ1QsU0FBUztBQUFBLGNBQ1AsV0FBVztBQUFBLGNBQ1gsWUFBWSxFQUFFLFlBQVksSUFBSSxlQUFlLEtBQUssS0FBSyxLQUFLLElBQUk7QUFBQSxjQUNoRSxtQkFBbUIsRUFBRSxVQUFVLENBQUMsR0FBRyxHQUFHLEVBQUU7QUFBQSxZQUMxQztBQUFBLFVBQ0Y7QUFBQSxVQUNBO0FBQUE7QUFBQSxZQUVFLFlBQVksQ0FBQyxFQUFFLElBQUksTUFBTSxJQUFJLFdBQVc7QUFBQSxZQUN4QyxTQUFTO0FBQUEsWUFDVCxTQUFTO0FBQUEsY0FDUCxXQUFXO0FBQUEsY0FDWCxZQUFZLEVBQUUsWUFBWSxJQUFJLGVBQWUsS0FBSyxLQUFLLEtBQUssSUFBSTtBQUFBLGNBQ2hFLG1CQUFtQixFQUFFLFVBQVUsQ0FBQyxHQUFHLEdBQUcsRUFBRTtBQUFBLFlBQzFDO0FBQUEsVUFDRjtBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsTUFDQSxZQUFZO0FBQUEsUUFDVixTQUFTO0FBQUE7QUFBQSxRQUNULE1BQU07QUFBQSxNQUNSO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSDtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
