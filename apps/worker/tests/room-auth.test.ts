/**
 * Auth and liveness oracle for the `Room` Durable Object (`docs/02-reference/api/signaling.md` § 2–3).
 * `US-ROOM-002`: a socket proves identity within 5 s, and a ping answers with the same `at`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomHarness } from "./support/room-harness";

const BASE = 1_700_000_000_000;

describe("room socket auth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("TC-ROOM-121: a socket that sends nothing is closed 4401 after five seconds", async () => {
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "host", accountId: "acct-host" });

    const socket = await harness.upgrade();
    expect(socket.closes).toEqual([]);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(socket.closes).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(socket.closes).toEqual([{ code: 4401, reason: "auth timeout" }]);
  });

  it("TC-ROOM-121: a bad session token is closed 4401 and creates no member", async () => {
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "host", accountId: "acct-host" });
    const rosterBefore = harness.state().members;

    const socket = await harness.upgrade();
    await harness.message(socket, { t: "auth", token: "not-a-session-token" });

    expect(socket.closes).toEqual([{ code: 4401, reason: "invalid session token" }]);
    expect(harness.state().members).toEqual(rosterBefore);
    expect(harness.state().members).toHaveLength(1);
  });

  it("TC-ROOM-126: any frame before auth closes the socket 4401", async () => {
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "host", accountId: "acct-host" });

    const socket = await harness.upgrade();
    await harness.message(socket, { t: "ping", at: 1 });

    expect(socket.closes).toEqual([{ code: 4401, reason: "auth required" }]);
    expect(socket.framesOf("pong")).toEqual([]);
  });

  it("TC-ROOM-127: a ping is answered with a pong that echoes the same at", async () => {
    const harness = new RoomHarness();
    await harness.ready();
    await harness.join({ playerId: "host", accountId: "acct-host" });
    const socket = await harness.connect("host");
    socket.clear();

    await harness.message(socket, { t: "ping", at: 1234 });

    expect(socket.frames()).toEqual([{ t: "pong", at: 1234, now: BASE }]);
  });
});
