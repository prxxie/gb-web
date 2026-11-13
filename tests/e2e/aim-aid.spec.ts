/**
 * `US-BAL-003`: the aim aid may only show what the player can already see.
 *
 * The aid used to draw the whole flight, which on a 2.5-màn map revealed the landing point of a shot the player cannot see —
 * the one-screen rule of `US-BAL-002` would be decorative with it on. These cases read the arc's end from the scene's own
 * report (`data-preview-max-x`, `data-preview-clipped`) rather than diffing screenshots: a pixel test would pass on an arc
 * that happens to be off screen half the time.
 */
import { expect, test, type Page } from "@playwright/test";
import { openBotMatch } from "./support";

/** Pull hard once, then read what the scene says it drew. */
async function pullHard(page: Page): Promise<void> {
  const origin = await page.evaluate(() => ({ x: Math.round(innerWidth * 0.62), y: Math.round(innerHeight * 0.55) }));
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.move(origin.x + 330, origin.y + 8, { steps: 8 });
  await page.waitForTimeout(150);
}

test.describe("the aim aid", () => {
  test("TC-BAL-116 / US-BAL-003 AC1: the arc stops at the window's edge", async ({ page }) => {
    await openBotMatch(page);
    const screen = page.getByTestId("match-screen");
    await expect(screen).toHaveAttribute("data-field-width", "800", { timeout: 5_000 });

    await page.getByTestId("aim-aid").click();
    await expect(page.getByTestId("aim-aid")).toHaveAttribute("aria-pressed", "true");
    await pullHard(page);

    // A hard shot from a mobile near the left edge leaves the frame: the aid must say so, and its arc must end on the edge.
    await expect(screen).toHaveAttribute("data-preview-clipped", "true", { timeout: 3_000 });
    const maxX = Number(await screen.getAttribute("data-preview-max-x"));
    const left = Number(await screen.getAttribute("data-field-x"));
    const width = Number(await screen.getAttribute("data-field-width"));
    expect(Number.isFinite(maxX)).toBe(true);
    // Not one world unit past the right edge: the landing point stays the player's calculation.
    expect(maxX).toBeLessThanOrEqual(left + width);
    await page.mouse.up();
  });

  test("TC-BAL-117 / US-BAL-003 AC4: with the aid off nothing is previewed, and the choice survives a reload", async ({ page }) => {
    await openBotMatch(page);
    const screen = page.getByTestId("match-screen");
    await expect(page.getByTestId("aim-aid")).toHaveAttribute("aria-pressed", "false");

    await pullHard(page);
    // No arc, so the scene never reports one: the aid is a stored setting, off unless the player asks for it.
    expect(await screen.getAttribute("data-preview-max-x")).toBe("");
    await page.mouse.up();

    // …and the choice is remembered across a reload.
    await page.getByTestId("aim-aid").click();
    await expect(page.getByTestId("aim-aid")).toHaveAttribute("aria-pressed", "true");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("aim-aid")).toHaveAttribute("aria-pressed", "true", { timeout: 8_000 });
  });
});
