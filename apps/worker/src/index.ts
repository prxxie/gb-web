/**
 * Worker entry point (`docs/01-overview/architecture.md`).
 *
 * One Worker serves the API and hosts the `Room` class: that is a deliberate deviation from the
 * pack defaults (`conventions.md` § 1) because a room's socket and its roster must live in the same
 * isolate, and a second Worker would pay for a service binding on every message.
 */
import { decideCors, preflight, withCors } from "./lib/cors.js";
import type { Env } from "./lib/db.js";
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
  const route = () => rest_safe(url.pathname, API_PREFIX);

  if (request.method === "OPTIONS") return preflight(cors.origin);

  let response: Response;
  if (!cors.allowed) {
    response = problemResponse(new ProblemError("forbidden", "Origin is not allowed"), requestId, null);
  } else {
    try {
      response = await routeToHandler(request, env, url, requestId);
    } catch (error) {
      const problem = isProblemError(error) ? error : new ProblemError("internal", "Unhandled error");
      // The line carries the problem type; the body carries the detail. A stack trace never leaves the
      // Worker (`NFR-12`), so the message is logged here and only here.
      logger.line({
        route: route(),
        method: request.method,
        status: problem.status,
        duration_ms: Date.now() - started,
        code: problem.type,
        ...(problem.type === "internal" && error instanceof Error
          ? {
              error: error.message,
              // A stack is a development aid only: production lines stay one JSON line with no paths (`NFR-12`).
              ...(env.ENVIRONMENT === "development" && error.stack ? { stack: error.stack.split("\n").slice(0, 6) } : {}),
            }
          : {}),
      });
      response = problemResponse(problem, requestId, cors.origin);
    }
  }

  if (response.status >= 400) return response;
  logger.line({ route: route(), method: request.method, status: response.status, duration_ms: Date.now() - started });
  return cors.origin ? withCors(response, cors.origin) : response;
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
  throw new ProblemError("bad-request", `Unknown route ${request.method} ${path}`);
}

function rest_safe(path: string, prefix: string): string {
  const trimmed = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  return trimmed === "" ? "/" : trimmed.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id");
}

export default {
  fetch: handleFetch,
};
