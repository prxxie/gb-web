/**
 * `US-NET-004` AC6 — one structured line per rejected frame, and never the payload.
 *
 * The room used to answer a refused frame with an `error` and nothing else, so a support question ("why did our peer
 * get `not-host`?") had no server-side answer: the runbook queries filter on `room_code` and `code`, and neither was
 * written anywhere (`NFR-24`). The line below carries the identity the socket authenticated as, never a claim from the
 * frame, and no part of the refused message.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROOM_CODE, RoomHarness, makeSnapshot, type FakeSocket } from "./support/room-harness";

interface Line {
  readonly request_id?: string;
  readonly room_code?: string;
  readonly player_id?: string;
  readonly code?: string;
  readonly route?: string;
  readonly [key: string]: unknown;
}

let lines: Line[] = [];
let restore: (() => void) | null = null;

beforeEach(() => {
  lines = [];
  const spy = vi.spyOn(console, "info").mockImplementation((value: unknown) => {
    if (typeof value !== "string") return;
    try {
      lines.push(JSON.parse(value) as Line);
    } catch {
      /* the room also logs nothing else in this test */
    }
  });
  restore = () => spy.mockRestore();
});

afterEach(() => {
  restore?.();
});

/** Join + connect every id, then seat them and start the match: a `snapshot_push` is judged by role only while playing. */
async function openRoom(ids: readonly string[]): Promise<{
  harness: RoomHarness;
  sockets: Map<string, FakeSocket>;
  hostId: string;
  peerId: string;
}> {
  const harness = new RoomHarness();
  await harness.ready();
  const [hostId = "h", ...rest] = ids;
  for (const id of ids) await harness.join({ playerId: id, accountId: `acct-${id}` });
  const sockets = new Map<string, FakeSocket>();
  for (const id of ids) sockets.set(id, await harness.connect(id));
  const host = sockets.get(hostId)!;
  await harness.message(host, {
    t: "team_assign",
    assignments: ids.map((id, index) => ({ playerId: id, team: index % 2 === 0 ? "A" : "B" })),
  });
  await harness.message(host, { t: "start_match" });
  return { harness, sockets, hostId, peerId: rest[0] ?? hostId };
}

describe("TC-NET-011: a rejected frame is one structured line (US-NET-004 AC6)", () => {
  it("writes the code, the room and the identity the socket authenticated as", async () => {
    const { harness, sockets, peerId } = await openRoom(["h", "p2"]);
    const peer = sockets.get(peerId)!;
    peer.clear();

    await harness.message(peer, { t: "snapshot_push", snapshot: makeSnapshot(1) });

    const rejected = lines.filter((line) => line.code === "not-host");
    expect(rejected).toHaveLength(1);
    const line = rejected[0]!;
    expect(line.room_code).toBe(ROOM_CODE);
    expect(line.player_id).toBe(peerId);
    expect(typeof line.request_id).toBe("string");
    expect(line.request_id!.length).toBeGreaterThan(8);
    expect(line.route).toContain("/ws");
  });

  it("never logs the refused payload", async () => {
    const { harness, sockets, peerId } = await openRoom(["h", "p2"]);
    const peer = sockets.get(peerId)!;
    peer.clear();

    await harness.message(peer, { t: "snapshot_push", snapshot: { ...makeSnapshot(7), secret: "hunter2" } });

    const line = lines.find((candidate) => candidate.code === "not-host")!;
    const text = JSON.stringify(line);
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("players");
    expect(text).not.toContain("snapshot");
  });

  it("gives two frames from the same socket different request ids", async () => {
    const { harness, sockets, peerId } = await openRoom(["h", "p2"]);
    const peer = sockets.get(peerId)!;
    peer.clear();

    await harness.message(peer, { t: "snapshot_push", snapshot: makeSnapshot(1) });
    await harness.message(peer, { t: "snapshot_push", snapshot: makeSnapshot(2) });

    const ids = lines.filter((line) => line.code === "not-host").map((line) => line.request_id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("TC-NET-015: a frame before auth closes 4401 (US-NET-004 AC3)", () => {
  it("closes the socket before it can write anything", async () => {
    const { harness } = await openRoom(["h", "p2"]);
    const before = JSON.stringify(harness.state().members.map((member) => member.connectionState));

    // Act — a socket that never authenticated sends a state frame
    const stranger = await harness.upgrade();
    await harness.message(stranger, { t: "snapshot_push", snapshot: makeSnapshot(3) });

    // Assert — signaling.md §2: nothing before `auth`; the roster is untouched
    expect(stranger.closes.map((event) => event.code)).toEqual([4401]);
    expect(JSON.stringify(harness.state().members.map((member) => member.connectionState))).toBe(before);
  });
});
