/**
 * `TC-AUTH-143` — a guest opening `/profile` is sent to `/sign-in`
 * (`docs/02-reference/screens/profile.md`: "Registered players only; a guest landing here is sent to `/sign-in`").
 *
 * The route is the only one that has no meaning without an account, so the check is a redirect and not a banner: a
 * guest who reaches it by typing the URL has to land somewhere they can act.
 */
import { expect, test } from "@playwright/test";

test("TC-AUTH-143: a guest opening /profile is sent to /sign-in", async ({ page }) => {
  await page.goto("/profile");

  await expect(page).toHaveURL(/\/sign-in$/);
  // The guest never sees an account surface on the way through.
  await expect(page.getByTestId("profile-screen")).toHaveCount(0);
});
