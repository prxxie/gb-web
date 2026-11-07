// @vitest-environment jsdom
/**
 * TC-NET-901: one reliable channel for inputs and one lossy channel for state (`US-NET-001` AC1, AC2, AC3).
 *
 * jsdom ships no WebRTC, so the case installs a stand-in that records the `RTCDataChannelInit` each channel was created
 * with and can fire `open`, `datachannel` and `connectionstatechange` by hand. What matters here is: only the host
 * creates the channels, the two labels are the contract, the state channel may drop, and no snapshot leaves before the
 * last peer is connected — or five seconds, whichever comes first.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@gbw/core";
import { CONTROL_LABEL, STATE_LABEL, awaitPeerConnected, createChannels } from "../src/net/channels";
import { createMesh, type SignalChannel } from "../src/net/mesh";

class FakeChannel {
  readyState = "open" as RTCDataChannelState;
  bufferedAmount = 0;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();
  constructor(
    readonly label: string,
    readonly init?: RTCDataChannelInit,
  ) {}
  addEventListener(type: string, listener: (event: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  removeEventListener(): void {}
  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  send(payload: string): void {
    this.sent.push(payload);
  }
  close(): void {
    this.readyState = "closed";
  }
}

class FakeConnection {
  static readonly created: FakeConnection[] = [];
  connectionState = "new" as RTCPeerConnectionState;
  localDescription: unknown = null;
  remoteDescription: unknown = null;
  readonly channels: FakeChannel[] = [];
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();
  constructor() {
    FakeConnection.created.push(this);
  }
  addEventListener(type: string, listener: (event: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((entry) => entry !== listener));
  }
  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  createDataChannel(label: string, init?: RTCDataChannelInit): FakeChannel {
    const channel = new FakeChannel(label, init);
    this.channels.push(channel);
    return channel;
  }
  channel(label: string): FakeChannel {
    const found = this.channels.find((channel) => channel.label === label);
    if (!found) throw new Error(`no ${label} channel`);
    return found;
  }
  async createOffer() {
    return { type: "offer" as const, sdp: "v=0\r\n" };
  }
  async createAnswer() {
    return { type: "answer" as const, sdp: "v=0\r\n" };
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
  connect(): void {
    this.connectionState = "connected";
    this.emit("connectionstatechange");
  }
  close(): void {
    this.connectionState = "closed";
  }
}

const SNAPSHOT = { seq: 1, hostGeneration: 1, turn: { activeSlot: 0 } } as unknown as Snapshot;

function meshOf(isHost: boolean, hostHello?: () => unknown) {
  const signals: SignalChannel[] = [];
  const snapshots: Snapshot[] = [];
  const controls: unknown[] = [];
  const mesh = createMesh({
    selfPlayerId: isHost ? "ply-host" : "ply-bob",
    isHost,
    iceServers: [],
    send: (channel) => signals.push(channel),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onControl: (_from, message) => controls.push(message),
    onPeerState: () => undefined,
    ...(hostHello ? { hostHello } : {}),
  });
  return { mesh, signals, snapshots, controls };
}

beforeEach(() => {
  FakeConnection.created.length = 0;
  vi.stubGlobal("RTCPeerConnection", FakeConnection);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("TC-NET-901: two channels with different promises (US-NET-001 AC1, AC2)", () => {
  it("creates `control` ordered and `state` unordered with no retransmits", () => {
    const connection = new FakeConnection();
    const channels = createChannels(connection as unknown as RTCPeerConnection);

    expect(channels.control.label).toBe(CONTROL_LABEL);
    expect(channels.state.label).toBe(STATE_LABEL);
    expect(connection.channel("control").init).toEqual({ ordered: true });
    expect(connection.channel("state").init).toEqual({ ordered: false, maxRetransmits: 0 });
  });

  it("greets a peer on every new control channel with the host generation", async () => {
    const { mesh } = meshOf(true, () => ({ t: "host_hello", hostGeneration: 4, seq: 12 }));
    await mesh.addPeer("ply-bob");

    const connection = FakeConnection.created[0]!;
    const hello = connection.channel("control").sent.map((raw) => JSON.parse(raw) as { t: string });
    expect(hello).toEqual([{ t: "host_hello", hostGeneration: 4, seq: 12 }]);
  });

  it("a peer wires nothing until both channels arrive, so state never rides on control", async () => {
    const { mesh, snapshots, controls } = meshOf(false);
    const applied = mesh.applySignal("ply-host", "offer", { type: "offer", sdp: "v=0" });
    await applied;

    const connection = FakeConnection.created[0]!;
    const control = new FakeChannel("control");
    connection.emit("datachannel", { channel: control });

    // Only one channel so far: the mesh must not treat `control` as the state channel.
    mesh.broadcast(SNAPSHOT);
    expect(control.sent).toEqual([]);

    const state = new FakeChannel("state");
    connection.emit("datachannel", { channel: state });

    control.emit("message", { data: JSON.stringify({ t: "input", kind: "skip" }) });
    state.emit("message", { data: JSON.stringify(SNAPSHOT) });
    expect(controls).toEqual([{ t: "input", kind: "skip" }]);
    expect(snapshots).toHaveLength(1);
  });
});

describe("TC-NET-901: snapshots wait for the last peer (US-NET-001 AC3)", () => {
  it("sends nothing before the peer is connected, then sends at once", async () => {
    const { mesh } = meshOf(true);
    await mesh.addPeer("ply-bob");

    const connection = FakeConnection.created[0]!;
    mesh.broadcast(SNAPSHOT);
    expect(connection.channel("state").sent).toEqual([]);

    connection.connect();
    mesh.broadcast(SNAPSHOT);
    expect(connection.channel("state").sent).toHaveLength(1);
  });

  it("gives up waiting after five seconds so one unreachable peer cannot freeze the match", async () => {
    // The gate measures elapsed time with `performance.now()`, so the clock has to be faked with it.
    vi.useFakeTimers({ toFake: ["performance", "setTimeout", "clearTimeout"] });
    const { mesh } = meshOf(true);
    await mesh.addPeer("ply-bob");
    const connection = FakeConnection.created[0]!;

    mesh.broadcast(SNAPSHOT);
    expect(connection.channel("state").sent).toEqual([]);

    vi.advanceTimersByTime(5_100);
    mesh.broadcast(SNAPSHOT);
    expect(connection.channel("state").sent).toHaveLength(1);
  });
});

describe("TC-NET-901: awaitPeerConnected (US-NET-001 AC3, AC4)", () => {
  it("resolves true the moment the connection reports connected", async () => {
    const connection = new FakeConnection();
    const pending = awaitPeerConnected(connection as unknown as RTCPeerConnection, 5_000);
    connection.connect();
    await expect(pending).resolves.toBe(true);
  });

  it("resolves false after the timeout and as soon as the connection fails", async () => {
    vi.useFakeTimers();
    const slow = new FakeConnection();
    const timingOut = awaitPeerConnected(slow as unknown as RTCPeerConnection, 500);
    vi.advanceTimersByTime(600);
    await expect(timingOut).resolves.toBe(false);

    vi.useRealTimers();
    const failing = new FakeConnection();
    const failingWait = awaitPeerConnected(failing as unknown as RTCPeerConnection, 5_000);
    failing.close();
    failing.emit("connectionstatechange");
    await expect(failingWait).resolves.toBe(false);
  });

  it("answers immediately for a connection that is already connected or already dead", async () => {
    const open = new FakeConnection();
    open.connect();
    await expect(awaitPeerConnected(open as unknown as RTCPeerConnection, 10)).resolves.toBe(true);
    const dead = new FakeConnection();
    dead.close();
    await expect(awaitPeerConnected(dead as unknown as RTCPeerConnection, 10)).resolves.toBe(false);
  });
});
