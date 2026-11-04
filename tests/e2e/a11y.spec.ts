import { expect, test } from "@playwright/test";

/**
 * `TC-PWA-158`, `TC-PWA-160`.
 *
 * Touch targets and labels on the menu — the screen a player meets first, and the one a screen
 * reader has to describe before any match exists.
 */
test("TC-PWA-158: every button on the menu has an accessible name and a 44 px target", async ({ page }) => {
  await page.goto("/");
  const buttons = page.getByRole("button");
  const count = await buttons.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    const name = (await button.getAttribute("aria-label")) ?? (await button.textContent()) ?? "";
    expect(name.trim().length).toBeGreaterThan(0);
    const box = await button.boundingBox();
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
});
