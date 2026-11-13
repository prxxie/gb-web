import { expect, test } from "@playwright/test";

/**
 * `TC-BAL-155` — the practice screen in a browser (`docs/02-reference/screens/practice.md`, `US-BAL-007` AC5).
 *
 * The arithmetic is pinned in `packages/core/tests/solver.test.ts` and the copy in `apps/web/tests/practice.test.tsx`;
 * what only a browser can say is that the route is reachable by URL and by keyboard, that it answers with the network
 * switched off, and that its controls are thumb-sized. No request may leave the page at any point.
 */
test("TC-BAL-155: /practice answers by URL, from the menu, and with the network off", async ({ page }) => {
  // The app shell asks for a guest session once on boot (`SessionProvider`); the solver must never add to that.
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) requests.push(request.url());
  });

  await page.goto("/practice");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Công cụ tính toán");
  await expect(page.locator("#main h1")).toBeFocused();
  // The default question is the calibration shot: 22.14 phần at 45° on the reference hull.
  await expect(page.getByRole("status")).toContainText("4,00");

  const fromMenu = await page.goto("/");
  expect(fromMenu?.status()).toBe(200);
  await page.getByRole("link", { name: "Công cụ tính toán" }).press("Enter");
  await expect(page).toHaveURL(/\/practice$/);

  const before = requests.length;
  await page.waitForTimeout(300);
  await page.context().setOffline(true);
  await page.getByLabel("Góc").fill("60");
  await expect(page.getByRole("status")).not.toContainText("4,00");
  await page.getByLabel("Góc").fill("45");
  await expect(page.getByRole("status")).toContainText("4,00");
  await page.context().setOffline(false);

  // Answering is arithmetic on the device: not one request while the question changed, with the network off.
  expect(requests.length).toBe(before);
});

test("TC-BAL-155: the three modes swap the typed field, by keyboard", async ({ page }) => {
  await page.goto("/practice");

  const mode = page.getByRole("button", { name: "Tính khoảng cách" });
  await mode.focus();
  await mode.press("Enter");
  await expect(mode).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Bar")).toBeVisible();
  await expect(page.getByLabel("Khoảng cách (phần)")).toHaveCount(0);

  await page.getByRole("button", { name: "Tính thời gian" }).press("Enter");
  await expect(page.getByRole("status")).toContainText(/Bay 2,5\d s/);
});

test("TC-BAL-155: the notice is on the page once and the controls are thumb-sized", async ({ page }) => {
  await page.goto("/practice");

  await expect(page.getByText("Công cụ này không có trong trận đấu.")).toHaveCount(1);
  await expect(page.getByText("Chỉ đúng trên mặt đất phẳng", { exact: false })).toHaveCount(1);

  for (const button of await page.getByRole("button").all()) {
    const box = await button.boundingBox();
    if (box) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }

  // Narrow: one column, and the page never scrolls sideways (`TC-FND-133`'s rule, on this screen).
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
