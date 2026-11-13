/**
 * `US-MATCH-011` AC1 (`docs/03-stories/EPIC-05-match-ui/US-MATCH-011-render-at-the-screens-density.md`).
 *
 * The battlefield used to be rasterised at one device pixel per CSS pixel — `Scale.RESIZE` forces the canvas backing
 * store to the parent's CSS size — and the compositor stretched it. On a 2.6-ratio phone that is the aliasing the owner
 * reported from production. The game size is now the device-pixel size, with `scale.zoom` styling the canvas back down to
 * its parent.
 */
import { expect, test, type Page } from "@playwright/test";
import { openBotMatch } from "./support";

/** The weapon strip is enabled exactly when it is this client's turn. */
async function waitForMyTurn(page: Page): Promise<boolean> {
  const weapon = page.getByTestId("weapon-0");
  for (let attempt = 0; attempt < 60; attempt += 1) {
    // The strip is a real `<button>`: `disabled` is the flag the component sets, not an aria attribute.
    if ((await weapon.count()) > 0 && !(await weapon.first().evaluate((el) => (el as HTMLButtonElement).disabled))) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

test.describe("the battlefield renders at the screen's density", () => {
  test("US-MATCH-011 AC1: the canvas backing store carries the device ratio while its CSS size stays the parent's", async ({
    page,
  }) => {
    await openBotMatch(page);

    const measured = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        ratio: canvas.width / rect.width,
        backing: { width: canvas.width, height: canvas.height },
        css: { width: Math.round(rect.width), height: Math.round(rect.height) },
        parent: { width: canvas.parentElement?.clientWidth ?? 0, height: canvas.parentElement?.clientHeight ?? 0 },
        devicePixelRatio: window.devicePixelRatio,
      };
    });
    expect(measured).not.toBeNull();
    const facts = measured!;

    // The profile is a 2.625-ratio phone, so the cap applies; a 1-ratio desktop would ask for 1.
    const expected = Math.min(Math.max(facts.devicePixelRatio, 1), 2);
    expect(facts.ratio).toBeCloseTo(expected, 1);
    // The canvas still occupies exactly the space its parent gave it: the extra pixels are density, not layout.
    expect(facts.css.width).toBe(facts.parent.width);
    expect(facts.css.height).toBe(facts.parent.height);
    expect(facts.backing.width).toBeGreaterThanOrEqual(facts.css.width);
  });

  test("US-MATCH-011 AC2: a drag is still measured in CSS pixels, not device pixels", async ({ page }) => {
    await openBotMatch(page);
    expect(await waitForMyTurn(page)).toBe(true);

    const angle = page.getByTestId("angle-value");
    const before = Number.parseFloat((await angle.textContent()) ?? "");
    const origin = await page.evaluate(() => ({ x: Math.round(innerWidth * 0.62), y: Math.round(innerHeight * 0.55) }));
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    // A hold arms the pull. The drag carries sideways travel as well, because the readout only reports an angle once the
    // pull has power — a straight-down drag rotates the barrel but reads as no pull at all (found while writing this).
    await page.waitForTimeout(450);
    await page.mouse.move(origin.x + 60, origin.y + 12, { steps: 6 });
    await page.waitForTimeout(150);
    const during = Number.parseFloat((await angle.textContent()) ?? "");
    await page.mouse.up();

    // 12 CSS px at `ANGLE_DEG_PER_PX` (0.25) is 3°, not the 7.9° a device-pixel measurement would give.
    const swept = before - during;
    expect(swept).toBeGreaterThan(2);
    expect(swept).toBeLessThan(4.5);
  });

  test("US-MATCH-011 AC3: holding on the mobile still opens the loadout wheel", async ({ page }) => {
    await openBotMatch(page);
    expect(await waitForMyTurn(page)).toBe(true);

    let opened = false;
    // The window is one screen wide and centred on the shooter (`US-BAL-002`), so the hull sits around a quarter of the
    // way across, not at the tenth a half-map window put it at.
    for (const [fx, fy] of [
      [0.22, 0.7], [0.26, 0.68], [0.3, 0.72], [0.2, 0.66], [0.34, 0.7], [0.1, 0.65], [0.16, 0.7], [0.4, 0.68],
    ]) {
      if (!(await waitForMyTurn(page))) break;
      const point = await page.evaluate(([x, y]) => ({ x: Math.round(innerWidth * x), y: Math.round(innerHeight * y) }), [fx, fy]);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await page.waitForTimeout(800);
      opened = (await page.locator('[data-testid="item-wheel"]').count()) > 0;
      await page.mouse.up();
      await page.waitForTimeout(250);
      if (opened) break;
    }
    // The hit test compares the press with the mobile's reported screen point; both are CSS pixels.
    expect(opened).toBe(true);
  });
});
