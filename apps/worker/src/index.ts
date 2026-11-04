/**
 * Worker entry point (`docs/01-overview/architecture.md`).
 *
 * One Worker serves the API and hosts the `Room` class: that is a deliberate deviation from the
 * pack defaults (`conventions.md` § 1) because a room's socket and its roster must live in the same
 * isolate, and a second Worker would pay for a service binding on every message.
 */
import { decideCors, preflight } from "./lib/cors.js";
import type { Env } from "./lib/db.js";
import { createLogger, newRequestId } from "./lib/logging.js";
import { isProblemError, ProblemError, problemResponse } from "./lib/problem.js";
import { bearerOf, verifySession, type SessionToken } from "./lib/session.js";
import { createSession, deleteMe, getMe, patchMe } from "./routes/accounts.js";
import { health } from "./routes/health.js";
import { leaderboard } from "./routes/leaderboard.js";
import { myMatches, submitMatch } from "./routes/matches.js";
import { createRoom, roomPreview, roomSocket, turnCredentials } from "./routes/rooms.js";

export { Room } from "./room-do.js";

const API_PREFIX = "/api/v1";

function originsOf(env: Env): readonly string[] {
  return (env.ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
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

function route(path: string): readonly (string | ":param")[] {
  return path
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => (segment.startsWith(":") ? (":param" as const) : segment));
}

function matched(pattern: readonly (string | ":param")[], pathname: string): Record<string, string> | null {
  const segments = pathname.split("/").filter((segment) => segment !== "");
  if (segments.length !== pattern.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < pattern.length; index += 1) {
    const expected = pattern[index]!;
    const actual = segments[index]!;
    if (expected === ":param") {
      params[`p${index}`] = decodeURIComponent(actual);
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
}

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const requestId = request.headers.get("x-request-id") ?? newRequestId();
  const started = Date.now();
  const url = new URL(request.url);
  const cors = decideCors(request, originsOf(env));
  const logger = createLogger(requestId, (line) => console.info(line));

  if (request.method === "OPTIONS") return preflight(cors.origin);
  if (!cors.allowed) {
    return problemResponse(new ProblemError("forbidden", "Origin is not allowed"), requestId, null);
  }

  const path = url.pathname;
  try {
    if (!path.startsWith(API_PREFIX)) {
      throw new ProblemError("bad-request", `Unknown route ${path}`);
    }
    const rest = path.slice(API_PREFIX.length) || "/";

    if (rest === "/health" && request.method === "GET") {
      return health(env, requestId, request.headers.get("x-gbw-version") ?? env.VERSION ?? "dev");
    }
    if (rest === "/sessions" && request.method === "POST") {
      return await createSession(request, env);
    }
    if (rest === "/rooms" && request.method === "POST") {
      const session = await requiredSession(request, env);
      return await createRoom(request, env, session, url.origin);
    }
    if (rest === "/turn-credentials" && request.method === "GET") {
      await requiredSession(request, env);
      return await turnCredentials(env);
    }
    const roomPath = matched(route("/rooms/:code"), rest);
    if (roomPath && request.method === "GET") {
      return await roomPreview(env, roomPath.p0!);
    }
    const socketPath = matched(route("/rooms/:code/ws"), rest);
    if (socketPath && request.method === "GET") {
      await requiredSession(request, env);
      return await roomSocket(env, socketPath.p0!, request);
    }
    if (rest === "/me" && request.method === "GET") {
      return await getMe(env, await requiredSession(request, env));
    }
    if (rest === "/me" && request.method === "PATCH") {
      return await patchMe(request, env, await requiredSession(request, env));
    }
    if (rest === "/me" && request.method === "DELETE") {
      return await deleteMe(env, await requiredSession(request, env));
    }
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
  } catch (error) {
    const problem = isProblemError(error) ? error : new ProblemError("internal", "Unhandled error");
    logger.line({
      route: rest_safe(path, API_PREFIX),
      method: request.method,
      status: problem.status,
      duration_ms: Date.now() - started,
      code: problem.type,
      ...(problem.type === "internal" && error instanceof Error ? { error: error.message } : {}),
    });
    return problemResponse(problem, requestId, cors.origin);
  } finally {
    logger.line({
      route: rest_safe(path, API_PREFIX),
      method: request.method,
      status: 0,
      duration_ms: Date.now() - started,
    });
  }
}

function rest_safe(path: string, prefix: string): string {
  const trimmed = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  return trimmed === "" ? "/" : trimmed.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id");
}

export default {
  fetch: handleFetch,
};
