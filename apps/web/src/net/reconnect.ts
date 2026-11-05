/**
 * Automatic reconnect inside the grace window (`US-ROOM-004` AC7, `docs/01-overview/workflow-state-machine.md`).
 *
 * A socket that dies for a reason the server deliberately chose — unauthenticated, unknown room, full room,
 * closed room, rate limited — must not be reopened: the same answer would arrive. Everything else (a train
 * tunnel, a phone that locked, a laptop that slept) is retried with a backoff that stays inside the room's
 * grace window, because the room forgets a member after it.
 */
import { TUNABLES } from "@gbw/core";
import { connectRoom, type ConnectOptions, type RoomSocket } from "./signaling";

/** Close codes the server means: retrying them would only repeat the answer. */
const FATAL_CODES = new Set([4401, 4404, 4409, 4410, 4429]);

/** First retry waits this long; each further attempt doubles up to `MAX_DELAY_MS`. */
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 5_000;

/** The room drops a silent member after this long, so a retry past it is pointless. */
const WINDOW_MS = TUNABLES.roomGraceMs;

export interface ReconnectOptions extends Omit<ConnectOptions, "onClose"> {
  /** The network went away and a retry is scheduled. */
  readonly onReconnecting?: (attempt: number) => void;
  /** The socket is open and authenticated again. */
  readonly onReconnected?: () => void;
  /** No more attempts will be made: a fatal code, or the grace window ran out. */
  readonly onFatal?: (code: number) => void;
}

export interface ReconnectingSocket extends RoomSocket {
  /** Stop retrying and close the live socket (component unmount, or the player leaving on purpose). */
  readonly stop: () => void;
}

/**
 * Opens a room socket and keeps it open through transient failures.
 *
 * The returned object has the same surface as `connectRoom`, except `close()` also stops the retry loop, so
 * an unmounting component cannot resurrect itself.
 */
export function connectWithReconnect(options: ReconnectOptions): ReconnectingSocket {
  let socket: RoomSocket | null = null;
  let attempts = 0;
  let closedAt: number | null = null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const open = (): void => {
    socket = connectRoom({
      ...options,
      onClose: (code) => {
        socket = null;
        if (stopped) return;
        if (FATAL_CODES.has(code)) {
          stopped = true;
          clear();
          options.onFatal?.(code);
          return;
        }
        const now = Date.now();
        closedAt ??= now;
        if (now - closedAt >= WINDOW_MS) {
          // The room has already decided this member is gone; a late socket would arrive as a stranger.
          stopped = true;
          clear();
          options.onFatal?.(code);
          return;
        }
        attempts += 1;
        options.onReconnecting?.(attempts);
        clear();
        timer = setTimeout(
          () => {
            timer = null;
            if (!stopped) open();
          },
          Math.min(BASE_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS),
        );
      },
      onOpen: () => {
        options.onOpen?.();
        if (attempts > 0) {
          attempts = 0;
          closedAt = null;
          options.onReconnected?.();
        }
      },
    });
  };

  open();

  return {
    send: (message) => socket?.send(message),
    close: () => {
      stopped = true;
      clear();
      socket?.close();
      socket = null;
    },
    stop: () => {
      stopped = true;
      clear();
    },
    readyState: () => socket?.readyState() ?? WebSocket.CLOSED,
  };
}
