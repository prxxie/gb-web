/**
 * Typed API client (`docs/02-reference/api/README.md`).
 *
 * Every failure becomes an `ApiError` carrying the server's RFC 9457 `type`, so a screen can show the
 * dictionary string for that type instead of guessing from a status code (`conventions.md#6`).
 */

export type ProblemType =
  | "validation"
  | "bad-request"
  | "unauthenticated"
  | "forbidden"
  | "room-not-found"
  | "room-full"
  | "room-closed"
  | "not-host"
  | "display-name-taken"
  | "match-already-recorded"
  | "rate-limited"
  | "unsupported-message"
  | "snapshot-too-large"
  | "internal"
  /** A `type` suffix this client does not know: the screen shows `errors.generic` plus the server title. */
  | "unknown"
  | "network";

export interface ProblemBody {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly request_id?: string;
  readonly errors?: readonly { field: string; detail: string }[];
}

export class ApiError extends Error {
  readonly type: ProblemType;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly fields: readonly { field: string; detail: string }[];
  /** The server's `title`, kept for a type the client has no string for (`US-PWA-002` AC6). */
  readonly title: string;

  constructor(
    type: ProblemType,
    status: number,
    message: string,
    requestId?: string,
    fields: readonly { field: string; detail: string }[] = [],
    title = "",
  ) {
    super(message);
    this.name = "ApiError";
    this.type = type;
    this.status = status;
    this.requestId = requestId;
    this.fields = fields;
    this.title = title;
  }

  /** The dictionary key a screen should render (`errors.<type>`); an unknown type falls back to `errors.generic`. */
  get messageKey(): string {
    return this.type === "unknown" ? "errors.generic" : `errors.${this.type}`;
  }

  /** A second line for the screen: the server's own wording, shown only when the type is unknown. */
  get subtitle(): string | null {
    return this.type === "unknown" && this.title.length > 0 ? this.title : null;
  }
}

/**
 * The one line a screen shows when a call fails (`US-FND-003` AC4, `US-PWA-002` AC6): the translated message, the
 * server's own `title` when the client has no entry for that type, and the `request_id` so support can find the log
 * line — never the body and never a stack.
 */
export function errorMessage(caught: unknown, t: (key: string, values?: Record<string, string | number>) => string): string {
  if (!(caught instanceof ApiError)) return t("common.retry");
  const message = caught.subtitle ? `${t(caught.messageKey)} ${caught.subtitle}` : t(caught.messageKey);
  return caught.requestId ? `${message} · ${t("errors.reference", { id: caught.requestId })}` : message;
}

const BASE = (import.meta.env.VITE_API_BASE ?? "/api/v1").replace(/\/$/, "");

function typeFromBody(body: Partial<ProblemBody>, status: number): ProblemType {
  const raw = body.type ?? "";
  const known: readonly string[] = [
    "validation",
    "bad-request",
    "unauthenticated",
    "forbidden",
    "room-not-found",
    "room-full",
    "room-closed",
    "not-host",
    "display-name-taken",
    "match-already-recorded",
    "rate-limited",
    "unsupported-message",
    "snapshot-too-large",
    "internal",
  ];
  if (raw.length > 0) {
    const suffix = raw.includes("/") ? raw.slice(raw.lastIndexOf("/") + 1) : raw;
    return known.includes(suffix) ? (suffix as ProblemType) : "unknown";
  }
  // No problem document at all — a proxy or a crash. The status is the only signal left.
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "room-not-found";
  if (status === 429) return "rate-limited";
  return "internal";
}

export interface RequestOptions {
  readonly method?: "GET" | "POST" | "PATCH" | "DELETE";
  readonly body?: unknown;
  readonly token?: string | null | undefined;
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("network", 0, "Network request failed");
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const parsed = text.length > 0 ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const problem = (parsed ?? {}) as Partial<ProblemBody>;
    throw new ApiError(
      typeFromBody(problem, response.status),
      response.status,
      problem.detail ?? problem.title ?? `Request failed with ${response.status}`,
      problem.request_id ?? response.headers.get("x-request-id") ?? undefined,
      problem.errors ?? [],
      problem.title ?? "",
    );
  }
  return parsed as T;
}

export interface SessionResponse {
  readonly sessionToken: string;
  readonly expiresAt: string;
  readonly subject: {
    readonly kind: "guest" | "account";
    readonly guestId?: string;
    readonly accountId?: string;
    readonly displayName: string;
    readonly avatarId?: string;
    readonly rating?: number;
    readonly ratedMatches?: number;
  };
}

export interface ProfileResponse {
  readonly accountId: string;
  readonly displayName: string;
  readonly avatarId: string;
  readonly rating: number;
  readonly ratedMatches: number;
  /** `GET /me` aggregates over `match_player`, not the individual match rows (`api/accounts.md`). */
  readonly stats: {
    readonly matches: number;
    readonly wins: number;
    readonly losses: number;
    readonly abandons: number;
  };
  readonly createdAt: string;
  readonly deletionScheduledFor: string | null;
}

/** `screens/leaderboard.md` § Fields: no account id and no rating history travel on the public list. */
export interface LeaderboardEntry {
  readonly rank: number;
  readonly displayName: string;
  readonly avatarId: string;
  readonly rating: number;
  readonly ratedMatches: number;
}

