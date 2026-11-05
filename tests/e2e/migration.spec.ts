import { expect, test } from "@playwright/test";

import { bridgeRoomSockets, createRoom, joinRoom } from "./support";

/**
 * `TC-ROOM-149`, `TC-ROOM-182` — host migration (`US-ROOM-005`).
 *
 * Two real browser contexts against `wrangler dev`. The host's context is force-closed, which is what
 * `NFR-06` promises to survive: the freed role must be taken within five seconds, and the surviving
 * player must keep a usable match. The relay frames come from `bridgeRoomSockets`, so the assertion is
 * on what the server actually sent, not on what the UI happened to paint.
 */
test("TC-ROOM-149: a host that leaves the lobby hands the room to the earliest joiner", async ({ browser }) => {
  const host = await browser.newContext();
  const guest = await browser.newContext();
  const hostPage = await host.newPage();
  const guestPage = await guest.newPage();

  const relay = await bridgeRoomSockets(guestPage);
  const code = await createRoom(hostPage);
  await joinRoom(guestPage, code);

  // The start button is host-only, so its absence is what proves the guest is still a peer.
  await expect(guestPage.getByTestId("start-match")).toHaveCount(0);

  // Let both sockets finish their handshake before one of them disappears.
  await expect.poll(() => relay.frames.length).toBeGreaterThan(0);

  const closedAt = Date.now();
  await host.close();

  await expect.poll(() => relay.frames.some((frame) => frame.includes('"t":"host_changed"')), {
    timeout: 5_000,
  }).toBe(true);

  const takenOver = relay.frames
    .filter((frame) => frame.includes('"t":"host_changed"'))
    .map((frame) => JSON.parse(frame) as { hostGeneration: number });
  expect(takenOver.length).toBeGreaterThanOrEqual(1);
  expect(takenOver[0]?.hostGeneration).toBe(2);
  expect(Date.now() - closedAt).toBeLessThan(5_000);

  // The lobby is usable again: the new host can start the match the room is waiting for.
  await expect(guestPage.getByTestId("start-match")).toBeEnabled();

  await guest.close();
});

test("TC-ROOM-182: a host force-quit mid-match leaves the survivor playable within five seconds", async () => {
  test.setTimeout(60_000);

  // No browser: this case is about what the Durable Object does when a socket dies mid-match, and the
  // browser proxy cannot express a force-quit (closing the context destroys the page before its proxy
  // handler can report the close). Two raw sockets against `wrangler dev` are the honest client here.
  const api = "http://127.0.0.1:8787/api/v1";
  const post = async (path: string, body: unknown, token?: string): Promise<Record<string, unknown>> => {
    const response = await fetch(api + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    });
    expect(response.ok, `${path} → ${response.status}`).toBe(true);
    return (await response.json()) as Record<string, unknown>;
  };
  const guestSession = (await post("/sessions", { kind: "guest", displayName: "Guest" }))["sessionToken"] as string;
  const hostSession = (await post("/sessions", { kind: "guest", displayName: "Host" }))["sessionToken"] as string;
  const room = await post(
    "/rooms",
    { displayName: "Host", mobileId: "mbl-01", avatarId: "avatar-01", maxPlayers: 2, mode: "score", mapId: "map-01" },
    hostSession,
  );
  const code = room["roomCode"] as string;
  const hostPlayerId = room["playerId"] as string;
  const joined = await post("/rooms/" + code + "/join", { displayName: "Guest", mobileId: "mbl-02", avatarId: "avatar-01" }, guestSession);
  const guestPlayerId = joined["playerId"] as string;

  const frames: Record<string, string[]> = { host: [], guest: [] };
  const open = (who: keyof typeof frames, token: string): Promise<WebSocket> =>
    new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:8787/api/v1/rooms/${code}/ws`);
      socket.addEventListener("open", () => socket.send(JSON.stringify({ t: "auth", token })));
      socket.addEventListener("message", (event) => frames[who]?.push(String(event.data)));
      socket.addEventListener("error", () => reject(new Error(`${who} socket failed`)));
      socket.addEventListener("open", () => resolve(socket));
    });

  const host = await open("host", hostSession);
  const guest = await open("guest", guestSession);
  await expect.poll(() => frames["guest"]?.length ?? 0).toBeGreaterThan(0);

  host.send(
    JSON.stringify({
      t: "team_assign",
      assignments: [
        { playerId: hostPlayerId, team: "A" },
        { playerId: guestPlayerId, team: "B" },
      ],
    }),
  );
  host.send(JSON.stringify({ t: "start_match" }));
  await expect.poll(() => frames["guest"]?.some((frame) => frame.includes('"t":"match_started"'))).toBe(true);

  const closedAt = Date.now();
  host.close();

  await expect.poll(() => frames["guest"]?.some((frame) => frame.includes('"t":"host_changed"')), {
    timeout: 5_000,
  }).toBe(true);
  expect(Date.now() - closedAt).toBeLessThan(5_000);

  const changed = JSON.parse(frames["guest"]?.find((frame) => frame.includes('"t":"host_changed"')) ?? "{}") as {
    hostPlayerId?: string;
    hostGeneration?: number;
    lastSnapshot?: unknown;
  };
  expect(changed.hostPlayerId).toBe(guestPlayerId);
  expect(changed.hostGeneration).toBe(2);
  expect("lastSnapshot" in changed).toBe(true);

  // The survivor is playable: it can still talk to the room after the migration.
  guest.send(JSON.stringify({ t: "ping", at: Date.now() }));
  await expect.poll(() => frames["guest"]?.some((frame) => frame.includes('"t":"pong"'))).toBe(true);
  guest.close();
});
