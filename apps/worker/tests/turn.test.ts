/**
 * Turn ownership on the wire (`signaling.md` §9 `move`/`item`, `US-NET-004` AC2) and the TURN credential
 * endpoint `rooms.md` lists against this file (TC-ROOM-051).
 *
 * The room does not run the turn: it only checks the sender's slot against the last snapshot's
 * `turn.activeSlot`, which is why the snapshot has to exist before a move can be judged.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomHarness, makeSnapshot, type FakeSocket } from "./support/room-harness";
import { createRig } from "./support/fake-env";

async function playing(ids = ["h", "p2", "p3", "p4"]): Promise<{
  harness: RoomHarness;
  sockets: Map<string, FakeSocket>;
}> {
  const harness = new RoomHarness();
  await harness.ready();
  return { harness, sockets: await harness.startPlaying(ids) };
}

function socket(sockets: Map<string, FakeSocket>, id: string): FakeSocket {
  const found = sockets.get(id);
  if (!found) throw new Error(`no socket for ${id}`);
  return found;
}

/** `makeSnapshot` starts on slot 0; this moves the turn to `slot` without touching anything else. */
function snapshotFor(seq: number, slot: number): ReturnType<typeof makeSnapshot> {
  const base = makeSnapshot(seq);
  return { ...base, turn: { ...base.turn, activeSlot: slot } };
}

describe("only the active slot may act (signaling.md §9)", () => {
  it("TC-NET-067: the active player's move reaches the host and nobody else", async () => {
    // Arrange — slot 1 is `p2`
    const { harness, sockets } = await playing();
    await harness.message(socket(sockets, "h"), { t: "snapshot_push", snapshot: snapshotFor(1, 1) });
    const host = socket(sockets, "h");
    const p3 = socket(sockets, "p3");
    host.clear();
    p3.clear();

    // Act
    await harness.message(socket(sockets, "p2"), { t: "move", direction: 1, run: true });

    // Assert
    const [move] = host.framesOf("move");
    expect(move).toMatchObject({ from: "p2", direction: 1, run: true });
    expect(p3.framesOf("move")).toHaveLength(0);
    expect(socket(sockets, "p2").errors()).toHaveLength(0);
  });

  it("TC-NET-067: the active player's item reaches the host", async () => {
    // Arrange — slot 2 is `p3`
    const { harness, sockets } = await playing();
    await harness.message(socket(sockets, "h"), { t: "snapshot_push", snapshot: snapshotFor(1, 2) });
    const host = socket(sockets, "h");
    host.clear();

    // Act
    await harness.message(socket(sockets, "p3"), { t: "item", id: "dual" });

    // Assert
    expect(host.framesOf("item")[0]).toMatchObject({ from: "p3", id: "dual" });
  });

  it("TC-NET-067: a member whose slot is not active is refused, even with a legal frame", async () => {
    // Arrange — slot 1 is active, `p4` sits on slot 3
    const { harness, sockets } = await playing();
    await harness.message(socket(sockets, "h"), { t: "snapshot_push", snapshot: snapshotFor(1, 1) });
    const p4 = socket(sockets, "p4");
    const host = socket(sockets, "h");
    p4.clear();
    host.clear();

    // Act
    await harness.message(p4, { t: "item", id: "dual" });

    // Assert
    expect(p4.errors().map((frame) => frame["code"])).toEqual(["unsupported-message"]);
    expect(host.framesOf("item")).toHaveLength(0);
  });

  it("TC-NET-067: when the turn advances the right to act moves with it", async () => {
    // Arrange — slot 1 acts first, then the host advances to slot 2
    const { harness, sockets } = await playing();
    const host = socket(sockets, "h");
    await harness.message(host, { t: "snapshot_push", snapshot: snapshotFor(1, 1) });
    await harness.message(host, { t: "snapshot_push", snapshot: snapshotFor(2, 2) });
    const p2 = socket(sockets, "p2");
    p2.clear();

    // Act — the old active slot tries again, the new one acts
    await harness.message(p2, { t: "move", direction: 0, run: false });
    await harness.message(socket(sockets, "p3"), { t: "move", direction: 1, run: false });

    // Assert
    expect(p2.errors().map((frame) => frame["code"])).toEqual(["unsupported-message"]);
    expect(host.framesOf("move").map((frame) => frame["from"])).toEqual(["p3"]);
  });

  it("TC-NET-067: a stale snapshot cannot re-wind the active slot", async () => {
    // Arrange — seq 2 makes slot 2 active; a late seq 1 still claims slot 1
    const { harness, sockets } = await playing();
    const host = socket(sockets, "h");
    await harness.message(host, { t: "snapshot_push", snapshot: snapshotFor(2, 2) });
    await harness.message(host, { t: "snapshot_push", snapshot: snapshotFor(1, 1) });
    const p2 = socket(sockets, "p2");
    p2.clear();
    host.clear();

    // Act
    await harness.message(p2, { t: "move", direction: 1, run: false });

    // Assert — the dropped snapshot did not move the turn back
    expect(p2.errors().map((frame) => frame["code"])).toEqual(["unsupported-message"]);
    expect(harness.state().lastSnapshot?.turn.activeSlot).toBe(2);
  });

  it("TC-NET-067: the host acting on its own turn is applied locally and never echoed", async () => {
    // Arrange — slot 0 is the host
    const { harness, sockets } = await playing();
    await harness.message(socket(sockets, "h"), { t: "snapshot_push", snapshot: snapshotFor(1, 0) });
    const host = socket(sockets, "h");
    const peer = socket(sockets, "p2");
    host.clear();
    peer.clear();

    // Act
    await harness.message(host, { t: "move", direction: 1, run: false });

    // Assert — no relay to the peers and no error for the host
    expect(peer.framesOf("move")).toHaveLength(0);
    expect(host.errors()).toHaveLength(0);
  });

});

