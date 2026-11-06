/**
 * Worker entry point (`docs/01-overview/architecture.md`).
 *
 * One Worker serves the API and hosts the `Room` class: that is a deliberate deviation from the
 * pack defaults (`conventions.md` § 1) because a room's socket and its roster must live in the same
 * isolate, and a second Worker would pay for a service binding on every message.
 */
import { decideCors, preflight, withCors } from "./lib/cors.js";
import type { Env } from "./lib/db.js";
import { purgeDeletedAccounts } from "./lib/deletion.js";
import { createLogger, newRequestId } from "./lib/logging.js";
import { isProblemError, ProblemError, problemResponse } from "./lib/problem.js";
import { match } from "./lib/router.js";
import { bearerOf, verifySession, type SessionToken } from "./lib/session.js";
import { createSession, deleteMe, getMe, patchMe } from "./routes/accounts.js";
import { health } from "./routes/health.js";
import { leaderboard } from "./routes/leaderboard.js";
import { myMatches, submitMatch } from "./routes/matches.js";
import { createRoom, joinRoomByCode, roomPreview, roomSocket, turnCredentials } from "./routes/rooms.js";

export { Room } from "./room-do.js";

const API_PREFIX = "/api/v1";

function originsOf(env: Env): readonly string[] {
  const configured = (env.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  // A development Worker serves the Vite dev server on whatever port it landed on. Loopback is allowed
  // only when ENVIRONMENT is development; production stays an explicit list (`NFR-11`).
  return env.ENVIRONMENT === "development" ? [...configured, "http://localhost:*", "http://127.0.0.1:*"] : configured;
}

async function optionalSession(request: Request, env: Env): Promise<SessionToken | null> {
  const token = bearerOf(request);
  if (!token) return null;
  try {
    return await verifySession(token, env.SESSION_TOKEN_SECRET);
  } catch {
    return null;
  }
}

async function requiredSession(request: Request, env: Env): Promise<SessionToken> {
  const token = bearerOf(request);
  if (!token) throw new ProblemError("unauthenticated", "Send an Authorization: Bearer <session token> header");
  return await verifySession(token, env.SESSION_TOKEN_SECRET);
}

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const requestId = request.headers.get("x-request-id") ?? newRequestId();
  const started = Date.now();
  const url = new URL(request.url);
  const cors = decideCors(request, originsOf(env));
  const logger = createLogger(requestId, (line) => console.info(line));
  // `US-OPS-001` §4 fixes the line's shape: `route` is the method plus the public path, and the SLO queries
  // filter on `route=~"/api/v1/.*"`, so a bare segment would silently empty a dashboard.
  const route = `${request.method} ${url.pathname}`;
  const path = rest_safe(url.pathname, API_PREFIX);
  const roomCode = /^\/rooms\/([A-Z0-9]{6})(?:\/|$)/.exec(path)?.[1];
  const cfRay = request.headers.get("cf-ray") ?? undefined;
  const context = {
    route,
    method: request.method,
    ...(cfRay === undefined ? {} : { cf_ray: cfRay }),
    ...(roomCode === undefined ? {} : { room_code: roomCode }),
  };
  /**
   * One line per completed request. `POST /rooms` creates the code inside the Durable Object, so the path
   * carries none; the SLO-3 denominator counts joins against `match_record.room_code`, which means the
   * created code has to be on the line — it is read back off the 201 body
   * (`docs/08-ops/slo.md` § SLO-3).
   */
  const finish = async (response: Response): Promise<Response> => {
    const created = roomCode === undefined ? await createdCode(response) : undefined;
    logger.line({
      ...context,
      ...(created === undefined ? {} : { room_code: created }),
      status: response.status,
      duration_ms: Date.now() - started,
    });
    return response;
  };

  if (request.method === "OPTIONS") return await finish(preflight(cors.origin));

  if (!cors.allowed) {
    const forbidden = problemResponse(new ProblemError("forbidden", "Origin is not allowed"), requestId, null);
    return await finish(forbidden);
  }

  let response: Response;
  try {
    response = await routeToHandler(request, env, url, requestId);
  } catch (error) {
    const problem = isProblemError(error) ? error : new ProblemError("internal", "Unhandled error");
    // The line carries the problem type; the body carries the detail. A stack trace never leaves the
    // Worker (`NFR-12`), so the message is logged here and only here.
    logger.line({
      ...context,
      level: problem.status >= 500 ? "error" : "info",
      status: problem.status,
      duration_ms: Date.now() - started,
      code: problem.type,
      ...(problem.limit === undefined ? {} : { limit: problem.limit }),
      ...(problem.type === "internal" && error instanceof Error
        ? {
            error: error.message,
            // A stack is a development aid only: production lines stay one JSON line with no paths (`NFR-12`).
            ...(env.ENVIRONMENT === "development" && error.stack ? { stack: error.stack.split("\n").slice(0, 6) } : {}),
          }
        : {}),
    });
    return problemResponse(problem, requestId, cors.origin, new URL(request.url).pathname);
  }

  // Every completed request gets exactly one line — including a 4xx a route returned without throwing.
  await finish(response);
  const enveloped = await withRequestId(response, requestId);
  return cors.origin ? withCors(enveloped, cors.origin) : enveloped;
}

