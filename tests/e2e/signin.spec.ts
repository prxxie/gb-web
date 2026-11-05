/**
 * `docs/02-reference/screens/sign-in.md` — the sign-in screen must always offer the guest path, and
 * with no Clerk key configured it must say so instead of booting a half-configured SDK.
 */
import { expect, test } from "@playwright/test";

test.describe("sign-in", () => {
  test("TC-AUTH-135: guests are never forced to sign in — the menu is usable first", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("play-bot")).toBeEnabled();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByTestId("play-bot").click();
    await expect(page.getByTestId("match-screen")).toBeVisible();
  });

  test("the screen explains the guest option and the trade-off", async ({ page }) => {
    await page.goto("/sign-in");

    await expect(page.getByRole("heading", { level: 1, name: "Đăng nhập" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Chơi với tư cách khách" })).toBeVisible();
    await expect(page.getByText("Khách có thể chơi nhưng không được xếp hạng.")).toBeVisible();
  });

  test("TC-PWA-139: without a Clerk key the screen names the missing variable and boots no SDK", async ({
    page,
  }) => {
    const clerkRequests: string[] = [];
    page.on("request", (request) => {
      if (/clerk/i.test(request.url())) clerkRequests.push(request.url());
    });

    await page.goto("/sign-in");

    await expect(page.getByText("VITE_CLERK_PUBLISHABLE_KEY")).toBeVisible();
    expect(await page.evaluate(() => Reflect.has(window, "Clerk"))).toBe(false);
    expect(clerkRequests).toEqual([]);
  });

  test("TC-AUTH-137: the guest link returns to the page that asked for a sign-in", async ({ page }) => {
    await page.goto("/sign-in?returnTo=%2Fleaderboard");
    await page.getByRole("button", { name: "Chơi với tư cách khách" }).click();

    await expect(page).toHaveURL("/leaderboard");
  });

  test("TC-AUTH-138: an absolute returnTo is ignored and the guest lands on the menu", async ({ page }) => {
    for (const hostile of ["https://evil.example/x", "//evil.example/x"]) {
      await page.goto(`/sign-in?returnTo=${encodeURIComponent(hostile)}`);
      await page.getByRole("button", { name: "Chơi với tư cách khách" }).click();

      await expect(page).toHaveURL("/");
      await expect(page.getByTestId("play-bot")).toBeVisible();
    }
  });

  test("the screen offers a way back to the menu without signing in", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Về trang chính" }).click();

    await expect(page).toHaveURL("/");
  });
});