describe("GET /turn-credentials (rooms.md, TC-ROOM-051)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("TC-ROOM-051: without a TURN key the answer is STUN-only, 200, and carries a TTL", async () => {
    // Arrange
    const rig = createRig();
    const token = await rig.token({ kind: "account", accountId: "acct-1", guestId: null });

    // Act
    const response = await rig.request("GET", "/turn-credentials", { token });

    // Assert
    expect(response.status).toBe(200);
    const body = (await response.json()) as { iceServers: { urls: string }[]; ttlSeconds: number; turn: boolean };
    expect(body.turn).toBe(false);
    expect(body.ttlSeconds).toBeGreaterThan(0);
    expect(body.iceServers.map((server) => server.urls)).toContain("stun:stun.cloudflare.com:3478");
    expect(response.headers.get("cache-control")).toBe("no-store");
    rig.db.close();
  });

  it("TC-ROOM-051: with a TURN key the STUN entry stays first and the TTL is passed through", async () => {
    // Arrange — the Cloudflare API is stubbed; the credential shape is the one it returns
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
      return Response.json({
        iceServers: { urls: ["turn:turn.cloudflare.com:3478?transport=udp"], username: "u", credential: "c" },
      });
    });
    const rig = createRig({ turnKeyId: "key-1", turnKeyToken: "token-1" });
    const token = await rig.token({ kind: "account", accountId: "acct-1", guestId: null });

    // Act
    const response = await rig.request("GET", "/turn-credentials", { token });

    // Assert
    const body = (await response.json()) as { iceServers: { urls: string | string[] }[]; ttlSeconds: number; turn: boolean };
    expect(body.turn).toBe(true);
    expect(body.ttlSeconds).toBe(3600);
    expect(calls[0]?.url).toContain("/turn/keys/key-1/credentials/generate");
    expect(calls[0]?.body).toEqual({ ttl: 3600 });
    const urls = body.iceServers.flatMap((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]));
    expect(urls[0]).toBe("stun:stun.cloudflare.com:3478");
    expect(urls.some((url) => url.startsWith("turn:"))).toBe(true);
    rig.db.close();
  });
});
