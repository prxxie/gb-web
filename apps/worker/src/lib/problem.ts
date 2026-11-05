/**
 * RFC 9457 problems (`docs/01-overview/conventions.md#6-errors`).
 *
 * Every failure leaves the API as a `ProblemError`; the router turns it into a response with the
 * `application/problem+json` media type and the request id, so a client error is never a stack trace
 * and a support request can be traced to one log line (`NFR-12`, `NFR-24`).
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
  | "invalid-state"
  | "display-name-taken"
  | "match-already-recorded"
  | "rate-limited"
  | "unsupported-message"
  | "snapshot-too-large"
  | "internal";

const TITLES: Record<ProblemType, string> = {
  validation: "Request failed validation",
  "bad-request": "Malformed request",
  unauthenticated: "Not signed in",
  forbidden: "Not allowed",
  "room-not-found": "Room not found",
  "room-full": "Room is full",
  "room-closed": "Room is closed",
  "not-host": "Only the host can do that",
  "invalid-state": "Not in a state that allows this",
  "display-name-taken": "That display name is taken",
  "match-already-recorded": "This match is already recorded",
  "rate-limited": "Too many requests",
  "unsupported-message": "Unsupported message",
  "snapshot-too-large": "Snapshot too large",
  internal: "Internal error",
};

const STATUSES: Record<ProblemType, number> = {
  validation: 422,
  "bad-request": 400,
  unauthenticated: 401,
  forbidden: 403,
  "room-not-found": 404,
  "room-full": 409,
  "room-closed": 410,
  "not-host": 403,
  "invalid-state": 409,
  "display-name-taken": 409,
  "match-already-recorded": 409,
  "rate-limited": 429,
  "unsupported-message": 422,
  "snapshot-too-large": 413,
  internal: 500,
};

export interface FieldError {
  readonly field: string;
  readonly detail: string;
}

export class ProblemError extends Error {
  readonly type: ProblemType;
  readonly status: number;
  readonly detail: string | undefined;
  readonly fields: readonly FieldError[];
  /** Seconds a client should wait before retrying — set on a 429, so `Retry-After` is never missing. */
  readonly retryAfterSeconds: number | undefined;
  /** The rule that refused, e.g. `ip_rooms` — the log line names it so an alert can group by rule. */
  readonly limit: string | undefined;

  constructor(
    type: ProblemType,
    detail?: string,
    fields: readonly FieldError[] = [],
    retryAfterSeconds?: number,
    limit?: string,
  ) {
    super(detail ?? TITLES[type]);
    this.name = "ProblemError";
    this.type = type;
    this.status = STATUSES[type];
    this.detail = detail;
    this.fields = fields;
    this.retryAfterSeconds = retryAfterSeconds;
    this.limit = limit;
  }
}

export function isProblemError(value: unknown): value is ProblemError {
  return value instanceof ProblemError;
}

export interface ProblemBody {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly request_id: string;
  readonly errors?: readonly FieldError[];
  readonly retryAfterSeconds?: number;
}

/** The `type` is a stable, documented URI — clients switch on it, never on the message (`conventions.md`). */
export function problemBody(error: ProblemError, requestId: string): ProblemBody {
  const body: ProblemBody = {
    type: `https://gbw.example/problems/${error.type}`,
    title: TITLES[error.type],
    status: error.status,
    request_id: requestId,
  };
  const withDetail = error.detail === undefined ? body : { ...body, detail: error.detail };
  const withRetry =
    error.retryAfterSeconds === undefined ? withDetail : { ...withDetail, retryAfterSeconds: error.retryAfterSeconds };
  return error.fields.length === 0 ? withRetry : { ...withRetry, errors: error.fields };
}

export function problemResponse(error: ProblemError, requestId: string, origin: string | null): Response {
  return new Response(JSON.stringify(problemBody(error, requestId)), {
    status: error.status,
    headers: {
      "content-type": "application/problem+json",
      "x-request-id": requestId,
      ...(error.retryAfterSeconds === undefined ? {} : { "retry-after": String(error.retryAfterSeconds) }),
      ...(origin ? { "access-control-allow-origin": origin } : {}),
    },
  });
}
