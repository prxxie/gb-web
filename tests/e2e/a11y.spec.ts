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

test("TC-FND-133: the shell never scrolls sideways and keeps a 44 px touch floor", async ({ page }) => {
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const measured = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      windowWidth: window.innerWidth,
      tooSmall: Array.from(document.querySelectorAll("button, a"))
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => ({ text: (element.textContent ?? "").trim().slice(0, 24), box: element.getBoundingClientRect() }))
        .filter((entry) => entry.box.width < 44 || entry.box.height < 44)
        .map((entry) => entry.text),
    }));

    // One pixel of slack: `scrollWidth` is an integer rounded up from the layout, not a real overflow.
    expect(measured.documentWidth, `horizontal scroll at ${viewport.width}`).toBeLessThanOrEqual(
      measured.windowWidth + 1,
    );
    expect(measured.tooSmall, `controls under 44 px at ${viewport.width}`).toEqual([]);
  }
});
