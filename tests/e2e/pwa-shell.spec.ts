/**
 * `US-PWA-001` AC6/AC7 and `US-PWA-003` (`docs/03-stories/EPIC-07-pwa-i18n/US-PWA-003-landscape-gate.md`).
 *
 * What the browser sees before the game draws: an installable landscape manifest, and the rotate notice —
 * not a squeezed version of the game — whenever the window is taller than it is wide.
 */
import { expect, test } from "@playwright/test";
import { openBotMatch } from "./support";

const MANIFEST = "/manifest.webmanifest";

test.describe("installed-app surface", () => {
  test("TC-PWA-047: the shell declares an installable, landscape app (US-PWA-001 AC7)", async ({ page }) => {
    await page.goto("/");

    const link = page.locator('link[rel="manifest"]');
    await expect(link).toHaveAttribute("href", MANIFEST);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0b1020");

    const manifest = await (await page.request.get(MANIFEST)).json();
    expect(manifest.name).toBe("Game Bắn Súng Đạn Theo Lượt");
    expect(manifest.short_name).toBe("GBW");
    expect(manifest.display).toBe("fullscreen");
    expect(manifest.orientation).toBe("landscape");
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(["192x192", "512x512", "512x512"]);

    // The icons the manifest promises must really be served at those sizes.
    for (const size of ["192", "512"]) {
      const response = await page.request.get(`/icons/icon-${size}.png`);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
    }
  });
});

test.describe("the tab iOS opens", () => {
  test("TC-PWA-046: a normal tab, never a home-screen shell of its own (US-PWA-001 AC6)", async ({ page }) => {
    // `apple-mobile-web-app-capable` would make iOS open the app outside the browser chrome, where the update
    // prompt and the safe-area insets behave differently; the manifest is the only install path (`AC7`).
    const html = await (await page.request.get("/")).text();
    expect(html).not.toContain("apple-mobile-web-app-capable");
    expect(html).toContain('name="viewport"');
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain('rel="manifest"');
  });
});

test.describe("landscape gate", () => {
  test("TC-PWA-063: a portrait window shows the notice instead of a mangled game", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto("/");

    const hint = page.getByTestId("orientation-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("Xoay ngang thiết bị để chơi.");
    // Nothing of the game is reachable behind the notice: the menu heading stays mounted but hidden, and the
    // only control the player gets is the language switch (`US-PWA-003` AC3).
    await expect(page.locator("#main h1")).toHaveCount(1);
    await expect(page.locator("#main h1")).not.toBeVisible();
    await expect(hint.getByRole("button")).toHaveCount(1);
  });

  test("TC-PWA-063: rotating back to landscape paints the requested route without a reload", async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto("/leaderboard");
    await expect(page.getByTestId("orientation-hint")).toBeVisible();

    await page.setViewportSize({ width: 915, height: 412 });

    await expect(page.getByTestId("orientation-hint")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Bảng xếp hạng" })).toBeVisible();
    await expect(page).toHaveURL(/\/leaderboard$/);
    const navigations = await page.evaluate(() => performance.getEntriesByType("navigation").length);
    expect(navigations).toBe(1);
  });

  test("TC-PWA-063: the notice speaks the player's language", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("gbw.locale", "en"));
    await page.setViewportSize({ width: 412, height: 915 });
    await page.goto("/");

    await expect(page.getByTestId("orientation-hint")).toContainText("Rotate the device to landscape to play.");
  });

  test("TC-PWA-131: keyboard navigation lands focus on the new screen's heading", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Bảng xếp hạng" }).click();

    await expect(page.locator("#main h1")).toBeFocused();
  });

  test("US-PWA-003 AC6: a desktop window taller than it is wide is portrait too", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.goto("/");

    await expect(page.getByTestId("orientation-hint")).toBeVisible();
  });

  test("US-PWA-003 AC4: a tablet's extra height goes to the battlefield, not to a stretched canvas", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await openBotMatch(page);

    const match = await page.locator(".match").boundingBox();
    const canvas = await page.locator("canvas").boundingBox();
    // The phone profile gives the battlefield 313 px; a 1024 × 768 tablet must use the height it has.
    expect(match?.height ?? 0).toBeGreaterThan(500);
    expect(canvas?.height ?? 0).toBeLessThanOrEqual(match?.height ?? 0);
    expect(canvas?.width ?? 0).toBeLessThanOrEqual(match?.width ?? 0);
  });

  test("US-PWA-003 AC5: rotating mid-match keeps the match and rescales the battlefield", async ({ page }) => {
    await openBotMatch(page);
    await page.evaluate(() => {
      const canvas = document.querySelector("canvas") as (HTMLCanvasElement & { __gbwMarker?: number }) | null;
      if (canvas) canvas.__gbwMarker = 1;
    });
    const clockBefore = (await page.getByTestId("turn-clock").textContent()) ?? "";

    await page.setViewportSize({ width: 412, height: 915 });
    await expect(page.getByTestId("orientation-hint")).toBeVisible();
    await page.setViewportSize({ width: 915, height: 412 });

    await expect(page.getByTestId("orientation-hint")).toHaveCount(0);
    await expect(page.getByTestId("match-screen")).toBeVisible();
    // The scene was rescaled, not recreated, and the turn clock did not restart: no turn was lost.
    await expect(page.locator(".match__canvas")).toBeVisible();
    const kept = await page.evaluate(() => {
      const canvas = document.querySelector("canvas") as (HTMLCanvasElement & { __gbwMarker?: number }) | null;
      return { marker: canvas?.__gbwMarker ?? null, width: canvas?.width ?? 0 };
    });
    expect(kept.marker).toBe(1);
    expect(kept.width).toBeGreaterThan(0);
    const seconds = (text: string | null): number => Number((text ?? "").replace(/\D/g, ""));
    expect(seconds(await page.getByTestId("turn-clock").textContent())).toBeLessThanOrEqual(seconds(clockBefore));
  });
});
