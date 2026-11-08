/**
 * `TC-ROOM-046` — a member that comes back inside the 20 s grace window keeps its seat
 * (`US-ROOM-004`; `docs/02-reference/screens/lobby.md` § Oracle: "Reconnect within 20 s restores slot/team").
 *
 * Two players, two contexts. The guest reloads the lobby — the plainest reconnect there is — and has to land back in
 * the same room, on the same seat, in the same team: the roster the room broadcasts is the only thing that can put it
 * back, because the page keeps no seat of its own.
 *
 * The comparison is the two team columns as the guest renders them, before and after. Comparing text rather than
 * re-deriving the seat from an id keeps the case honest about what it proves — the same members, on the same sides —
 * and keeps the case off the WebSocket bridge `support.ts` holds for the relay specs: a bridged socket does not survive
 * the reload this case depends on, and the first CI run proved it by timing out at 90 s.
 *
 * The `lastSnapshot` half of the criterion (HP restored mid-match) is not reachable from the lobby; it is recorded as a
 * gap in `docs/05-quality/test-plan-status.md` § 3 rather than asserted here under a borrowed id.
 */
import { expect, test } from "@playwright/test";

import { ownAddress } from "./support";

test("TC-ROOM-046: a guest that reloads inside the grace window keeps its seat and team", async ({ browser }) => {
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const hostPage = await host.newPage();
  const guestPage = await guest.newPage();
  await ownAddress(hostPage);
  await ownAddress(guestPage);

  await hostPage.goto("/");
  await hostPage.getByTestId("create-room").click();
  await expect(hostPage.getByTestId("room-code")).toBeVisible();
  const code = (await hostPage.getByTestId("room-code").textContent())?.trim() ?? "";
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

  await guestPage.goto(`/lobby/${code}`);
  await expect(guestPage.getByTestId("room-code")).toHaveText(code);
  await expect(guestPage.locator("[data-testid^=roster-avatar-]")).toHaveCount(2);

  const columns = async (): Promise<{ A: string; B: string }> => ({
    A: (await guestPage.getByTestId("team-A").innerText()).trim(),
    B: (await guestPage.getByTestId("team-B").innerText()).trim(),
  });
  const before = await columns();
  // The two seats sit on opposite sides, so the comparison has something to tell apart.
  expect(before.A).not.toBe(before.B);

  // The reload is the reconnect: same tab, same stored session, a new socket inside the grace window.
  await guestPage.reload();

  await expect(guestPage.getByTestId("room-code")).toHaveText(code);
  await expect(guestPage.locator("[data-testid^=roster-avatar-]")).toHaveCount(2);
  expect(await columns()).toEqual(before);
  // The host sees the same two members, not a ghost of the seat the guest just left.
  await expect(hostPage.locator("[data-testid^=roster-avatar-]")).toHaveCount(2);

  await host.close();
  await guest.close();
});
