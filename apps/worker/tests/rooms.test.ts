/**
 * `docs/02-reference/api/rooms.md` — the HTTP surface of a room.
 *
 * The room endpoints are thin: they validate, pick a code and hand everything to the `Room` Durable
 * Object (`apps/worker/src/routes/rooms.ts`). These tests therefore drive the real router
 * (`apps/worker/src/index.ts`) with real `Room` objects (`support/fake-env.ts`), so a status code here is
 * the status code a browser gets.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ALLOWED_CAPACITIES, ROOM_CODE_ALPHABET, isValidRoomCode } from "@gbw/core";
import { resetLimits } from "../src/lib/ratelimit";
import { createRoom } from "../src/routes/rooms";
import { verifySession } from "../src/lib/session";
import { TEST_SECRET, accountSubject, createRig, seedProfile, type TestRig } from "./support/fake-env";

const HOST = "acct-host";
const GUEST = "acct-guest";

async function newRoom(rig: TestRig, maxPlayers: 2 | 4 | 6 | 8 = 4) {
  const token = await rig.token(accountSubject(HOST));
  const response = await rig.request("POST", "/rooms", {
    token,
    body: { maxPlayers, displayName: "Bao", mobileId: "mbl-01", avatarId: "av-01" },
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { roomCode: string; playerId: string };
  return { token, ...body };
}

describe("POST /rooms", () => {
  beforeEach(() => resetLimits());

  it("TC-ROOM-120: answers 201 with the documented room, player and socket fields", async () => {
    // Arrange
    const rig = createRig();
    const token = await rig.token(accountSubject(HOST));

    // Act
    const response = await rig.request("POST", "/rooms", {
      token,
      body: { maxPlayers: 6, displayName: "Bao", mobileId: "mbl-01", avatarId: "av-01" },
    });
    const body = (await response.json()) as Record<string, unknown>;

    // Assert — rooms.md § POST /rooms, response 201
    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(String(body["roomCode"])).toHaveLength(6);
    expect(isValidRoomCode(String(body["roomCode"]))).toBe(true);
    expect(body["maxPlayers"]).toBe(6);
    expect(typeof body["playerId"]).toBe("string");
    expect(String(body["wsUrl"])).toBe(`https://gbw.test/api/v1/rooms/${String(body["roomCode"])}/ws`);
    expect(Date.parse(String(body["expiresAt"]))).toBeGreaterThan(Date.now());
  });

  it("US-ROOM-001 AC1: the 201 carries the lobby joinUrl the story documents", async () => {
    // Arrange (rooms.md lists roomCode/playerId/maxPlayers/wsUrl/expiresAt; US-ROOM-001 §4 adds joinUrl)
    const rig = createRig();
    const token = await rig.token(accountSubject(HOST));

    // Act
    const response = await rig.request("POST", "/rooms", { token, body: { maxPlayers: 4 } });
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(String(body["joinUrl"] ?? "")).toContain("/lobby/");
  });

  it("TC-ROOM-205: a mode outside the four is a 422 naming mode", async () => {
    // Arrange
    const rig = createRig();
    const token = await rig.token(accountSubject(HOST));

    // Act / Assert — US-CORE-010 AC7
    for (const mode of ["deathmatch", "", "SOLO", "0"]) {
      const response = await rig.request("POST", "/rooms", { token, body: { maxPlayers: 4, mode } });
      const body = (await response.json()) as { type: string; errors?: { field: string }[] };
      expect(response.status, `mode=${mode}`).toBe(422);
      expect(body.type).toContain("validation");
      expect(body.errors?.map((entry) => entry.field)).toContain("mode");
    }
  });

  it("TC-ROOM-120: every capacity outside {2,4,6,8} is a 422 naming maxPlayers", async () => {
    // Arrange
    const rig = createRig();
    const token = await rig.token(accountSubject(HOST));

    // Act / Assert — US-ROOM-001 AC3
    for (const maxPlayers of [1, 3, 5, 7, 10, 0]) {
      const response = await rig.request("POST", "/rooms", { token, body: { maxPlayers } });
      const body = (await response.json()) as { type: string; errors?: { field: string }[] };
      expect(response.status, `maxPlayers=${maxPlayers}`).toBe(422);
      expect(body.type).toContain("validation");
      expect(body.errors?.map((entry) => entry.field)).toContain("maxPlayers");
    }
    expect(ALLOWED_CAPACITIES).toEqual([2, 4, 6, 8]);
  });

  it("rooms.md body table: maxPlayers is required, so an absent one is a 422", async () => {
    // Arrange
    const rig = createRig();
    const token = await rig.token(accountSubject(HOST));

    // Act
    const response = await rig.request("POST", "/rooms", { token, body: { displayName: "Bao" } });

    // Assert — `createRoom` defaults to 4 instead of refusing (`apps/worker/src/routes/rooms.ts:75`)
    expect(response.status).toBe(422);
  });

  it("TC-ROOM-120: the code only uses the documented alphabet", async () => {
    // Arrange
    const rig = createRig();
    const token = await rig.token(accountSubject(HOST));

    // Act
    const created = await Promise.all(
      Array.from({ length: 8 }, () => rig.request("POST", "/rooms", { token, body: { maxPlayers: 2 } })),
    );
    const codes = await Promise.all(created.map(async (response) => String(((await response.json()) as Record<string, unknown>)["roomCode"])));

    // Assert — US-ROOM-001 AC7: six characters, no I, O, 0, 1
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      for (const character of code) expect(ROOM_CODE_ALPHABET).toContain(character);
    }
  });

  it("TC-ROOM-072: the 11th room from one address in a minute is 429 with Retry-After", async () => {
    // Arrange
    const rig = createRig();
    const token = await rig.token(accountSubject(HOST));
    let last: Response | null = null;

    // Act
    for (let index = 0; index < 11; index += 1) {
      last = await rig.request("POST", "/rooms", { token, body: { maxPlayers: 2 } });
    }

    // Assert — NFR-05 / api README: a 429 says when to come back
    expect(last?.status).toBe(429);
    expect(last?.headers.get("retry-after")).not.toBeNull();
  });

  it("TC-ROOM-170: five code collisions in a row answer 503 with a retry hint", async () => {
    // Arrange — the generator is pinned to a code that is already taken, which is what a collision looks like
    // (`US-ROOM-001` AC2: five attempts, then ask the client to come back).
    const rig = createRig();
    const existing = await newRoom(rig, 2);
    const token = await rig.token(accountSubject(HOST));
    const session = await verifySession(token, TEST_SECRET);
    const request = new Request("https://gbw.example/api/v1/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ maxPlayers: 2 }),
    });
    let calls = 0;

    // Act — the router turns this into the `unavailable` 503 problem document (asserted in
    // `apps/worker/tests/api-contract.test.ts`); here the point is the attempt count and the hint.
    const attempt = createRoom(request, rig.env, session, "https://gbw.example", () => {
      calls += 1;
      return existing.roomCode;
    });

    // Assert
    await expect(attempt).rejects.toMatchObject({ type: "unavailable", retryAfterSeconds: 5 });
    expect(calls).toBe(5);
  });

  it("POST /rooms without a bearer is a 401 problem document", async () => {
    // Arrange
    const rig = createRig();

    // Act
    const response = await rig.request("POST", "/rooms", { body: { maxPlayers: 4 } });
    const body = (await response.json()) as { type: string; request_id: string };

    // Assert — RFC 9457 body, rooms.md "Auth: session token"
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(body.type).toContain("/problems/unauthenticated");
    expect(typeof body.request_id).toBe("string");
  });
});

describe("POST /rooms/{code}/join", () => {
  beforeEach(() => resetLimits());

  it("TC-ROOM-121: a second player joins the room and gets its settings back", async () => {
    // Arrange
    const rig = createRig();
    const room = await newRoom(rig, 4);
    const guestToken = await rig.token(accountSubject(GUEST));

    // Act
    const response = await rig.request("POST", `/rooms/${room.roomCode}/join`, {
      token: guestToken,
      body: { displayName: "Linh", mobileId: "mbl-02", avatarId: "av-02" },
    });
    const body = (await response.json()) as Record<string, unknown>;

    // Assert
    expect(response.status).toBe(200);
    expect(body["roomCode"]).toBe(room.roomCode);
    expect(body["maxPlayers"]).toBe(4);
    expect(String(body["playerId"])).not.toBe(room.playerId);
    expect(String(body["wsUrl"])).toBe(`https://gbw.test/api/v1/rooms/${room.roomCode}/ws`);
  });

  it("rooms.md 404: joining an unknown code is room-not-found, not a new room", async () => {
    // Arrange
    const rig = createRig();
    const token = await rig.token(accountSubject(GUEST));
    const code = "ABCD23";
    expect(rig.rooms.byCode.has(code)).toBe(false);

    // Act
    const response = await rig.request("POST", `/rooms/${code}/join`, {
      token,
      body: { displayName: "Linh" },
    });
    const body = (await response.json()) as Record<string, unknown>;

    // Assert — `handleJoin` names an empty object after the guest and answers 200
    expect(response.status).toBe(404);
    expect(body["type"]).toContain("room-not-found");
  });

  it("TC-ROOM-122: a join on a full room is 409 room-full and leaves the roster alone", async () => {
    // Arrange
    const rig = createRig();
    const room = await newRoom(rig, 2);
    const guestToken = await rig.token(accountSubject(GUEST));
    const second = await rig.request("POST", `/rooms/${room.roomCode}/join`, {
      token: guestToken,
      body: { displayName: "Linh" },
    });
    expect(second.status).toBe(200);

    // Act
    const third = await rig.request("POST", `/rooms/${room.roomCode}/join`, {
      token: await rig.token(accountSubject("acct-third")),
      body: { displayName: "Mai" },
    });
    const body = (await third.json()) as { type: string };

    // Assert
    expect(third.status).toBe(409);
    expect(body.type).toContain("room-full");
    const preview = await rig.request("GET", `/rooms/${room.roomCode}`);
    expect(((await preview.json()) as Record<string, unknown>)["joined"]).toBe(2);
  });

  it("rooms.md: a join to a closed room is 410", async () => {
    // Arrange — the last member leaving closes the room (`leaveRoom`); leaving is a socket frame, so the
    // Durable Object is driven directly here.
    const rig = createRig();
    const room = await newRoom(rig, 2);
    const stub = await rig.rooms.room(room.roomCode);
    await stub.fetch(
      new Request(`https://room.internal/${room.roomCode}/leave`, {
        method: "POST",
        body: JSON.stringify({ playerId: room.playerId }),
      }),
    );
    expect(stub.debugState()).toEqual([]);

    // Act
    const response = await rig.request("POST", `/rooms/${room.roomCode}/join`, {
      token: await rig.token(accountSubject(GUEST)),
      body: { displayName: "Linh" },
    });

    // Assert
    expect(response.status).toBe(410);
  });
});

describe("GET /rooms/{code}", () => {
  beforeEach(() => resetLimits());

  it("rooms.md: the preview body names the room `roomCode` and echoes the settings", async () => {
    // Arrange
    const rig = createRig();
    const room = await newRoom(rig, 4);

    // Act
    const body = (await (await rig.request("GET", `/rooms/${room.roomCode}`)).json()) as Record<string, unknown>;

    // Assert — rooms.md preview table: `roomCode`, `status`, `settings`, `playerCount`, `maxPlayers`
    expect(body["roomCode"]).toBe(room.roomCode);
    expect(body["status"]).toBe("lobby");
    expect(body["playerCount"]).toBe(1);
    expect(body["maxPlayers"]).toBe(4);
    expect(body["settings"]).toMatchObject({ maxPlayers: 4, mode: "solo", mapId: "map-01", isPrivate: false });
  });

  it("rooms.md: joinable is false once the room is full", async () => {
    // Arrange
    const rig = createRig();
    const room = await newRoom(rig, 2);
    await rig.request("POST", `/rooms/${room.roomCode}/join`, {
      token: await rig.token(accountSubject(GUEST)),
      body: { displayName: "Linh" },
    });

    // Act
    const body = (await (await rig.request("GET", `/rooms/${room.roomCode}`)).json()) as Record<string, unknown>;

    // Assert — rooms.md: "`joinable` is true only while the room is in `lobby` and not full"
    expect(body["joined"]).toBe(2);
    expect(body["joinable"]).toBe(false);
  });

  it("rooms.md: a closed room answers 410 room-closed", async () => {
    // Arrange
    const rig = createRig();
    const room = await newRoom(rig, 2);
    const stub = await rig.rooms.room(room.roomCode);
    await stub.fetch(
      new Request(`https://room.internal/${room.roomCode}/leave`, {
        method: "POST",
        body: JSON.stringify({ playerId: room.playerId }),
      }),
    );

    // Act
    const response = await rig.request("GET", `/rooms/${room.roomCode}`);
    const body = (await response.json()) as Record<string, unknown>;

    // Assert — workflow-state-machine.md: "A closed room ... GET /rooms/:code answers 410"
    expect(response.status).toBe(410);
    expect(body["type"]).toContain("room-closed");
  });

  it("TC-ROOM-127: a malformed code is 404 room-not-found", async () => {
    // Arrange
    const rig = createRig();

    // Act / Assert — US-ROOM-001 AC7
    for (const code of ["ABC", "ABCDEFG", "ABCD1F", "abcd23"]) {
      const response = await rig.request("GET", `/rooms/${code}`);
      expect(response.status, code).toBe(404);
    }
  });

  it("TC-AUTH-075: the public preview exposes no account identifier", async () => {
    // Arrange
    const rig = createRig();
    const room = await newRoom(rig, 4);
    seedProfile(rig.db, { accountId: HOST, displayName: "Bao" });

    // Act
    const raw = await (await rig.request("GET", `/rooms/${room.roomCode}`)).text();

    // Assert
    for (const forbidden of ["accountId", "guestId", "email", "clerk"]) expect(raw).not.toContain(forbidden);
  });
});

describe("GET /turn-credentials", () => {
  beforeEach(() => resetLimits());

  it("TC-ROOM-070: an unconfigured TURN server still yields the public STUN server", async () => {
    // Arrange
    const rig = createRig();
    const token = await rig.token(accountSubject(HOST));

    // Act
    const response = await rig.request("GET", "/turn-credentials", { token });
    const body = (await response.json()) as {
      iceServers: { urls: string }[];
      ttlSeconds: number;
      turn: boolean;
    };

    // Assert — NFR-10: local play must work without a TURN key
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.turn).toBe(false);
    expect(body.iceServers[0]?.urls).toBe("stun:stun.cloudflare.com:3478");
    expect(body.ttlSeconds).toBe(3600);
  });

  it("GET /turn-credentials requires a session token", async () => {
    // Arrange
    const rig = createRig();

    // Act
    const response = await rig.request("GET", "/turn-credentials");

    // Assert
    expect(response.status).toBe(401);
  });
});
