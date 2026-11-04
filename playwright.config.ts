import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end runs (`docs/01-overview/environment-setup.md` § 5).
 *
 * The app needs both processes: Vite serves the bundle and proxies `/api` to `wrangler dev`. A run
 * without the Worker is a run that proves nothing about the API.
 *
 * `E2E_BASE_URL` / `E2E_WEB_PORT` exist because port 5173 is often taken by another project's dev
 * server on this machine; pointing the run at a free port must not require editing this file.
 */
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5173);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${WEB_PORT}`;
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The game is landscape-only (`NFR-19`), so every run uses a landscape phone profile.
    ...devices["Pixel 7 landscape"],
  },
  webServer: [
    {
      command: "pnpm dev:worker",
      url: "http://127.0.0.1:8787/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm dev --port ${WEB_PORT} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
