/**
 * `US-PWA-004` AC5 (`docs/03-stories/EPIC-07-pwa-i18n/US-PWA-004-meet-the-accessibility-bar.md`).
 *
 * The battlefield is a canvas, which a screen reader cannot read. So the turn and the remaining HP are
 * mirrored into one polite live region, and the canvas itself is kept out of the accessibility tree.
 */
import { expect, test } from "@playwright/test";
import { openBotMatch } from "./support";

test.describe("match announcements", () => {
  test("US-PWA-004 AC5: the turn is announced in one polite live region and the canvas stays silent", async ({ page }) => {
    await openBotMatch(page);

    const live = page.locator('[role="status"][aria-live="polite"], [role="status"]');
    const announce = page.getByTestId("match-announce");
    await expect(announce).toHaveCount(1);
    await expect(announce).toHaveAttribute("role", "status");
    await expect(announce).toHaveAttribute("aria-live", "polite");
    // Exactly one polite region on the screen: a second one would make the reader interrupt itself.
    await expect(live).toHaveCount(1);
    await expect(announce).toContainText(/\d+/);

    // The canvas is decoration for assistive technology; the text above is the accessible state.
    await expect(page.locator(".match__canvas")).toHaveAttribute("aria-hidden", "true");
  });
});
