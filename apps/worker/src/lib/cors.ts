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
  const allowed = allowedOrigins.some((candidate) => {
    const pattern = candidate.replace(/\/$/, "");
    if (pattern.endsWith(":*")) return normalised.startsWith(`${pattern.slice(0, -2)}:`);
    return pattern === normalised;
  });
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

/** Copy a response so its headers carry the CORS decision; the body is reused, not re-read. */
export function withCors(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(origin, response.status === 204 ? "OPTIONS" : "GET"))) {
    headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
