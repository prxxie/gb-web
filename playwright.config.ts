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
/**
 * `E2E_SERVERS_EXTERNAL=1` means someone already started both processes (CI does, so a server that fails to
 * boot fails the workflow step with its own log instead of Playwright's bare "Timed out waiting 60000ms").
 */
const EXTERNAL_SERVERS = process.env.E2E_SERVERS_EXTERNAL === "1";
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
    // Every request the run makes claims its own address: `NFR-25` allows ten rooms a minute per address,
    // and a spec file that creates rooms would otherwise spend one shared local budget across the run.
    extraHTTPHeaders: { "cf-connecting-ip": `198.51.100.${1 + (Date.now() % 200)}` },
  },
  webServer: EXTERNAL_SERVERS
    ? undefined
    : [
        {
          command: "pnpm dev:worker",
          url: "http://127.0.0.1:8787/api/v1/health",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
        {
          command: `pnpm dev --port ${WEB_PORT} --strictPort`,
          // The flows below are the guest/game paths: a real Clerk key in `.env.local` would load the identity
          // SDK and hide the "no key" screen the sign-in cases assert (`TC-PWA-139`), so e2e pins it empty.
          env: { ...process.env, VITE_CLERK_PUBLISHABLE_KEY: "" } as Record<string, string>,
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      ],
});
