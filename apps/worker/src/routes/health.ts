import type { Env } from "../lib/db.js";

/**
 * `GET /api/v1/health` (`US-FND-002`).
 *
 * Cheap and dependency-free on purpose: the runbook's first step is "hit health", and the endpoint
 * doubles as the deploy gate — a Worker that cannot answer this is not ready to receive traffic.
 */
export function health(env: Env, requestId: string, version: string): Response {
  return Response.json(
    {
      status: "ok",
      version,
      environment: env.ENVIRONMENT,
      ruleset: "2026-11-05",
      request_id: requestId,
    },
    { headers: { "cache-control": "no-store", "x-request-id": requestId } },
  );
}
