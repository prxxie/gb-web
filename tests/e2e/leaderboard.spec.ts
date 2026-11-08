import { expect, test, type Page } from "@playwright/test";

/**
 * `TC-RANK-144` … `TC-RANK-147` — `docs/02-reference/screens/leaderboard.md` (`US-RANK-004` AC3–AC5, AC7).
 *
 * The list is served from a route double so a case can put the caller at rank 42 on purpose: seeding ninety
 * ranked accounts into the local D1 would make the screen's own behavior a side effect of a fixture. What the
 * real Worker owns — ordering, the top-100 cap, the 30-second cache and `you` for a real token — is
 * `apps/worker/tests/leaderboard.test.ts` (`TC-RANK-144`, `TC-RANK-147`).
 */
test.beforeEach(async ({ page }, testInfo) => {
  // `NFR-25` allows a fixed number of sessions a minute per address; a file of its own address keeps these
  // cases about the leaderboard even when the specs before this one spent the shared budget.
  await page.setExtraHTTPHeaders({ "cf-connecting-ip": `198.51.100.${120 + testInfo.workerIndex}` });
});

interface Row {
  readonly rank: number;
  readonly displayName: string;
  readonly avatarId: string;
  readonly rating: number;
  readonly ratedMatches: number;
}

function row(rank: number, extra: Partial<Row> = {}): Row {
  return { rank, displayName: `P${rank}`, avatarId: "avatar-01", rating: 1600 - rank, ratedMatches: 20, ...extra };
}

function rows(count = 20): Row[] {
  return Array.from({ length: count }, (_unused, index) => row(index + 1));
}

/** The stored session `apps/web/src/lib/session.ts` writes for a signed-in account. */
const SESSION = {
  token: "leaderboard-account-token",
  expiresAt: Date.now() + 3_600_000,
  subject: { kind: "account", accountId: "acc_me", displayName: "Bao" },
};

/** `cacheControl` mirrors the contract: `public` anonymous, `private, no-store` once a session is sent. */
async function serve(
  page: Page,
  response: Record<string, unknown>,
  cacheControl = "public, max-age=30",
): Promise<void> {
  await page.route("**/api/v1/leaderboard*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": cacheControl },
      body: JSON.stringify(response),
    }),
  );
}

async function openSignedIn(page: Page, response: Record<string, unknown>): Promise<void> {
  await page.addInitScript((session) => sessionStorage.setItem("gbw.session", JSON.stringify(session)), SESSION);
  await serve(page, response, "private, no-store");
  await page.goto("/leaderboard");
  await expect(page.getByTestId("leaderboard-row-1")).toBeVisible();
}

test("TC-RANK-144: a caller ranked outside the page reads the rank from a sticky footer (AC3)", async ({ page }) => {
  await openSignedIn(page, { items: rows(), next_cursor: null, has_more: false, you: { rank: 42, rating: 1338 } });

  const footer = page.getByTestId("leaderboard-you");
  await expect(footer).toBeVisible();
  await expect(footer).toContainText("#42");
  await expect(footer).toContainText("1338");
  // "Sticky" is the part a screenshot cannot show: the footer must stay while the table scrolls.
  expect(await footer.evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
  // No row on this page is the caller, so none is tinted and none claims to be current.
  await expect(page.getByTestId("leaderboard-row-1")).not.toHaveClass(/\bme\b/);
  await expect(page.locator('[aria-current="true"]')).toHaveCount(0);
});

test("TC-RANK-144: the caller's own row on this page is tinted and marked instead (AC3)", async ({ page }) => {
  await openSignedIn(page, { items: rows(), next_cursor: null, has_more: false, you: { rank: 3, rating: 1597 } });

  const mine = page.getByTestId("leaderboard-row-3");
  await expect(mine).toHaveClass(/\bme\b/);
  await expect(mine).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("leaderboard-you")).toHaveCount(0);
});

test("TC-RANK-145: a row under ten rated matches carries the Mới badge (AC4)", async ({ page }) => {
  await openSignedIn(page, {
    items: [row(1, { ratedMatches: 9 }), row(2, { ratedMatches: 10 })],
    next_cursor: null,
    has_more: false,
    you: null,
  });

  await expect(page.getByTestId("leaderboard-row-1")).toContainText("Mới");
  await expect(page.getByTestId("leaderboard-row-2")).not.toContainText("Mới");
});

test("TC-RANK-146: markup in a name is text, and a long name is clipped (AC5)", async ({ page }) => {
  // Short enough to survive the 16-grapheme clip, so the row is about escaping and not about truncation.
  const hostile = "<b>x</b>";
  const long = "Nguyễn Văn Bảo Lộc";
  await openSignedIn(page, {
    items: [row(1, { displayName: hostile }), row(2, { displayName: long })],
    next_cursor: null,
    has_more: false,
    you: null,
  });

  // Nothing executed: the row prints the markup as characters and no element is built from it.
  await expect(page.getByTestId("leaderboard-row-1")).toContainText(hostile);
  await expect(page.locator("tbody b")).toHaveCount(0);
  await expect(page.getByTestId("leaderboard-row-2")).toContainText(`${Array.from(long).slice(0, 16).join("")}…`);
  await expect(page.getByTestId("leaderboard-row-2")).not.toContainText(long);
});

test("TC-RANK-147: a signed-out visit lists the ranking, has no footer and asks no /me (AC7)", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (request) => asked.push(new URL(request.url()).pathname));
  await serve(page, { items: rows(), next_cursor: null, has_more: false, you: null });

  await page.goto("/leaderboard");

  await expect(page.getByTestId("leaderboard-row-1")).toBeVisible();
  await expect(page.getByTestId("leaderboard-you")).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/leaderboard");
  expect(asked.filter((path) => path === "/api/v1/me" || path.startsWith("/api/v1/me/"))).toEqual([]);
});
