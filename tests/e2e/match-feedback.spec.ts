/**
 * `TC-MATCH-900` — the polite live region says a shot happened.
 *
 * The play-through found the region frozen on the turn announcement: a screen-reader player heard whose turn it was and
 * never heard a shot land. The fix announces the shot's own numbers.
 *
 * The other two things the same session found are **not** asserted here, and `docs/05-quality/test-plan-status.md` § 3
 * records why: the angle readout following the pull and the pair framing on the canvas were verified by hand in a
 * landscape session with screenshots, because Playwright's mobile emulation does not deliver the drag to the canvas the
 * way a finger does (the same gesture reads 41–45° in a real page and clamps to −10° under the emulated device).
 */
import { expect, test, type Page } from "@playwright/test";

import { ownAddress } from "./support";


async function openBotMatch(page: Page): Promise<void> {
  await ownAddress(page);
  await page.goto("/");
  await page.getByTestId("play-bot").click();
  await expect(page.getByTestId("match-screen")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  // The scene needs a frame before a pointer reaches it, and the turn has to be this client's.
  await expect(page.getByTestId("turn-clock")).toBeVisible();
  await page.waitForTimeout(1_200);
}

/**
 * A pull that starts on bare canvas: `.match__top` sits above it and `.match__power` to the left, and neither takes a
 * press any more (`.match__hud > *` is `pointer-events: none`), but the gesture has to start where the canvas is the
 * topmost element or the browser never delivers a `pointerdown` to it.
 */
async function pull(page: Page, dx: number, dy: number): Promise<{ power: string; angle: string }> {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("canvas has no box");
  // The start point the smoke case uses: the phrase picker covers the middle of the battlefield, so a pull has to
  // begin to the right of it and above the ruler.
  const startX = box.x + box.width * 0.6;
  const startY = box.y + box.height * 0.5;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // A press has to be held before it arms a shot (`HOLD_MS` 300 ms, `TC-MATCH-911`); a drag on its own pans.
  await page.waitForTimeout(400);
  await page.mouse.move(startX + dx, startY + dy, { steps: 12 });
  await expect(page.getByTestId("power-value")).not.toHaveText("0.0", { timeout: 4_000 });
  await page.waitForTimeout(200);
  const readout = {
    power: await page.getByTestId("power-value").innerText(),
    angle: await page.getByTestId("angle-value").innerText(),
  };
  await page.mouse.up();
  return readout;
}

test("TC-MATCH-900: the live region says a shot happened", async ({ page }) => {
  await openBotMatch(page);
  const region = page.getByTestId("match-announce");
  // The turn announcement is what a screen reader hears first.
  await expect(region).toContainText(/Lượt của|turn/i);

  // Power counts the forward travel only, so the drag goes right (and up, which raises the barrel).
  await pull(page, 90, -62);
  // Fired and missed, or fired and hit: either way the region reports the shot rather than staying on the turn.
  await expect(region).toContainText(/bắn|trúng|fired|hit/i, { timeout: 5_000 });
});

/**
 * `TC-MATCH-908` — the trajectory aid is off until the player asks for it.
 *
 * The genre gives the player an angle number and a power bar; reading the arc is the skill. The aid was on for everyone,
 * which handed the answer to whoever pulled. Now it is a training wheel: off on a fresh device, remembered once chosen.
 */
test("TC-MATCH-908: the aim aid starts off and remembers being turned on", async ({ page }) => {
  await openBotMatch(page);
  const aid = page.getByTestId("aim-aid");
  await expect(aid).toBeVisible();
  await expect(aid).toHaveAttribute("aria-pressed", "false");

  await aid.click();
  await expect(aid).toHaveAttribute("aria-pressed", "true");

  // The choice survives a reload: re-learning an arc every session is not the point.
  await page.reload();
  await expect(page.getByTestId("match-screen")).toBeVisible();
  await expect(page.getByTestId("aim-aid")).toHaveAttribute("aria-pressed", "true");

  // And it can be put back, which is what a fresh device looks like.
  await page.getByTestId("aim-aid").click();
  await expect(page.getByTestId("aim-aid")).toHaveAttribute("aria-pressed", "false");
});

/**
 * `TC-MATCH-909` — going fullscreen keeps the HUD in the game.
 *
 * The fullscreen request used to be armed on the canvas, and fullscreen renders only the target's subtree: the first pull
 * of a match therefore hid the HP bars, the weapon strip, the turn clock and the aim-aid toggle, and every one of them
 * became unclickable. Found by playing, not by the suite — the HUD stayed queryable, so assertions kept passing.
 */
test("TC-MATCH-909: the HUD stays reachable after the match goes fullscreen", async ({ page }) => {
  await openBotMatch(page);
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("the canvas has no box");
  // The first pull is what arms the fullscreen request (`US-MATCH-007` AC1).
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.55);
  await page.mouse.down();
  // A press has to be held before it arms a shot (`HOLD_MS` 300 ms, `TC-MATCH-911`); a drag on its own pans.
  await page.waitForTimeout(400);
  await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.39, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(600);

  const reachable = await page.evaluate(() => {
    const aid = document.querySelector('[data-testid="aim-aid"]');
    if (!aid) return "no aid button";
    const rect = aid.getBoundingClientRect();
    const at = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return at?.getAttribute("data-testid") === "aim-aid" ? "reachable" : `covered by ${at?.tagName ?? "nothing"}`;
  });
  expect(reachable).toBe("reachable");
  // The fullscreen element, if the browser granted it, has to contain the HUD rather than being the bare canvas.
  const fullscreenIsTheScreen = await page.evaluate(() => {
    const element = document.fullscreenElement;
    return element === null || element.classList.contains("match");
  });
  expect(fullscreenIsTheScreen).toBe(true);
});

/**
 * `TC-MATCH-910` — the battlefield gets the whole viewport.
 *
 * The shared app bar (product name + language toggle) sat above every route and cost the match 77 of 390 px of a
 * landscape screen: a fifth of the field, spent on a name the player is already inside. The match renders without it.
 *
 * The language toggle used to be hosted inside the match HUD to compensate; the owner struck it from the match too
 * (2026-11-09) — a match is played, not configured, and the toggle is one tap away on every other route.
 */
test("TC-MATCH-910: the match fills the viewport and carries no chrome of its own", async ({ page }) => {
  await openBotMatch(page);

  const layout = await page.evaluate(() => {
    const canvas = document.querySelector("canvas")?.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      canvasTop: canvas ? Math.round(canvas.y) : null,
      canvasHeight: canvas ? Math.round(canvas.height) : null,
      barPresent: document.querySelector(".shell__bar") !== null,
      toggleCount: document.querySelectorAll('[data-testid="locale-toggle"]').length,
    };
  });

  expect(layout.barPresent).toBe(false);
  expect(layout.canvasTop).toBe(0);
  expect(layout.canvasHeight).toBe(layout.viewportHeight);
  // No language toggle in a match: it is not part of the field, and `TC-PWA-130` covers it on the routes that do carry it.
  expect(layout.toggleCount).toBe(0);
  await expect(page.getByTestId("match-screen")).toBeVisible();
});
