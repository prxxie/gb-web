/**
 * `TC-ROOM-052` — the client's storage after a match holds no ICE credential, TURN username or token
 * (`US-ROOM-006` AC4).
 *
 * `wrangler dev` answers `/turn-credentials` with STUN only (no TURN key in `.dev.vars`), so this spec supplies the
 * answer itself: a TURN entry whose username and credential are unique markers. The match screen asks for them when
 * it sets up the mesh, so the flow has to reach a real room match — two players, one seat each, the host starting it.
 * If the client keeps the markers anywhere the next script on the origin can read — `localStorage`, `sessionStorage`,
 * a cookie, the DOM — the case fails. The mesh needs them only for the life of a `RTCPeerConnection`.
 */
import { expect, test } from "@playwright/test";

import { createRoom, joinRoom } from "./support";

const MARKER = "tc-room-052-marker";

test("TC-ROOM-052: no TURN credential reaches storage, a cookie or the DOM", async ({ browser }) => {
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const hostPage = await host.newPage();
  const guestPage = await guest.newPage();

  const stub = async (page: typeof hostPage): Promise<void> => {
    await page.route("**/api/v1/turn-credentials", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          iceServers: [
            { urls: "stun:stun.example.test:3478" },
            { urls: "turn:turn.example.test:3478", username: `${MARKER}-user`, credential: `${MARKER}-secret` },
          ],
          ttlSeconds: 3600,
          turn: true,
        }),
      }),
    );
  };
  await stub(hostPage);
  await stub(guestPage);

  const code = await createRoom(hostPage);
  await joinRoom(guestPage, code);

  const asked = hostPage.waitForRequest("**/api/v1/turn-credentials");
  await expect(hostPage.getByTestId("start-match")).toBeEnabled();
  await hostPage.getByTestId("start-match").click();
  await expect(hostPage.getByTestId("match-screen")).toBeVisible();

  // The screen asked for credentials, so the answer had something to keep — or to leak.
  await asked;

  for (const page of [hostPage, guestPage]) {
    const stored = await page.evaluate(() => ({
      local: JSON.stringify({ ...localStorage }),
      session: JSON.stringify({ ...sessionStorage }),
      cookie: document.cookie,
      html: document.documentElement.outerHTML,
    }));
    expect(stored.local).not.toContain(MARKER);
    expect(stored.session).not.toContain(MARKER);
    expect(stored.cookie).not.toContain(MARKER);
    expect(stored.html).not.toContain(MARKER);
  }

  await host.close();
  await guest.close();
});
