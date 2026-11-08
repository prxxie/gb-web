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
    // The ruler count is `clamp(round(8 × visibleWidth / 1000), 8, 16)`, so it is 8 on a 5:3 screen and more on a
    // landscape phone, where the camera window keeps its 600 units of height and gains width (`US-MATCH-007`).
    const segments = Number(await page.getByTestId("ruler").getAttribute("data-segments"));
    expect(segments).toBeGreaterThanOrEqual(8);
    expect(segments).toBeLessThanOrEqual(16);
    // One division is always ~125 units, and every division is labelled, so the strip measures the window.
    const ticks = page.getByTestId("ruler").locator(".ruler__tick");
    await expect(ticks).toHaveCount(segments + 1);
    const last = Number(await ticks.last().innerText());
    expect(Math.abs(last / segments - 125)).toBeLessThan(6);
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
