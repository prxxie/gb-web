/**
 * `US-PWA-001` AC1, AC2 and AC3 — the install and offline path, measured on a **production build**.
 *
 * The dev server ships no `sw.js` and resolves every `import()` over the network, so the three criteria that matter
 * here cannot be observed there: a worker that precaches the shell, a cold load under the transfer budget, and a bot
 * match that plays with the network off. This spec builds the app, serves `dist` with `vite preview` on its own port
 * (the dev servers from `playwright.config.ts` keep running for the other specs), and drives that.
 *
 * The build is ~15 s; the whole describe is serial because everything shares the one preview server.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

const PREVIEW_PORT = Number(process.env.E2E_PREVIEW_PORT ?? 5391);
const PREVIEW_URL = `http://127.0.0.1:${PREVIEW_PORT}`;
/** `NFR-03` / AC2: the whole cold load stays under five megabytes. */
const BUDGET_BYTES = 5 * 1024 * 1024;

let preview: ChildProcess | null = null;

async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`))));
    child.on("error", reject);
  });
}

test.describe.configure({ mode: "serial" });

test.describe("production build: install and offline play", () => {
  test.beforeAll(async () => {
    test.setTimeout(180_000);
    await run("pnpm", ["--filter", "@gbw/web", "build"]);
    preview = spawn(
      "pnpm",
      ["--filter", "@gbw/web", "exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(PREVIEW_PORT), "--strictPort"],
      { stdio: "inherit" },
    );
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (await reachable(PREVIEW_URL)) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`vite preview never answered on ${PREVIEW_URL}`);
  });

  test.afterAll(() => {
    preview?.kill("SIGTERM");
    preview = null;
  });

  test("TC-PWA-043: the worker installs and precaches the shell and the match (US-PWA-001 AC1)", async ({ page }) => {
    await page.goto(`${PREVIEW_URL}/`);
    await expect(page.getByTestId("play-bot")).toBeVisible();

    // `ready` resolves once a worker controls the page — not merely when one is installed.
    const scope = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.scope;
    });
    expect(scope).toBe(`${PREVIEW_URL}/`);

    const precache = await page.evaluate(async () => {
      const names = await caches.keys();
      const entries: { url: string; bytes: number }[] = [];
      for (const name of names) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const response = await cache.match(request);
          if (!response) continue;
          const body = await response.clone().arrayBuffer();
          entries.push({ url: new URL(request.url).pathname, bytes: body.byteLength });
        }
      }
      return { names, entries };
    });

    const urls = precache.entries.map((entry) => entry.url);
    // The shell, the styles and the match route are all there: that is what makes an offline cold start work.
    expect(urls.some((url) => url.endsWith("/index.html"))).toBe(true);
    expect(urls.some((url) => url.endsWith(".css"))).toBe(true);
    expect(urls.some((url) => /MatchPage-[^/]+\.js$/.test(url))).toBe(true);
    expect(urls.some((url) => /manifest\.webmanifest$/.test(url))).toBe(true);
    expect(stringSizes(precache.entries)).toBeGreaterThan(0);

    // AC2's budget, measured on the bytes the worker would serve: the served files, not a gzip estimate.
    const served = await page.evaluate(async (list: string[]) => {
      let total = 0;
      for (const url of list) {
        const response = await fetch(url);
        total += (await response.arrayBuffer()).byteLength;
      }
      return total;
    }, precache.entries.map((entry) => entry.url));
    expect(served).toBeLessThan(BUDGET_BYTES);
  });

  test("TC-PWA-044: a cold load stays under the transfer budget and fetches no match chunk (US-PWA-001 AC2)", async ({
    page,
  }) => {
    await page.goto(`${PREVIEW_URL}/`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("play-bot")).toBeVisible();

    const cold = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => ({
        name: entry.name,
        transfer: (entry as PerformanceResourceTiming).transferSize ?? 0,
      })),
    );
    const total = cold.reduce((sum, entry) => sum + entry.transfer, 0);

    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(BUDGET_BYTES);
    // The bot button is on screen before the match chunk is asked for: clicking it is what fetches that half.
    expect(cold.filter((entry) => /MatchPage-[^/]+\.js$/.test(entry.name))).toEqual([]);

    const afterClick = page.waitForRequest(/MatchPage-[^/]+\.js$/);
    await page.getByTestId("play-bot").click();
    await afterClick;
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("TC-PWA-064: with the network off, the menu renders and a bot match plays (US-PWA-001 AC3)", async ({
    page,
    context,
  }) => {
    await page.goto(`${PREVIEW_URL}/`);
    await expect(page.getByTestId("play-bot")).toBeVisible();
    // A second load, so the reload below is served by the worker rather than by the network.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect(page.getByTestId("play-bot")).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId("play-bot")).toBeVisible();

    await page.getByTestId("play-bot").click();
    await expect(page.getByTestId("match-screen")).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible();

    // "Playable", not "renders": the clock counts and a pull charges power, both with the network still off.
    const clock = page.getByTestId("turn-clock");
    await expect(clock).toBeVisible();
    const before = await clock.innerText();
    await expect
      .poll(() => clock.innerText(), { timeout: 5_000, message: "the turn clock runs offline" })
      .not.toBe(before);

    const box = await page.locator("canvas").boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    // The right half of the field: the pad rings the mobile on the left, and a press that lands on it is the pad's.
    const startX = box.x + box.width * 0.6;
    const startY = box.y + box.height * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
  // A press has to be held before it arms a shot (`HOLD_MS` 300 ms, `TC-MATCH-911`); a drag on its own pans.
  await page.waitForTimeout(400);
    await page.mouse.move(startX - 120, startY + 90, { steps: 12 });
    await expect(page.getByTestId("power-value")).not.toHaveText("0.00");
    await page.mouse.up();
    // The turn resolves locally and the pull was spent: the readout drops back to zero and no event log is drawn over the
    // field (the owner struck it, 2026-11-09 — it sat mid-screen, over the arc the shell flies).
    await expect(page.getByTestId("event-feed")).toHaveCount(0);
    await expect(page.getByTestId("power-value")).toHaveText(/0\.00/);
  });
});

function stringSizes(entries: { url: string; bytes: number }[]): number {
  return entries.reduce((sum, entry) => sum + entry.bytes, 0);
}

/** Unused helper kept out: `Page` is only imported for the type of the fixtures above. */
export type { Page };
