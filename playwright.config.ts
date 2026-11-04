import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end runs (`docs/01-overview/environment-setup.md` § 5).
 *
 * The app needs both processes: Vite serves the bundle and proxies `/api` to `wrangler dev`. A run
 * without the Worker is a run that proves nothing about the API.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Pixel 7"],
  },
  webServer: [
    {
      command: "pnpm dev:worker",
      url: "http://127.0.0.1:8787/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "pnpm dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
