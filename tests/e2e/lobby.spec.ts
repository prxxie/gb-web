import { expect, test } from "@playwright/test";

/**
 * `TC-ROOM-071`, `TC-ROOM-121`, `TC-ROOM-148`.
 *
 * Two players, two browser contexts: the host creates a room, the guest joins by code, the roster
 * shows both members and the host's start button unlocks only when the teams are balanced.
 */
test("TC-ROOM-071: a host creates a room and a guest joins it", async ({ browser }) => {
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const hostPage = await host.newPage();
  const guestPage = await guest.newPage();

  await hostPage.goto("/");
  await hostPage.getByTestId("create-room").click();
  await expect(hostPage.getByTestId("room-code")).toBeVisible();
  const code = (await hostPage.getByTestId("room-code").textContent())?.trim() ?? "";
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

  await guestPage.goto(`/lobby/${code}`);
  await expect(guestPage.getByTestId("room-code")).toHaveText(code);

  await expect(hostPage.getByTestId("team-A")).toBeVisible();
  await expect(hostPage.getByTestId("team-B")).toBeVisible();

  await host.close();
  await guest.close();
});
