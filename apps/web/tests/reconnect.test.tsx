/**
 * `docs/01-overview/workflow-state-machine.md` — the client half of the grace window (`US-ROOM-004` AC7).
 *
 * `connectWithReconnect` wraps `connectRoom`. The socket is faked here so the test can decide exactly when a
 * connection dies and with which close code, which is the whole point: a transient code must retry inside the
 * window, and a code the server chose must not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectWithReconnect } from "../src/net/reconnect";

const OPEN = 1;

/** The smallest fake that satisfies what `connectRoom` touches. */
class FakeSocket {
  static instances: FakeSocket[] = [];
  readonly sent: string[] = [];
  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  readyState = 0;
  closed = false;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
  }

  /** The server accepted the upgrade. */
  open(): void {
    this.readyState = OPEN;
    for (const listener of this.listeners.get("open") ?? []) listener({});
  }

  /** The connection died. */
  die(code: number): void {
    this.readyState = 3;
    for (const listener of this.listeners.get("close") ?? []) listener({ code });
  }
}

const options = {
  wsUrl: "ws://gbw.example/api/v1/rooms/ABC234/ws",
  token: "token",
  displayName: "Bao",
  mobileId: "mbl-01",
};

beforeEach(() => {
  FakeSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("window", { setInterval: () => 1, clearInterval: () => undefined });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function latest(): FakeSocket {
  const socket = FakeSocket.instances.at(-1);
  if (!socket) throw new Error("no socket was opened");
  return socket;
}

describe("connectWithReconnect", () => {
  it("TC-ROOM-174: a socket that dies with a transient code is reopened and reports the recovery", () => {
    // Arrange
    const onReconnecting = vi.fn();
    const onReconnected = vi.fn();
    const onFatal = vi.fn();
    const socket = connectWithReconnect({ ...options, onReconnecting, onReconnected, onFatal });
    latest().open();
    expect(FakeSocket.instances).toHaveLength(1);

    // Act — 1006 is "the connection went away", not something the server chose
    latest().die(1006);
    expect(onReconnecting).toHaveBeenCalledWith(1);
    vi.advanceTimersByTime(500);
    latest().open();

    // Assert
    expect(FakeSocket.instances).toHaveLength(2);
    expect(onReconnected).toHaveBeenCalledTimes(1);
    expect(onFatal).not.toHaveBeenCalled();
    socket.close();
  });

  it("TC-ROOM-175: a code the server chose is never retried", () => {
    // Arrange
    const onFatal = vi.fn();
    const onReconnecting = vi.fn();
    const socket = connectWithReconnect({ ...options, onFatal, onReconnecting });
    latest().open();

    // Act — 4401 means the token is bad; the next attempt would get the same answer
    latest().die(4401);
    vi.advanceTimersByTime(10_000);

    // Assert
    expect(onFatal).toHaveBeenCalledWith(4401);
    expect(onReconnecting).not.toHaveBeenCalled();
    expect(FakeSocket.instances).toHaveLength(1);
    socket.close();
  });

  it("TC-ROOM-176: retries stop once the grace window has passed", () => {
    // Arrange — the room forgets a silent member after 20 s, so a later socket arrives as a stranger
    const onFatal = vi.fn();
    const socket = connectWithReconnect({ ...options, onFatal });
    latest().open();
    latest().die(1006);
    vi.advanceTimersByTime(500);
    latest().die(1006);
    vi.advanceTimersByTime(1_000);

    // Act — 21 s after the first failure
    vi.advanceTimersByTime(20_000);
    latest().die(1006);

    // Assert
    expect(onFatal).toHaveBeenCalled();
    socket.close();
  });

  it("TC-ROOM-177: closing the wrapper stops the retry loop", () => {
    // Arrange
    const onReconnecting = vi.fn();
    const socket = connectWithReconnect({ ...options, onReconnecting });
    latest().open();

    // Act — the component unmounted while the socket was already dead
    latest().die(1006);
    socket.close();
    vi.advanceTimersByTime(10_000);

    // Assert
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
