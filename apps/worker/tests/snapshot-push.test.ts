/**
 * The host may push the packed snapshot (`US-NET-002` AC7).
 *
 * The 10 Hz `state` channel already travels packed, but the per-turn `snapshot_push` to the Durable Object carried the
 * expanded object (1319 B for eight players). Accepting the packed form lets the host send ~380 B instead, while the DO
 * keeps storing an ordinary `Snapshot`, because a rejoin replay is one message, not a stream.
 */
import { describe, expect, it } from "vitest";
import type { WireSnapshot } from "@gbw/core";
import { makeSnapshot, RoomHarness, type FakeSocket } from "./support/room-harness";

const IDS = ["host", "p1", "p2", "p3"] as const;

async function playing(): Promise<{ harness: RoomHarness; sockets: Map<string, FakeSocket> }> {
  const harness = new RoomHarness();
  await harness.ready();
  for (const id of IDS) await harness.join({ playerId: id, accountId: `acct-${id}` });
  const sockets = new Map<string, FakeSocket>();
  for (const id of IDS) sockets.set(id, await harness.connect(id));
  const host = sockets.get("host")!;
  await harness.message(host, {
    t: "team_assign",
    assignments: IDS.map((id, index) => ({ playerId: id, team: index % 2 === 0 ? "A" : "B" })),
  });
  await harness.message(host, { t: "start_match" });
  harness.clearAll(sockets.values());
  return { harness, sockets };
}

/** The packed form of `makeSnapshot(7)`: one number array per player, `US-NET-002` AC7. */
function packed(): WireSnapshot {
  return {
    s: 7,
    g: 1,
    t: [1, 0, 0, 1],
    w: [0, 0],
    p: [[0, 100, 0, 0, 0, 0, 1, 0, 0, 0]],
    j: [],
    sc: [0, 0],
    st: "playing",
    wt: null,
  };
}

describe("snapshot_push accepts the packed form", () => {
  it("expands it, so the stored replay is an ordinary snapshot", async () => {
    const { harness, sockets } = await playing();
    const host = sockets.get("host")!;

    await harness.message(host, { t: "snapshot_push", snapshot: packed() });

    const stored = harness.state().lastSnapshot;
    expect(stored?.seq).toBe(7);
    expect(stored?.players[0]?.slot).toBe(0);
    expect(stored?.players[0]?.hp).toBe(100);
  });

  it("still accepts the expanded form, so an older client keeps working", async () => {
    const { harness, sockets } = await playing();
    const host = sockets.get("host")!;

    await harness.message(host, { t: "snapshot_push", snapshot: makeSnapshot(9, 1) });

    expect(harness.state().lastSnapshot?.seq).toBe(9);
  });

  it("relays the packed object, so no snapshot on the wire passes the budget", async () => {
    const { harness, sockets } = await playing();
    const host = sockets.get("host")!;

    await harness.message(host, { t: "snapshot_push", snapshot: packed() });

    const frame = sockets.get("p1")!.frames().find((entry) => entry["t"] === "snapshot_state");
    expect(frame).toBeDefined();
    const snapshot = frame!["snapshot"] as { s?: number; p?: unknown[]; players?: unknown };
    expect(snapshot.s).toBe(7);
    expect(Array.isArray(snapshot.p)).toBe(true);
    expect(snapshot.players).toBeUndefined();
    expect(JSON.stringify(snapshot).length).toBeLessThan(800);
  });
});
