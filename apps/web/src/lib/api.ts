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

  constructor(type: ProblemType, status: number, message: string, requestId?: string, fields: readonly { field: string; detail: string }[] = []) {
    super(message);
    this.name = "ApiError";
    this.type = type;
    this.status = status;
    this.requestId = requestId;
    this.fields = fields;
  }

  /** The dictionary key a screen should render (`errors.<type>`). */
  get messageKey(): string {
    return `errors.${this.type}`;
  }
}

const BASE = (import.meta.env.VITE_API_BASE ?? "/api/v1").replace(/\/$/, "");

function typeFromBody(body: Partial<ProblemBody>, status: number): ProblemType {
  const raw = body.type ?? "";
  const suffix = raw.includes("/") ? raw.slice(raw.lastIndexOf("/") + 1) : raw;
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
  if (known.includes(suffix)) return suffix as ProblemType;
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
  readonly updatedAt: string;
  readonly stats: { readonly matches: number; readonly wins: number; readonly bestDamage: number };
}

export interface LeaderboardEntry {
  readonly rank: number;
  readonly accountId: string;
  readonly displayName: string;
  readonly avatarId: string;
  readonly rating: number;
  readonly ratedMatches: number;
  readonly isNew: boolean;
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
}

export interface TurnCredentials {
  readonly iceServers: readonly { urls: string | readonly string[]; username?: string; credential?: string }[];
  readonly ttlSeconds: number;
  readonly turn: boolean;
}

export interface HistoryItem {
  readonly matchId: string;
  readonly roomCode: string;
  readonly result: "win" | "loss" | "abandon";
  readonly ranked: boolean;
  readonly opponentTeam: string | null;
  readonly damageDealt: number;
  readonly shotsFired: number;
  readonly hits: number;
  readonly ratingBefore: number | null;
  readonly ratingAfter: number | null;
  readonly endedAt: string;
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
    body: { displayName: string; mobileId: string; avatarId: string; maxPlayers: number; mode: string; mapId: string },
  ) => request<RoomResponse>("/rooms", { method: "POST", body, token }),
  roomPreview: (roomCode: string) => request<{ roomCode: string; status: string; joined: number }>(`/rooms/${roomCode}`),
  turnCredentials: (token: string) => request<TurnCredentials>("/turn-credentials", { token }),
  submitMatch: (token: string, body: unknown, idempotencyKey: string) =>
    request<{ matchId: string; ranked: boolean; rankedReason: string | null }>("/matches", {
      method: "POST",
      body,
      token,
      idempotencyKey,
    }),
};
