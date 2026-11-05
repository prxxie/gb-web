import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      // `US-PWA-001` AC1/AC5: the app registers the worker itself (`src/app/serviceWorker.ts`), so a new
      // deploy parks a waiting worker and the visible "Cập nhật" prompt decides when it takes over.
      injectRegister: null,
      // The manifest is a static file in `public/`, not generated here: one source for dev, preview and the
      // deployed build, and no second `<link>` to reconcile with the one `index.html` already has.
      manifest: false,
      includeAssets: ["manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,json,webmanifest,png,svg,webp,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@gbw/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true, ws: true },
    },
  },
  build: { target: "es2022", sourcemap: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
