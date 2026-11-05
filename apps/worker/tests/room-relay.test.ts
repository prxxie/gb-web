/**
 * Signalling relay oracle for the `Room` Durable Object (`US-ROOM-006`).
 * `docs/02-reference/api/signaling.md`: a signal reaches only its `to`, never the sender, and an
 * offline peer and a stranger answer identically so the socket cannot probe the roster.
 */
import { describe, expect, it } from "vitest";
import { RoomHarness, type FakeSocket } from "./support/room-harness";

const OFFER = { kind: "offer", sdp: "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n" } as const;

async function lobby(): Promise<{
  harness: RoomHarness;
  sockets: Map<string, FakeSocket>;
}> {
  const harness = new RoomHarness();
  await harness.ready();
  for (const id of ["alice", "bob", "carol"]) {
    await harness.join({ playerId: id, accountId: `acct-${id}` });
  }
  const sockets = new Map<string, FakeSocket>();
  for (const id of ["alice", "bob", "carol"]) sockets.set(id, await harness.connect(id));
  harness.clearAll(sockets.values());
  return { harness, sockets };
}

describe("room signalling relay", () => {
  it("TC-ROOM-050: a signal reaches only its target, is byte-identical and is never stored", async () => {
    const { harness, sockets } = await lobby();
    const alice = sockets.get("alice")!;
    const bob = sockets.get("bob")!;
    const carol = sockets.get("carol")!;

    await harness.message(alice, { t: "signal", to: "bob", payload: OFFER });

    const delivered = bob.frames();
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ t: "signal", from: "alice" });
    expect(JSON.stringify(delivered[0]?.["payload"])).toBe(JSON.stringify(OFFER));
    expect(alice.frames()).toEqual([]);
    expect(carol.frames()).toEqual([]);
    expect(harness.storageKeys().filter((key) => key.toLowerCase().includes("signal"))).toEqual([]);
  });

  it("TC-ROOM-125: an offline peer and an unknown peer answer peer-not-connected identically", async () => {
    const harness = new RoomHarness();
    await harness.ready();
    for (const id of ["alice", "bob", "carol"]) {
      await harness.join({ playerId: id, accountId: `acct-${id}` });
    }
    const alice = await harness.connect("alice");
    const carol = await harness.connect("carol");
    harness.clearAll([alice, carol]);

    // `bob` is a member but has no socket; `ghost` was never in the room.
    await harness.message(alice, { t: "signal", to: "bob", payload: OFFER });
    const offline = alice.errors();
    expect(offline).toHaveLength(1);
    expect(Object.keys(offline[0]!).sort()).toEqual(["code", "detail", "t"]);
    expect(offline[0]).toEqual({
      t: "error",
      code: "peer-not-connected",
      detail: "the peer has no open socket",
    });

    alice.clear();
    await harness.message(alice, { t: "signal", to: "ghost", payload: OFFER });
    expect(alice.errors()).toEqual(offline);
    expect(carol.frames()).toEqual([]);
  });

  it("TC-ROOM-125: a signal to yourself is bad-request and is not relayed", async () => {
    const { harness, sockets } = await lobby();
    const alice = sockets.get("alice")!;

    await harness.message(alice, { t: "signal", to: "alice", payload: { kind: "answer", sdp: "v=0\r\n" } });

    expect(alice.errors()).toEqual([
      { t: "error", code: "bad-request", detail: "a client cannot signal itself" },
    ]);
    expect(sockets.get("bob")!.frames()).toEqual([]);
    expect(sockets.get("carol")!.frames()).toEqual([]);
  });
});
