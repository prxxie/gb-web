/**
 * `TC-ROOM-046` — a member that comes back inside the 20 s grace window keeps its seat
 * (`US-ROOM-004`; `docs/02-reference/screens/lobby.md` § Oracle: "Reconnect within 20 s restores slot/team").
 *
 * Two players, two contexts, both sockets held by the test process (`bridgeRoomSockets`: `wrangler dev` refuses a
 * browser handshake because of the `Origin` header). The guest reloads the lobby — the plainest reconnect there is —
 * and has to land back in the same room, in the same team, under the same name, without the host seeing a ghost.
 *
 * The `lastSnapshot` half of the criterion (HP restored mid-match) is not reachable from the lobby; it is recorded as
 * a gap in `docs/05-quality/test-plan-status.md` § 3 rather than asserted here under a borrowed id.
 */
import { expect, test } from "@playwright/test";

import { bridgeRoomSockets, createRoom, joinRoom, sessionOf } from "./support";

test("TC-ROOM-046: a guest that reloads inside the grace window keeps its seat and team", async ({ browser }) => {
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const hostPage = await host.newPage();
  const guestPage = await guest.newPage();
  await bridgeRoomSockets(hostPage);
  await bridgeRoomSockets(guestPage);

  const code = await createRoom(hostPage);
  await joinRoom(guestPage, code);

  const { displayName } = (await sessionOf(guestPage)).subject;
  const teamOf = async (): Promise<"A" | "B" | null> => {
    for (const team of ["A", "B"] as const) {
      if (await guestPage.getByTestId(`team-${team}`).getByText(displayName, { exact: true }).count()) return team;
    }
    return null;
  };

  await expect.poll(teamOf, { message: "the guest takes a seat in one of the two teams" }).not.toBeNull();
  const team = await teamOf();

  // The reload is the reconnect: same tab, same stored session, a new socket inside the grace window.
  await guestPage.reload();

  await expect(guestPage.getByTestId("room-code")).toHaveText(code);
  await expect.poll(teamOf, { message: "the reloaded guest is back in the same team" }).toBe(team);
  // The host sees two members, not a ghost of the seat the guest just left.
  await expect(hostPage.locator("[data-testid^='roster-avatar-']")).toHaveCount(2);

  await host.close();
  await guest.close();
});
