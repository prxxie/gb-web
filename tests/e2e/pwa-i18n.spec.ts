/**
 * `US-PWA-002` (`docs/03-stories/EPIC-07-pwa-i18n/US-PWA-002-switch-between-vietnamese-and-english.md`) AC4 and AC5.
 *
 * Switching language while a match runs must repaint the text — the HUD — and leave the battlefield alone.
 * And the longer English labels must fit: a control that overflows its box is a clipped label.
 */
import { expect, test } from "@playwright/test";
import { openBotMatch } from "./support";

test.describe("live language switch", () => {
  test("US-PWA-002 AC4: toggling mid-match repaints the HUD and leaves the canvas element alone", async ({ page }) => {
    await openBotMatch(page);
    await page.evaluate(() => {
      (window as unknown as { marker: number }).__gbwCanvas = 1;
      const canvas = document.querySelector("canvas");
      if (canvas) (canvas as HTMLElement & { __gbwMarker?: number }).__gbwMarker = 1;
    });

    await page.getByTestId("locale-toggle").click();

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("match-screen")).toBeVisible();
    // The same canvas element survived the switch: it was not re-created, so the scene was not restarted.
    const canvasKept = await page.evaluate(() => {
      const canvas = document.querySelector("canvas") as (HTMLCanvasElement & { __gbwMarker?: number }) | null;
      return { marker: canvas?.__gbwMarker ?? null, count: document.querySelectorAll("canvas").length };
    });
    expect(canvasKept).toEqual({ marker: 1, count: 1 });
  });

  test("TC-PWA-162: English labels fit inside their controls on the menu and in the match", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("gbw.locale", "en"));
    await page.goto("/");

    const overflowing = async (): Promise<string[]> =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll("button, a, h1, h2, td, th"))
          .filter((element) => element.getClientRects().length > 0 && element.scrollWidth > element.clientWidth + 1)
          .map((element) => `${element.tagName}: ${(element.textContent ?? "").trim().slice(0, 40)}`),
      );

    expect(await overflowing()).toEqual([]);

    await openBotMatch(page);
    expect(await overflowing()).toEqual([]);
  });
});
