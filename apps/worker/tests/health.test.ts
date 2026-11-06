/**
 * `GET /health` — docs/01-overview/environment-setup.md (deployment probes), TC-FND-001.
 *
 * The probe is how a deploy proves the Worker is alive and which build it runs, so its body fields and
 * its no-store caching are part of the contract, not cosmetic.
 */
import { describe, expect, it } from "vitest";

import { handleFetch } from "../src/index";
import { captureLog, testEnv } from "./support/fake-worker";

const health = (env: unknown, url = "https://api.test/api/v1/health", method = "GET"): Promise<Response> =>
  handleFetch(new Request(url, { method }), env as never);

describe("GET /health", () => {
  it("TC-FND-001 : answers 200 with the documented probe fields", async () => {
    const { env } = testEnv();

    const response = await health(env);

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["status"]).toBe("ok");
    expect(typeof body["version"]).toBe("string");
    expect(body["environment"]).toBe("test");
    expect(typeof body["ruleset"]).toBe("string");
    expect(typeof body["request_id"]).toBe("string");
  });

  it("serves the probe before any auth, session or database work", async () => {
    const { env, db } = testEnv();

    const response = await health(env);

    expect(response.status).toBe(200);
    expect(db.statements).toEqual([]);
  });

  it("reports the version the deployment supplies", async () => {
    const { env } = testEnv({ overrides: { VERSION: "1.4.2" } });

    const body = (await (await health(env)).json()) as Record<string, unknown>;

    expect(body["version"]).toBe("1.4.2");
  });

  it("forbids caching and echoes the request id as a header", async () => {
    const { env } = testEnv();

    const response = await health(env);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-request-id")).toBe(body["request_id"]);
  });

  it("logs exactly one structured line for the probe", async () => {
    const { env } = testEnv();
    const log = captureLog();
    try {
      await health(env);
    } finally {
      log.restore();
    }

    expect(log.lines).toHaveLength(1);
    const record = JSON.parse(log.lines[0] ?? "{}") as Record<string, unknown>;
    expect(record["status"]).toBe(200);
  });

  it("answers an unknown route with 404 rather than the probe body", async () => {
    const { env } = testEnv();

    const response = await health(env, "https://api.test/api/v1/readyz");

    // A path that exists nowhere is a missing resource, not a malformed request (`FND-002` AC5).
    expect(response.status).toBe(404);
    const problem = (await response.json()) as Record<string, unknown>;
    expect(problem["type"]).toContain("not-found");
    expect(problem["instance"]).toBe("/api/v1/readyz");
    expect(typeof problem["request_id"]).toBe("string");
  });
});
