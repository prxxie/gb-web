/**
 * `US-MATCH-012` (`docs/03-stories/EPIC-05-match-ui/US-MATCH-012-one-shell-in-the-air.md`).
 *
 * The engine resolves a shot in one tick and hands the turn over at once, so the previous version let the bot fire
 * ~1.4 s later — straight into the flight of the player's own shell. Two shells in the air is not a turn-based game.
 * These cases pin the hand-over from both sides: the bot waits for the sky, and a seat cannot fire into it either.
 */
import { expect, test, type Page } from "@playwright/test";
import { openBotMatch } from "./support";

/** The weapon strip is enabled exactly when it is this client's turn. */
async function myTurn(page: Page): Promise<boolean> {
  const weapon = page.getByTestId("weapon-0");
  return (await weapon.count()) > 0 && !(await weapon.first().evaluate((el) => (el as HTMLButtonElement).disabled));
}

async function waitForMyTurn(page: Page): Promise<boolean> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await myTurn(page)) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

/** Hold to arm the pull, then drag: sideways gives power, downward gives the angle. */
async function pull(page: Page): Promise<void> {
  const origin = await page.evaluate(() => ({ x: Math.round(innerWidth * 0.62), y: Math.round(innerHeight * 0.55) }));
  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.move(origin.x + 300, origin.y + 8, { steps: 8 });
  await page.waitForTimeout(120);
  await page.mouse.up();
}

const announceText = async (page: Page): Promise<string> =>
  ((await page.getByTestId("match-announce").textContent()) ?? "").replace(/\s+/g, " ").trim();

/** Wait for a live-region line that is not about this seat — i.e. the opponent has just launched its shell. */
async function waitForOpponentLine(page: Page, me: string | null): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const text = await announceText(page);
    if (text.length > 0 && !(me && text.includes(me))) return text;
    await page.waitForTimeout(50);
  }
  return "";
}

test.describe("one shell in the air", () => {
  test("US-MATCH-012 AC1: the bot does not answer while the player's shell is still flying", async ({ page }) => {
    await openBotMatch(page);
    expect(await waitForMyTurn(page)).toBe(true);

    const announce = page.getByTestId("match-announce");
    // The line is read before the shot, and it names this seat: every later line can then be attributed without
    // guessing at the opponent's label.
    const before = await announceText(page);
    const me = before.match(/Guest\s+[A-Za-z0-9]+/)?.[0] ?? null;
    await pull(page);

    // The shot resolves at once, so the live region changes before the shell has landed, and the field reports itself
    // busy for as long as the renderer will animate it.
    await expect(announce).not.toHaveText(before, { timeout: 4_000 });
    const screen = page.getByTestId("match-screen");
    await expect(screen).toHaveAttribute("data-cinematic", "true");

    // The field clears itself when the shell has landed — a hand-over that never ends would wedge the game.
    await expect(screen).toHaveAttribute("data-cinematic", "false", { timeout: 8_000 });
    // …and the moment the sky is clear, the live region still holds this seat's shot: the opponent waited out the whole
    // flight instead of answering 1.4 s into it, which is what put two shells on screen at once.
    const atClear = await announceText(page);
    expect(me, "the announce line does not name this seat, so its shot cannot be told apart").not.toBeNull();
    expect(atClear, `the opponent acted before this shell landed: ${atClear}`).toContain(me as string);
  });

  test("US-MATCH-012 AC2: a seat cannot fire into the shell the previous turn left in the air", async ({ page }) => {
    await openBotMatch(page);
    expect(await waitForMyTurn(page)).toBe(true);

    const before = await announceText(page);
    const me = before.match(/Guest\s+[A-Za-z0-9]+/)?.[0] ?? null;
    await pull(page);

    // The opponent's own shot is the occupied sky. Polling every 50 ms matters: the flight lasts a few seconds, and a
    // slow read would measure the moment after it landed instead of during it.
    const opponentLine = await waitForOpponentLine(page, me);
    expect(opponentLine, "the opponent never fired, so there was no shell to fire into").not.toBe("");

    // The opponent just fired: press and drag immediately. The pull must not arm, so the power readout stays at zero.
    const origin = await page.evaluate(() => ({ x: Math.round(innerWidth * 0.62), y: Math.round(innerHeight * 0.55) }));
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await page.mouse.move(origin.x + 300, origin.y + 8, { steps: 8 });
    await page.waitForTimeout(120);
    // The chip prints the angle and the power in one string ("45°0.00"): the power is the trailing decimal.
    const chip = (await page.getByTestId("power-value").textContent()) ?? "";
    const power = Number.parseFloat(chip.match(/(\d+\.\d+)\s*$/)?.[1] ?? "NaN");
    await page.mouse.up();

    expect(power).toBe(0);
  });
});
