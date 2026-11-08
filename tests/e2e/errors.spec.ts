/**
 * `TC-FND-079` — an API failure on a route shows a translated sentence, never a raw error string
 * (`US-FND-003` § 5: "API failures are handled per screen and must not unmount the shell";
 * `docs/02-reference/screens/README.md` § Oracle: "No route renders a raw error string").
 *
 * Every request to the API is aborted, which is the worst case a player can hit without the whole network going
 * away: what the player reads has to be a sentence from `vi.json` — not `TypeError`, not `Failed to fetch`, not
 * `[object Object]`.
 *
 * The heading rule (`AC7`) is a separate contract and a separate case: a route whose *session* could not be minted
 * renders the sign-in prompt, which has no `h1` yet — recorded in `docs/06-reports/2026-11-08-independent-review.md`.
 */
import { expect, test } from "@playwright/test";

/** The strings a screen leaks when it renders an exception instead of a message. */
const RAW = /TypeError|ReferenceError|SyntaxError|Failed to fetch|NetworkError|AbortError|Cannot read|is not a function|\[object Object\]/;

const ROUTES: readonly string[] = ["/", "/leaderboard", "/sign-in", "/lobby/ABC234", "/results/ABC234"];

for (const route of ROUTES) {
  test(`TC-FND-079: ${route} renders a sentence when every API call fails`, async ({ page }) => {
    await page.route("**/api/v1/**", (request) => request.abort());
    await page.goto(route);
    await expect(page.locator("body")).toBeVisible();

    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(RAW);
    expect(text.trim().length).toBeGreaterThan(0);
  });
}
