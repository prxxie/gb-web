/**
 * `TC-PWA-131` — a route change moves focus to the route's `h1`
 * (`US-PWA-004` AC7: "Focus moves to the route's `h1`, never stays on the removed control").
 *
 * Every route is reached the way a keyboard user reaches it: from the menu, with the control still focused when the
 * screen changes underneath it. The component-level case for the same rule lives in `apps/web/tests/route-focus.test.tsx`;
 * this is the browser case, so a failure says which level broke.
 */
import { expect, test } from "@playwright/test";

const LINKS: readonly { readonly name: string; readonly url: RegExp }[] = [
  { name: "Bảng xếp hạng", url: /\/leaderboard$/ },
  { name: "Đăng nhập", url: /\/sign-in$/ },
];

for (const link of LINKS) {
  test(`TC-PWA-131: "${link.name}" puts focus on the new route's h1`, async ({ page }) => {
    await page.goto("/");
    const control = page.getByRole("link", { name: link.name });
    await control.focus();
    await control.press("Enter");

    await expect(page).toHaveURL(link.url);
    await expect(page.locator("#main h1")).toBeFocused();
    // The control that invoked the navigation is gone; focus must not be left on it.
    await expect(control).toHaveCount(0);
  });
}

test("TC-PWA-131: going back focuses the heading of the route that returns", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Bảng xếp hạng" }).click();
  await expect(page.locator("#main h1")).toBeFocused();

  await page.goBack();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#main h1")).toBeFocused();
});
