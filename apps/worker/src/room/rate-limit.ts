/**
 * The per-socket frame budget (`signaling.md` § 5, `US-NET-004` § 5, `TC-ROOM-712`).
 *
 * Pure arithmetic over the counters the object keeps per socket: the object charges before it interprets a
 * frame, stores the window back and closes the socket itself, so nothing here touches a socket.
 */

/** `signaling.md` § 5: what one socket may send per second, per frame kind. */
export const BUDGETS = { ping: 10, signal: 20, chat: 2, control: 20 } as const;

export type Budget = keyof typeof BUDGETS;

/** One socket's counters for the current one-second window. */
export interface FrameWindow {
  readonly startedAt: number;
  ping: number;
  signal: number;
  chat: number;
  control: number;
}

export interface ChargeOutcome {
  /** The window after the charge; the object stores this on the socket's metadata either way. */
  readonly window: FrameWindow;
  /** `false` when the frame asked for a budget that was already spent. */
  readonly charged: boolean;
  /** The limit the refusal quotes, so the detail names the bucket the frame was charged to. */
  readonly limit: number;
}

/**
 * Lobby writes share the `control` bucket: each `loadout` persists the room and broadcasts it to every seat, so
 * an uncharged one is write amplification every member could open (`signaling.md` § Budgets, `US-NET-004` § 5).
 * The budget is deliberately far above a hand: one frame per tap means a fast player produces a few per second,
 * and crossing a budget here closes the socket with `4429`, which the client reads as fatal. Charge floods.
 */
function bucketOf(kind: string): Budget | null {
  if (kind === "ping" || kind === "signal" || kind === "chat") return kind;
  if (kind === "loadout" || kind === "room_settings" || kind === "team_assign") return "control";
  return null;
}

export function emptyWindow(startedAt: number): FrameWindow {
  return { startedAt, ping: 0, signal: 0, chat: 0, control: 0 };
}

/**
 * Charges one frame against the socket's budget. Returns the updated window and whether the frame may be
 * interpreted; a fresh window is handed back when the second rolled over.
 */
export function chargeFrame(previous: FrameWindow, kind: string, now: number): ChargeOutcome {
  const fresh = now - previous.startedAt >= 1_000;
  const window = fresh ? emptyWindow(now) : { ...previous };
  const bucket = bucketOf(kind);
  const limit = BUDGETS[bucket ?? "control"];
  if (bucket === null) return { window, charged: true, limit };
  if (window[bucket] >= limit) return { window, charged: false, limit };
  window[bucket] += 1;
  return { window, charged: true, limit };
}
