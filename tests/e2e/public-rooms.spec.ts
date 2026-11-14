/**
 * TC-ROOM-725 / TC-ROOM-726 / TC-ROOM-728 — the public room browser.
 *
 * The directory is a snapshot: opening the panel, changing a filter or refreshing is the only time it is read.
 * Selecting a row still enters the authoritative join route, and private rooms stay joinable by code.
 */
import { expect, test } from "@playwright/test";
import { createRoom, joinRoom, newPlayer, ownAddress, sessionOf } from "./support";

test("TC-ROOM-725: the dialog loads on demand and keeps the landscape menu in place", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.clock.install();
  let listRequests = 0;
  let roomSockets = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/api/v1/rooms") listRequests += 1;
  });
  page.on("websocket", (socket) => {
    if (/\/api\/v1\/rooms\/[A-HJ-NP-Z2-9]{6}\/ws$/.test(new URL(socket.url()).pathname)) roomSockets += 1;
  });

  await page.goto("/");
  await sessionOf(page);
  expect(listRequests).toBe(0);
  expect(roomSockets).toBe(0);

  const trigger = page.getByTestId("public-rooms");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Phòng công khai" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => listRequests).toBe(1);

  await dialog.getByRole("button", { name: "Đang chờ" }).click();
  await expect.poll(() => listRequests).toBe(2);
  await dialog.getByRole("button", { name: "Đang chờ" }).click();
  await expect.poll(() => listRequests).toBe(3);

  await page.clock.fastForward("01:00");
  expect(listRequests).toBe(3);
  expect(roomSockets).toBe(0);

  await dialog.getByRole("button", { name: "Đóng" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  const layout = await page.evaluate(() => {
    const rect = (testId: string): DOMRect | null =>
      document.querySelector(`[data-testid="${testId}"]`)?.getBoundingClientRect() ?? null;
    return {
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight,
      play: rect("play-bot"),
      create: rect("create-room"),
      join: rect("join-room"),
    };
  });
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.innerHeight + 1);
  for (const action of [layout.play, layout.create, layout.join]) {
    expect(action).not.toBeNull();
    expect(action!.top).toBeGreaterThanOrEqual(0);
    expect(action!.bottom).toBeLessThanOrEqual(layout.innerHeight);
  }
});

test("TC-ROOM-726: a stale waiting row shows the join refusal inline and refreshes", async ({ browser }) => {
  const host = await newPlayer(browser);
  const filler = await newPlayer(browser);
  const browserPlayer = await newPlayer(browser);
  const hostCode = await createRoom(host.page);
  await joinRoom(filler.page, hostCode);

  await ownAddress(browserPlayer.page);
  let listRequests = 0;
  await browserPlayer.page.route(/\/api\/v1\/rooms(?:\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    listRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        rooms: [
          {
            roomCode: hostCode,
            status: "waiting",
            mode: "solo",
            mapId: "map-01",
            seated: 1,
            maxPlayers: 2,
            joinable: true,
            updatedAt: "2026-11-14T09:15:00.000Z",
          },
          {
            roomCode: "ABC234",
            status: "playing",
            mode: "solo",
            mapId: "map-01",
            seated: 2,
            maxPlayers: 2,
            joinable: false,
            updatedAt: "2026-11-14T09:14:00.000Z",
          },
        ],
        nextCursor: null,
        request_id: "req-public-rooms",
      }),
    });
  });
  await browserPlayer.page.goto("/");
  await sessionOf(browserPlayer.page);
  await browserPlayer.page.getByTestId("public-rooms").click();
  const dialog = browserPlayer.page.getByRole("dialog", { name: "Phòng công khai" });
  await expect(dialog.getByTestId(`public-room-${hostCode}`)).toBeVisible();
  await expect(dialog.getByTestId("public-room-join-ABC234")).toHaveCount(0);

  await dialog.getByTestId(`public-room-join-${hostCode}`).click();
  await expect(dialog.getByTestId("public-rooms-error")).toContainText("Phòng đã đầy.");
  await expect.poll(() => listRequests).toBe(2);

  await host.context.close();
  await filler.context.close();
  await browserPlayer.context.close();
});

test("TC-ROOM-728: public rooms are listed, private rooms are not, and both codes join", async ({ browser }) => {
  const host = await newPlayer(browser);
  const browserPlayer = await newPlayer(browser);
  const publicCode = await createRoom(host.page);

  await host.page.goto("/");
  await host.page.getByRole("checkbox", { name: "Phòng riêng" }).check();
  await host.page.getByTestId("create-room").click();
  await expect(host.page.getByTestId("room-code")).toBeVisible();
  const privateCode = (await host.page.getByTestId("room-code").innerText()).trim();

  await ownAddress(browserPlayer.page);
  await browserPlayer.page.goto("/");
  await browserPlayer.page.getByTestId("public-rooms").click();
  const dialog = browserPlayer.page.getByRole("dialog", { name: "Phòng công khai" });
  await expect(dialog.getByTestId(`public-room-${publicCode}`)).toBeVisible();
  await expect(dialog.getByTestId(`public-room-${privateCode}`)).toHaveCount(0);

  await browserPlayer.page.goto(`/lobby/${privateCode}`);
  await expect(browserPlayer.page.getByTestId("room-code")).toHaveText(privateCode);

  await host.context.close();
  await browserPlayer.context.close();
});
