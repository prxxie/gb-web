import { expect, test } from "@playwright/test";

/**
 * `TC-ROOM-153`: two players pick the same mobile (`US-ROOM-007` AC7).
 *
 * The grid is the roster once, in both team tints; both seats may sit on the same mobile, and the room's
 * member record — not the page — is what a reload shows again. Runs against the real Worker, so the pick
 * really travels through the `loadout` frame and back out in `room_state`.
 */
test("TC-ROOM-153: two seats share one mobile and the pick survives a reload", async ({ browser }) => {
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const hostPage = await host.newPage();
  const guestPage = await guest.newPage();

  await hostPage.goto("/");
  await hostPage.getByTestId("create-room").click();
  await expect(hostPage.getByTestId("room-code")).toBeVisible();
  const code = (await hostPage.getByTestId("room-code").textContent())?.trim() ?? "";

  await guestPage.goto(`/lobby/${code}`);
  await expect(guestPage.getByTestId("room-code")).toHaveText(code);
  await expect(guestPage.locator("[data-testid^=roster-avatar-]")).toHaveCount(2);

  // Every mobile is offered once, and each cell shows both team tints (`docs/02-reference/screens/lobby.md`).
  await expect(hostPage.getByTestId(/^mobile-cell-mbl-/)).toHaveCount(20);
  await expect(hostPage.getByTestId("mobile-tint-mbl-05-A")).toBeVisible();
  await expect(hostPage.getByTestId("mobile-tint-mbl-05-B")).toBeVisible();

  // Both seats pick the same mobile: the room accepts a duplicate rather than reserving one per mobile.
  await hostPage.getByTestId("mobile-cell-mbl-05").click();
  await expect(hostPage.getByTestId("mobile-cell-mbl-05")).toHaveAttribute("aria-pressed", "true");
  await guestPage.getByTestId("mobile-cell-mbl-05").click();
  await expect(guestPage.getByTestId("mobile-cell-mbl-05")).toHaveAttribute("aria-pressed", "true");
  await expect(guestPage.getByTestId("mobile-cell-mbl-01")).toHaveAttribute("aria-pressed", "false");

  // A reload is a reconnect with no memory of the pick: only `room_state` can bring it back.
  await guestPage.reload();
  await expect(guestPage.getByTestId("room-code")).toHaveText(code);
  await expect(guestPage.getByTestId("mobile-cell-mbl-05")).toHaveAttribute("aria-pressed", "true");

  await host.close();
  await guest.close();
});
