/**
 * `docs/02-reference/screens/sign-in.md` + `TC-PWA-139` — the Clerk SDK must stay out of the match
 * bundle (a player who never signs in should never pay for it) and no server-side secret may reach
 * the browser, in a script, a URL or an inlined `import.meta.env` value.
 */
import { expect, test, type Page } from "@playwright/test";

const CLERK = /clerk/i;
const SECRETS = ["sk_live_", "sk_test_", "CLERK_SECRET_KEY", "CLERK_API_KEY", "-----BEGIN "];

/** URL of every JavaScript module the page has loaded so far. */
async function scriptUrls(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => /\.(js|mjs|ts|tsx)(\?|$)/.test(name)),
  );
}

/** Fetch each module and report the ones that contain any needle — the script body is the payload. */
async function scanFor(page: Page, needles: string[]): Promise<{ url: string; needles: string[] }[]> {
  const urls = await scriptUrls(page);
  return page.evaluate(
    async ({ urls, needles }) => {
      const found: { url: string; needles: string[] }[] = [];
      for (const url of urls) {
        let text = "";
        try {
          text = await (await fetch(url)).text();
        } catch {
          continue;
        }
        const hits = needles.filter((needle) => text.includes(needle));
        if (hits.length > 0) found.push({ url, needles: hits });
      }
      return found;
    },
    { urls, needles },
  );
}

test.describe("bundle", () => {
  test("TC-PWA-139: the match bundle ships no Clerk code", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    await page.goto("/");
    await page.getByTestId("play-bot").click();
    await expect(page.getByTestId("match-screen")).toBeVisible();

    const hits = await scanFor(page, ["Clerk", "@clerk", "clerk."]);
    expect(hits.map((hit) => hit.url)).toEqual([]);
    expect(requests.filter((url) => CLERK.test(url))).toEqual([]);
  });

  test("no secret reaches the client, in any script or inlined env value", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("play-bot")).toBeVisible();

    const hits = await scanFor(page, SECRETS);
    expect(hits).toEqual([]);

    const inline = await page.evaluate(() =>
      Array.from(document.scripts)
        .map((script) => script.textContent ?? "")
        .join("\n"),
    );
    for (const secret of SECRETS) expect(inline).not.toContain(secret);
  });

  test("the sign-in screen is a lazily loaded chunk, not part of the entry bundle", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("play-bot")).toBeVisible();
    const menu = new Set(await scriptUrls(page));

    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { level: 1, name: "Đăng nhập" })).toBeVisible();
    const signIn = await scriptUrls(page);

    expect(signIn.filter((url) => !menu.has(url))).not.toEqual([]);
  });
});
