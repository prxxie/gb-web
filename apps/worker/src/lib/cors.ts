/**
 * CORS for the Pages origin (`docs/01-overview/deployment.md`).
 *
 * The web app is served from Pages and calls the Worker on a different host in preview, so the
 * allow-list comes from configuration instead of a wildcard — a wildcard would let any site drive a
 * signed-in user's session (`NFR-11`).
 */

export interface CorsDecision {
  readonly allowed: boolean;
  readonly origin: string | null;
}

export function decideCors(request: Request, allowedOrigins: readonly string[]): CorsDecision {
  const origin = request.headers.get("origin");
  if (!origin) return { allowed: true, origin: null };
  const normalised = origin.replace(/\/$/, "");
  const allowed = allowedOrigins.some((candidate) => candidate.replace(/\/$/, "") === normalised);
  return { allowed, origin: allowed ? normalised : null };
}

export function corsHeaders(origin: string | null, requestMethod: string): Record<string, string> {
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,idempotency-key,x-session-token",
    "access-control-max-age": "600",
    vary: "origin",
  };
  if (origin) headers["access-control-allow-origin"] = origin;
  if (requestMethod === "OPTIONS") headers["access-control-allow-headers"] += ",accept";
  return headers;
}

/** Preflight answers are always `204` and never touch auth or the database. */
export function preflight(origin: string | null): Response {
  return new Response(null, { status: 204, headers: corsHeaders(origin, "OPTIONS") });
}
