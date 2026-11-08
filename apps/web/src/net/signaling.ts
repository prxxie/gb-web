/**
 * Room socket (`US-ROOM-002`, `US-ROOM-005`, `docs/02-reference/api/signaling.md` § 1).
 *
 * The token travels in the first message, never in the URL — a URL ends up in logs and in the
 * Referer header (`NFR-09`).
 */
import {
  PING_INTERVAL_MS,
  PING_MISSES_BEFORE_GRACE,
  parseServerFrame,
  type ClientFrame,
  type ServerFrame,
} from "@gbw/core";

/**
 * The frame types are the engine's, not copies: `packages/core/src/protocol.ts` validates the same
 * field sets on the Worker, so a rename breaks the build here instead of turning into a silent no-op
 * (`team_assign` used to be exactly that).
 */
export type ClientMessage = ClientFrame;
export type ServerMessage = ServerFrame;

export interface ConnectOptions {
  readonly wsUrl: string;
  readonly token: string;
  readonly displayName: string;
  /**
   * Only the first authentication needs it. A lobby member's pick travels in its `loadout` frame afterwards, and
   * omitting it on a reconnect leaves the stored pick alone (`US-ROOM-007` AC7).
   */
  readonly mobileId?: string;
  readonly avatarId?: string;
  readonly onMessage: (message: ServerMessage) => void;
  readonly onClose?: (code: number) => void;
  readonly onOpen?: () => void;
  /** Round-trip time in ms, measured from the `pong` echo (`signaling.md` § 3). */
  readonly onRtt?: (rttMs: number) => void;
}

export interface RoomSocket {
  send(message: ClientMessage): void;
  close(): void;
  readonly readyState: () => number;
}

/** Open the room socket and authenticate. Returns as soon as the socket exists, not when it opens. */
export function connectRoom(options: ConnectOptions): RoomSocket {
  const socket = new WebSocket(options.wsUrl);
  let heartbeat: number | null = null;
  let misses = 0;

  socket.addEventListener("open", () => {
    const auth: ClientMessage = {
      t: "auth",
      token: options.token,
      displayName: options.displayName,
      ...(options.mobileId ? { mobileId: options.mobileId } : {}),
      ...(options.avatarId ? { avatarId: options.avatarId } : {}),
    };
    socket.send(JSON.stringify(auth));
    heartbeat = window.setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      // A missed pong is a missed heartbeat: three of them mean the socket is dead even if it looks open
      // (`US-ROOM-002` AC6).
      misses += 1;
      if (misses > PING_MISSES_BEFORE_GRACE) {
        socket.close(4408, "heartbeat timeout");
        return;
      }
      socket.send(JSON.stringify({ t: "ping", at: Date.now() } satisfies ClientMessage));
    }, PING_INTERVAL_MS);
    options.onOpen?.();
  });

  socket.addEventListener("message", (event) => {
    const parsed = parseServerFrame(String(event.data));
    if (!parsed.ok) return;
    if (parsed.frame.t === "pong") {
      misses = 0;
      options.onRtt?.(Math.max(0, Date.now() - parsed.frame.at));
    }
    // A frame the client does not understand is dropped; only `error` is worth surfacing.
    options.onMessage(parsed.frame);
  });

  socket.addEventListener("close", (event) => {
    if (heartbeat !== null) window.clearInterval(heartbeat);
    heartbeat = null;
    options.onClose?.(event.code);
  });

  return {
    send: (message) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    close: () => {
      if (heartbeat !== null) window.clearInterval(heartbeat);
      socket.close(1000, "client closed");
    },
    readyState: () => socket.readyState,
  };
}
