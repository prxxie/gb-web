/**
 * `US-BAL-001` / `US-BAL-002` (`docs/03-stories/EPIC-09-ballistics/`).
 *
 * The field shows exactly one screen — 800 units, eight parts of 100 — a measure view opens it to the whole map and snaps
 * back on its own, no shot can leave while it is open, and a tap on the ground prints the distance in parts.
 */
import { expect, test } from "@playwright/test";
import { openBotMatch } from "./support";

test.describe("one screen", () => {
  test("US-BAL-002 AC1 / US-BAL-001 AC2: the field is one screen wide and divided into eight parts", async ({ page }) => {
    await openBotMatch(page);
    // 800 units: one screen, eight parts of 100, whatever the canvas.
    await expect(page.getByTestId("match-screen")).toHaveAttribute("data-field-width", "800", { timeout: 5_000 });
  });

  test("TC-BAL-107 / US-BAL-002 AC3: measuring opens the whole map and snaps back on its own", async ({ page }) => {
    await openBotMatch(page);
    const screen = page.getByTestId("match-screen");
    await expect(screen).toHaveAttribute("data-field-width", "800", { timeout: 5_000 });

    await page.getByTestId("measure").click();
    // The whole 2,000-unit map: 2.5 screens, twenty parts.
    await expect(screen).toHaveAttribute("data-field-width", "2000", { timeout: 2_000 });
    // …and it closes itself, so the player never has to find a button to get their screen back.
    await expect(screen).toHaveAttribute("data-field-width", "800", { timeout: 6_000 });
  });

  test("TC-BAL-108 / US-BAL-002 AC4: no shot leaves while the field is open to measure", async ({ page }) => {
    await openBotMatch(page);
    // The press coordinates are read **before** the click: every round-trip between opening the view and pressing it burns
    // the measure window, and a loaded machine can spend the whole 2.5 s on two calls.
    const origin = await page.evaluate(() => ({ x: Math.round(innerWidth * 0.62), y: Math.round(innerHeight * 0.55) }));
    await page.getByTestId("measure").click();

    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await page.mouse.move(origin.x + 200, origin.y + 8, { steps: 6 });
    await page.waitForTimeout(80);
    const chip = (await page.getByTestId("power-value").textContent()) ?? "";
    const power = Number.parseFloat(chip.match(/(\d+\.\d+)\s*$/)?.[1] ?? "NaN");
    await page.mouse.up();
    // The press only closes the view: a measure view that also aimed would be a free look at the map with the barrel loaded.
    expect(power).toBe(0);
  });

  test("TC-BAL-109 / US-BAL-002 AC5: the camera rides the shell after a release", async ({ page }) => {
    await openBotMatch(page);
    const screen = page.getByTestId("match-screen");
    await expect(screen).toHaveAttribute("data-field-width", "800", { timeout: 5_000 });
    const before = Number(await screen.getAttribute("data-field-x"));

    const origin = await page.evaluate(() => ({ x: Math.round(innerWidth * 0.62), y: Math.round(innerHeight * 0.55) }));
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await page.mouse.move(origin.x + 300, origin.y + 8, { steps: 8 });
    await page.waitForTimeout(120);
    await page.mouse.up();

    // The window slides with the shell, still exactly one screen wide: the player watches the shot, not the map.
    let moved = false;
    for (let step = 0; step < 30 && !moved; step += 1) {
      await page.waitForTimeout(100);
      const now = Number(await screen.getAttribute("data-field-x"));
      moved = Number.isFinite(now) && Math.abs(now - before) > 0;
      expect(Number(await screen.getAttribute("data-field-width"))).toBe(800);
    }
    expect(moved, "the camera never moved while the shell was in the air").toBe(true);
  });

  test("TC-BAL-110 / US-BAL-002 AC6: the measure button is real, and a press while measuring is announced", async ({ page }) => {
    await openBotMatch(page);
    const measure = page.getByTestId("measure");
    const box = await measure.boundingBox();
    // The 44 px floor (`NFR-17`) and an accessible name, not an icon with a title.
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect((await measure.getAttribute("aria-label"))?.length ?? 0).toBeGreaterThan(0);

    await measure.click();
    // A press on the field itself, not on the HUD strip across the top — and immediately, for the reason above.
    const field = await page.evaluate(() => ({ x: Math.round(innerWidth * 0.5), y: Math.round(innerHeight * 0.45) }));
    await page.mouse.click(field.x, field.y);
    // Refused, and said out loud: a silent refusal reads as a dead control.
    await expect(page.getByTestId("banner")).toContainText("Đang mở để đo", { timeout: 3_000 });
  });

  test("TC-BAL-103 / US-BAL-001 AC3: a tap on the ground prints the distance and the height in parts", async ({ page }) => {
    await openBotMatch(page);
    const field = page.getByTestId("match-screen");
    const box = await field.boundingBox();
    expect(box).not.toBeNull();
    // A tap that neither pulls nor pans: the scene reports the point, the HUD prints it in parts of a screen.
    await page.mouse.click(Math.round((box?.x ?? 0) + (box?.width ?? 0) * 0.7), Math.round((box?.y ?? 0) + (box?.height ?? 0) * 0.5));
    const probe = page.getByTestId("probe");
    await expect(probe).toBeVisible({ timeout: 3_000 });
    await expect(probe).toContainText("phần");
  });
});
