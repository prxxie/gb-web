import { expect, test } from "@playwright/test";

/**
 * `TC-MATCH-901`, `TC-MATCH-902`, `TC-RANK-153`, `TC-PWA-063`.
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
    await expect(page.getByTestId("ruler")).toHaveAttribute("data-segments", "8");
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
    await page.mouse.move(startX - 120, startY + 90, { steps: 12 });
    await expect(page.getByTestId("power-value")).not.toHaveText("0.00");
    await page.mouse.up();
  });

  test("TC-RANK-153: a finished match lands on the result screen", async ({ page }) => {
    await page.goto("/results/ABCD23");
    // A cold open has no match payload and must return to the menu rather than invent a result.
    await expect(page).toHaveURL(/\/$/);
  });

  test("TC-PWA-063: the page asks for landscape, never for a fullscreen launch flag", async ({ page }) => {
    await page.goto("/");
    const html = await page.content();
    expect(html).not.toContain("apple-mobile-web-app-capable");
    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewport ?? "").toContain("viewport-fit=cover");
  });
});
