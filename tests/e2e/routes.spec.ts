/**
 * `docs/02-reference/screens/README.md` — the route table. Every declared route must render
 * something a player can act on, and nothing may fall through to the error boundary.
 */
import { expect, test } from "@playwright/test";

const DECLARED_ROUTES = [
  { path: "/", screen: "main menu" },
  { path: "/sign-in", screen: "sign-in" },
  { path: "/profile", screen: "profile" },
  { path: "/leaderboard", screen: "leaderboard" },
  { path: "/lobby/ZZZZZZ", screen: "lobby" },
  { path: "/match/ZZZZZZ", screen: "match" },
] as const;

/** A raw exception rendered into the DOM — the failure `errors.md` forbids. */
const RAW_ERROR = /\b(?:Error|TypeError|RangeError)\s*:|\.tsx?:\d+:\d+|undefined is not|Cannot read propert/;

test.describe("route table", () => {
  for (const route of DECLARED_ROUTES) {
    test(`the ${route.screen} route (${route.path}) renders without the error boundary`, async ({ page }) => {
      await page.goto(route.path);

      await expect(page.getByRole("alert")).toHaveCount(0);
      const body = page.locator("body");
      await expect(body).not.toHaveText(/^\s*$/);
      expect(await body.innerText()).not.toMatch(RAW_ERROR);
    });
  }

  test("/results/:code without a stored result returns to the menu", async ({ page }) => {
    await page.goto("/results/ZZZZZZ");

    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("play-bot")).toBeVisible();
  });

  test("an unknown path falls back to the menu", async ({ page }) => {
    await page.goto("/nope/deeper");

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "Bắn Súng Đạn Đạo" })).toBeVisible();
  });
});