export interface LeaderboardResponse {
  readonly items: readonly LeaderboardEntry[];
  readonly next_cursor: string | null;
  readonly has_more: boolean;
  readonly you: { readonly rank: number; readonly rating: number } | null;
}

export interface RoomResponse {
  readonly roomCode: string;
  readonly playerId: string;
  readonly wsUrl: string;
  readonly maxPlayers?: number;
  readonly settings?: { readonly maxPlayers: number; readonly mode: string; readonly mapId: string };
}

export interface PublicRoomSummary {
  readonly roomCode: string;
  readonly status: "waiting" | "playing";
  readonly mode: "solo" | "score" | "tag" | "jewel";
  readonly mapId: string;
  readonly seated: number;
  readonly maxPlayers: number;
  readonly joinable: boolean;
  readonly updatedAt: string;
}

export interface PublicRoomPage {
  readonly rooms: readonly PublicRoomSummary[];
  readonly nextCursor: string | null;
  readonly request_id: string;
}

export type RoomDirectoryFilter = "waiting" | "playing" | undefined;

export interface TurnCredentials {
  readonly iceServers: readonly { urls: string | readonly string[]; username?: string; credential?: string }[];
  readonly ttlSeconds: number;
  readonly turn: boolean;
}

/**
 * One row of `GET /me/matches` (`docs/02-reference/api/matches.md`). The shape here is the wire's, field for field:
 * an earlier version of this interface named `endedAt`, `opponentTeam`, `ratingBefore` and `ratingAfter`, none of
 * which the server sends, so every history row rendered `Invalid Date` (`US-RANK-003` AC3).
 */
export interface HistoryItem {
  readonly matchId: string;
  readonly playedAt: string;
  readonly team: "A" | "B";
  readonly result: "win" | "loss" | "abandon";
  /** Total seats in the match, so the row can print `2v2`. */
  readonly playerCount: number;
  /** The other seats, by display name only — never an account id or a rating (`US-RANK-003` AC5). */
  readonly opponents: readonly { readonly displayName: string; readonly team: string }[];
  readonly damageDealt: number;
  readonly shotsFired: number;
  readonly hits: number;
  /** `null` for an unranked match, which then shows `—` and the reason (`AC4`). */
  readonly ratingDelta: number | null;
  readonly ranked: boolean;
  readonly rankedReason: "guest" | "bot" | "abandoned" | "ruleset_mismatch" | null;
  readonly rulesetVersion: string;
}

export interface HistoryResponse {
  readonly items: readonly HistoryItem[];
  readonly next_cursor: string | null;
  readonly has_more: boolean;
}

export const api = {
  createGuestSession: (displayName?: string) =>
    request<SessionResponse>("/sessions", { method: "POST", body: { kind: "guest", displayName } }),
  createAccountSession: (clerkToken: string) =>
    request<SessionResponse>("/sessions", { method: "POST", body: { kind: "account" }, token: clerkToken }),
  me: (token: string) => request<ProfileResponse>("/me", { token }),
  patchMe: (token: string, body: { displayName?: string; avatarId?: string }) =>
    request<ProfileResponse>("/me", { method: "PATCH", body, token }),
  deleteMe: (token: string) => request<{ deletionScheduledFor: string }>("/me", { method: "DELETE", token }),
  history: (token: string, cursor?: string | null) =>
    request<HistoryResponse>(`/me/matches${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { token }),
  leaderboard: (cursor?: string | null, token?: string | null) =>
    request<LeaderboardResponse>(`/leaderboard${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { token }),
  createRoom: (
    token: string,
    body: {
      displayName: string;
      mobileId: string;
      avatarId: string;
      maxPlayers: number;
      mode: string;
      mapId: string;
      isPrivate: boolean;
    },
  ) => request<RoomResponse>("/rooms", { method: "POST", body, token }),
  listRooms: (options: {
    readonly status?: RoomDirectoryFilter;
    readonly cursor?: string | null;
    readonly signal?: AbortSignal;
  } = {}) => {
    const query = new URLSearchParams();
    if (options.status) query.set("status", options.status);
    if (options.cursor) query.set("cursor", options.cursor);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return request<PublicRoomPage>(`/rooms${suffix}`, options.signal ? { signal: options.signal } : {});
  },
  joinRoom: (
    token: string,
    roomCode: string,
    body: { displayName: string; mobileId: string; avatarId: string },
  ) => request<RoomResponse>(`/rooms/${roomCode}/join`, { method: "POST", body, token }),
  roomPreview: (roomCode: string) => request<{ roomCode: string; status: string; joined: number }>(`/rooms/${roomCode}`),
  turnCredentials: (token: string) => request<TurnCredentials>("/turn-credentials", { token }),
  submitMatch: (token: string, body: unknown, idempotencyKey: string) =>
    request<{
      matchId: string;
      ranked: boolean;
      rankedReason: "guest" | "bot" | "abandoned" | "ruleset_mismatch" | null;
      /** The deltas every participant sees; empty for an unranked match (`US-RANK-005` AC1). */
      ratings: readonly { accountId: string; before: number; after: number; delta: number }[];
    }>("/matches", {
      method: "POST",
      body,
      token,
      idempotencyKey,
    }),
};