/** The room code a 201 minted, if the body carries one — never throws, and never consumes the real body. */
async function createdCode(response: Response): Promise<string | undefined> {
  if (response.status !== 201 || response.webSocket || response.body === null) return undefined;
  try {
    const body = (await response.clone().json()) as { roomCode?: unknown };
    return typeof body.roomCode === "string" ? body.roomCode : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every success body carries `request_id` and the header that matches it, so a client can quote one id in a
 * bug report (`api/README.md`, `NFR-24`). A socket upgrade is passed through untouched: a 101 has no body.
 */
async function withRequestId(response: Response, requestId: string): Promise<Response> {
  if (response.status === 101 || response.webSocket) return response;
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  if (response.status === 204 || response.body === null) return new Response(null, { status: response.status, headers });
  const contentType = headers.get("content-type") ?? "";
  if (!contentType.startsWith("application/json")) return new Response(response.body, { status: response.status, headers });
  headers.set("content-type", "application/json; charset=utf-8");
  const body = (await response.json()) as unknown;
  const merged =
    body !== null && typeof body === "object" && !Array.isArray(body)
      ? { ...(body as Record<string, unknown>), request_id: requestId }
      : body;
  return new Response(JSON.stringify(merged), { status: response.status, headers });
}

/** The routing table. A miss is a problem response, never a silent 404. */
async function routeToHandler(request: Request, env: Env, url: URL, requestId: string): Promise<Response> {
  const path = url.pathname;
  if (!path.startsWith(API_PREFIX)) throw new ProblemError("bad-request", `Unknown route ${path}`);
  const rest = path.slice(API_PREFIX.length) || "/";

  if (rest === "/health" && request.method === "GET") {
    return health(env, requestId, request.headers.get("x-gbw-version") ?? env.VERSION ?? "dev");
  }
  if (rest === "/sessions" && request.method === "POST") return await createSession(request, env);
  if (rest === "/rooms" && request.method === "POST") {
    return await createRoom(request, env, await requiredSession(request, env), url.origin);
  }
  if (rest === "/turn-credentials" && request.method === "GET") {
    await requiredSession(request, env);
    return await turnCredentials(env);
  }
  const joinPath = match("/rooms/:code/join", rest, ["code"] as const);
  if (joinPath && request.method === "POST") {
    return await joinRoomByCode(request, env, await requiredSession(request, env), joinPath.params.code, url.origin);
  }
  const roomPath = match("/rooms/:code", rest, ["code"] as const);
  if (roomPath && request.method === "GET") return await roomPreview(env, roomPath.params.code);
  const socketPath = match("/rooms/:code/ws", rest, ["code"] as const);
  if (socketPath && request.method === "GET") return await roomSocket(env, socketPath.params.code, request);
  if (rest === "/me" && request.method === "GET") return await getMe(env, await requiredSession(request, env));
  if (rest === "/me" && request.method === "PATCH") return await patchMe(request, env, await requiredSession(request, env));
  if (rest === "/me" && request.method === "DELETE") return await deleteMe(env, await requiredSession(request, env));
  if (rest === "/me/matches" && request.method === "GET") {
    return await myMatches(request, env, await requiredSession(request, env));
  }
  if (rest === "/matches" && request.method === "POST") {
    return await submitMatch(request, env, await requiredSession(request, env));
  }
  if (rest === "/leaderboard" && request.method === "GET") {
    return await leaderboard(request, env, await optionalSession(request, env));
  }
  // A path that exists nowhere is a 404, not a 400: the request is well formed and the resource is not
  // there, and a client that retries a 400 is doing something different from one that gives up on a 404.
  throw new ProblemError("not-found", `Unknown route ${request.method} ${path}`);
}

function rest_safe(path: string, prefix: string): string {
  const trimmed = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  return trimmed === "" ? "/" : trimmed.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id");
}

export default {
  fetch: handleFetch,
  /**
   * The daily cron (`wrangler.jsonc` § triggers). One job for now: the 30-day purge of deleted accounts
   * (`US-AUTH-004` AC4). A failure is logged and rethrown so the Cron dashboard shows it, rather than a quiet morning
   * where the job did nothing and nobody noticed.
   */
  async scheduled(event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const logger = createLogger(newRequestId(), (line) => console.info(line));
    try {
      const { purged } = await purgeDeletedAccounts(env, new Date(event.scheduledTime));
      // The count is the only signal that the job did anything at all: zero rows is a normal morning.
      logger.line({ method: "CRON", route: `purge-deleted-accounts(${purged})`, status: 200, duration_ms: 0 });
    } catch (error) {
      logger.line({ level: "error", method: "CRON", route: "purge-deleted-accounts", status: 500, duration_ms: 0, error: String(error) });
      throw error;
    }
  },
};
