/**
 * `US-PWA-001` §5 (`docs/03-stories/EPIC-07-pwa-i18n/US-PWA-001-offline-shell.md`).
 *
 * With the network gone the shell still renders and still explains itself: the bot match stays available and
 * every action that needs the server is disabled with a sentence saying why.
 */
import { expect, test } from "@playwright/test";

test.describe("offline shell", () => {
  test("TC-PWA-064: the menu stays usable and stops the actions that need the server", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.getByTestId("play-bot")).toBeEnabled();

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    await expect(page.getByTestId("offline-rooms")).toBeVisible();
    await expect(page.getByTestId("create-room")).toBeDisabled();
    await expect(page.getByTestId("join-room")).toBeDisabled();
    await expect(page.getByTestId("signin-disabled")).toBeVisible();
    await expect(page.getByRole("link", { name: "Đăng nhập" })).toHaveCount(0);
    // Bot matches are local, so the primary action of the menu must survive the network going away.
    await expect(page.getByTestId("play-bot")).toBeEnabled();
  });

  test("TC-PWA-064: the leaderboard says it needs a connection instead of failing silently", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    await page.getByRole("link", { name: "Bảng xếp hạng" }).click();

    await expect(page.getByTestId("leaderboard-error")).toHaveText("Bạn đang ngoại tuyến — chỉ chơi được với máy.");
  });
});
