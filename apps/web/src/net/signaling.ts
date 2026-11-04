/**
 * Room socket (`US-ROOM-002`, `US-ROOM-005`, `docs/02-reference/api/signaling.md` § 1).
 *
 * The token travels in the first message, never in the URL — a URL ends up in logs and in the
 * Referer header (`NFR-09`).
 */
import type { RoomState, Snapshot } from "@gbw/core";

export type ClientMessage =
  | { readonly t: "auth"; readonly token: string; readonly displayName?: string; readonly mobileId?: string; readonly avatarId?: string }
  | { readonly t: "signal"; readonly to: string; readonly kind: "offer" | "answer" | "candidate"; readonly payload: unknown }
  | { readonly t: "team_assign"; readonly playerId: string; readonly team: "A" | "B" | null }
  | { readonly t: "room_settings"; readonly settings: { readonly maxPlayers: number; readonly mode: string; readonly mapId: string } }
  | { readonly t: "start_match" }
  | { readonly t: "snapshot_push"; readonly snapshot: Snapshot }
  | { readonly t: "match_end"; readonly winnerTeam: "A" | "B" | null; readonly abandoned: boolean }
  | { readonly t: "leave" }
  | { readonly t: "ping" };

export type ServerMessage =
  | {
      readonly t: "room_state";
      readonly room: RoomState;
      readonly you?: { readonly playerId: string; readonly slot: number };
      readonly lastSnapshot?: Snapshot | null;
    }
  | { readonly t: "peer_joined"; readonly playerId: string; readonly slot: number; readonly room: RoomState }
  | { readonly t: "peer_left"; readonly playerId: string }
  | { readonly t: "signal"; readonly from: string; readonly kind: "offer" | "answer" | "candidate"; readonly payload: unknown }
  | { readonly t: "host_changed"; readonly hostPlayerId: string; readonly hostGeneration: number; readonly lastSnapshot: Snapshot | null }
  | {
      readonly t: "match_started";
      readonly startedAt: number;
      readonly seed: number;
      readonly hostPlayerId: string | null;
      readonly hostGeneration: number;
      readonly rulesetVersion: string;
      readonly assignments: readonly {
        readonly playerId: string;
        readonly slot: number;
        readonly team: "A" | "B" | null;
        readonly mobileId?: string;
        readonly accountId: string | null;
      }[];
      readonly room: RoomState;
    }
  | { readonly t: "snapshot_state"; readonly snapshot: Snapshot }
  | { readonly t: "pong" }
  | { readonly t: "error"; readonly code: string; readonly detail: string };

export interface ConnectOptions {
  readonly wsUrl: string;
  readonly token: string;
  readonly displayName: string;
  readonly mobileId: string;
  readonly avatarId?: string;
  readonly onMessage: (message: ServerMessage) => void;
  readonly onClose?: (code: number) => void;
  readonly onOpen?: () => void;
}

export interface RoomSocket {
  send(message: ClientMessage): void;
  close(): void;
  readonly readyState: () => number;
}

const HEARTBEAT_MS = 15_000;

/** Open the room socket and authenticate. Returns as soon as the socket exists, not when it opens. */
export function connectRoom(options: ConnectOptions): RoomSocket {
  const socket = new WebSocket(options.wsUrl);
  let heartbeat: number | null = null;

  socket.addEventListener("open", () => {
    const auth: ClientMessage = {
      t: "auth",
      token: options.token,
      displayName: options.displayName,
      mobileId: options.mobileId,
      ...(options.avatarId ? { avatarId: options.avatarId } : {}),
    };
    socket.send(JSON.stringify(auth));
    heartbeat = window.setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ t: "ping" } satisfies ClientMessage));
    }, HEARTBEAT_MS);
    options.onOpen?.();
  });

  socket.addEventListener("message", (event) => {
    try {
      const parsed = JSON.parse(String(event.data)) as ServerMessage;
      options.onMessage(parsed);
    } catch {
      // A malformed frame is ignored; the server never sends one, and a bad local frame is not fatal.
    }
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
