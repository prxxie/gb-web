// @vitest-environment jsdom
/**
 * TC-ROOM-196 / TC-ROOM-197: the peer mesh's two contract halves (`US-ROOM-006` AC4, AC5).
 *
 * jsdom ships no WebRTC, so the case installs a recording stand-in for `RTCPeerConnection`: what
 * matters is the ordering of `applySignal` (one answer per offer, never two) and the fact that the
 * mesh keeps ICE credentials in memory only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@gbw/core";
import { createMesh, type SignalChannel } from "../src/net/mesh";

const OFFER = { type: "offer" as const, sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n" };
const TURN = {
  urls: "turns:turn.example.com:5349",
  username: "turn-user-7123",
  credential: "turn-credential-s3cret",
};

/** Records what the mesh asked of every connection; answers with fixed descriptions. */
class FakePeerConnection {
  static readonly instances: FakePeerConnection[] = [];
  localDescription: unknown = null;
  remoteDescription: unknown = null;
  connectionState = "new" as RTCPeerConnectionState;
  readonly channels: FakeDataChannel[] = [];
  private readonly listeners = new Map<string, ((event: never) => void)[]>();

  constructor(readonly config: { iceServers: readonly RTCIceServer[] }) {
    FakePeerConnection.instances.push(this);
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  createDataChannel(label: string): FakeDataChannel {
    const channel = new FakeDataChannel(label);
    this.channels.push(channel);
    return channel;
  }

  async createOffer() {
    return OFFER;
  }

  async createAnswer() {
    return { type: "answer" as const, sdp: "v=0\r\nanswer\r\n" };
  }

  async setLocalDescription(description: unknown) {
    this.localDescription = description;
  }

  async setRemoteDescription(description: unknown) {
    this.remoteDescription = description;
  }

  async addIceCandidate(): Promise<void> {
    return Promise.resolve();
  }

  close(): void {
    this.connectionState = "closed";
  }
}

class FakeDataChannel {
  readyState = "open" as RTCDataChannelState;
  bufferedAmount = 0;
  readonly sent: string[] = [];
  constructor(readonly label: string) {}
  addEventListener(): void {}
  send(payload: string): void {
    this.sent.push(payload);
  }
  close(): void {
    this.readyState = "closed";
  }
}

function meshOf(isHost: boolean) {
  const signals: SignalChannel[] = [];
  const mesh = createMesh({
    selfPlayerId: isHost ? "ply-host" : "ply-bob",
    isHost,
    iceServers: [TURN],
    send: (channel) => signals.push(channel),
    onSnapshot: () => undefined,
    onControl: () => undefined,
    onPeerState: () => undefined,
  });
  return { mesh, signals };
}

beforeEach(() => {
  FakePeerConnection.instances.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TC-ROOM-197: one answer per offer", () => {
  it("a joining peer answers the host's offer exactly once, after setting the remote description", async () => {
    const { mesh, signals } = meshOf(false);

    await mesh.applySignal("ply-host", "offer", OFFER);

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: "answer", to: "ply-host" });
    expect(FakePeerConnection.instances).toHaveLength(1);
    expect(FakePeerConnection.instances[0].remoteDescription).toEqual(OFFER);
    expect(FakePeerConnection.instances[0].localDescription).toMatchObject({ type: "answer" });
  });

  it("the host answers a peer's offer on the connection it already opened, not a second one", async () => {
    const { mesh, signals } = meshOf(true);
    await mesh.addPeer("ply-bob");
    expect(signals.map((signal) => signal.kind)).toEqual(["offer"]);

    await mesh.applySignal("ply-bob", "offer", OFFER);

    expect(FakePeerConnection.instances).toHaveLength(1);
    expect(signals.map((signal) => signal.kind)).toEqual(["offer", "answer"]);
    expect(signals[1]).toMatchObject({ kind: "answer", to: "ply-bob" });
  });

  it("an offer repeated for the same peer does not create a third connection", async () => {
    const { mesh, signals } = meshOf(true);
    await mesh.addPeer("ply-bob");

    await mesh.applySignal("ply-bob", "offer", OFFER);
    await mesh.applySignal("ply-bob", "offer", OFFER);

    expect(FakePeerConnection.instances).toHaveLength(1);
    expect(signals.filter((signal) => signal.kind === "answer")).toHaveLength(2);
    expect(new Set(signals.map((signal) => signal.to))).toEqual(new Set(["ply-bob"]));
  });
});

describe("TC-ROOM-196: ICE credentials never reach storage", () => {
  it("a full handshake plus traffic leaves no credential, username or token in storage or cookies", async () => {
    const { mesh } = meshOf(true);
    await mesh.addPeer("ply-bob");
    await mesh.applySignal("ply-bob", "answer", { type: "answer", sdp: "v=0\r\n" });
    await mesh.applySignal("ply-bob", "candidate", { candidate: "candidate:1 1 udp 2113937151 10.0.0.1" });
    mesh.broadcast({ turn: { activeSlot: 0 } } as unknown as Snapshot);
    mesh.sendControlAll({ t: "input", at: 1 });
    mesh.close();

    const haystack = [
      ...Object.entries(localStorage).map(([key, value]) => `${key}=${value}`),
      ...Object.entries(sessionStorage).map(([key, value]) => `${key}=${value}`),
      document.cookie,
    ].join("\n");

    expect(Object.keys(localStorage)).toEqual([]);
    expect(Object.keys(sessionStorage)).toEqual([]);
    expect(haystack).not.toContain(TURN.username);
    expect(haystack).not.toContain(TURN.credential);
    expect(haystack).not.toContain("turn-credential");
  });
});
