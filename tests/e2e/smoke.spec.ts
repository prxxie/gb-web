import { expect, test } from "@playwright/test";

/**
 * `TC-MATCH-901`, `TC-MATCH-902`, `TC-PWA-063`.
 *
 * The demo path the client judges first: menu → bot match → a shot → results.
 */
test.describe("solo demo path", () => {
  test("TC-MATCH-901: the battlefield mounts and the HUD reports the turn", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("mobile-picker")).toBeVisible();
    await page.getByTestId("play-bot").click();
    await expect(page.getByTestId("match-screen")).toBeVisible();
    await expect(page.getByTestId("turn-clock")).toBeVisible();
    await expect(page.getByTestId("wind-dial")).toBeVisible();
    // The bottom ruler is gone (owner's call): the bar carries S1/S2/SS, the skip icon, the six item slots, the wind to
    // come, the teams' health and the gold, all on one line — that row is what a player reads instead of a scale.
    const bar = page.locator(".match__bottom");
    await expect(bar).toBeVisible();
    await expect(page.getByTestId("weapon-0")).toBeVisible();
    await expect(page.getByTestId("weapon-2")).toBeVisible();
    await expect(page.getByTestId("match-skip")).toBeVisible();
    await expect(page.getByTestId("item-slots")).toBeVisible();
    await expect(page.getByTestId("weather-forecast")).toBeVisible();
    await expect(page.getByTestId("gold")).toBeVisible();
    await expect(page.getByTestId("ruler")).toHaveCount(0);
  });

  test("TC-MATCH-902: a one-finger pull raises the power readout", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("play-bot").click();
    await expect(page.getByTestId("match-screen")).toBeVisible();
    const box = await page.locator("canvas").boundingBox();
    if (!box) throw new Error("canvas has no box");
    const startX = box.x + box.width * 0.6;
    const startY = box.y + box.height * 0.5;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
  // A press has to be held before it arms a shot (`HOLD_MS` 300 ms, `TC-MATCH-911`); a drag on its own pans.
  await page.waitForTimeout(400);
    await page.mouse.move(startX - 120, startY + 90, { steps: 12 });
    await expect(page.getByTestId("power-value")).not.toHaveText("0.00");
    await page.mouse.up();
  });

  test("TC-PWA-063: the page asks for landscape, never for a fullscreen launch flag", async ({ page }) => {
    await page.goto("/");
    const html = await page.content();
    expect(html).not.toContain("apple-mobile-web-app-capable");
    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewport ?? "").toContain("viewport-fit=cover");
  });
});
