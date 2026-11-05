/**
 * `US-FND-002` AC6 / `TC-FND-070` — the published OpenAPI file is the contract the client and the worker are tested
 * against, so it must describe every route the worker actually serves, and every operation must be able to answer
 * with the RFC 9457 problem body. Linting with `@redocly/cli` needs the network and a transitive dependency; this
 * reads the file as text so CI can enforce the same invariants on every push.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const spec = readFileSync(join(ROOT, "docs", "02-reference", "api", "openapi.yaml"), "utf8");

/** `{ "/health": "…block…" }` — every `paths` entry, from its key to the next one at the same indent. */
function pathBlocks(text: string): Map<string, string> {
  const lines = text.split("\n");
  const blocks = new Map<string, string>();
  let current: string | null = null;
  let buffer: string[] = [];
  for (const line of lines) {
    const key = /^ {2}(\/[^:]*):\s*$/.exec(line);
    if (key) {
      if (current !== null) blocks.set(current, buffer.join("\n"));
      current = key[1] ?? "";
      buffer = [];
      continue;
    }
    if (current !== null) {
      // A top-level key (`components:`) ends the last path.
      if (/^[A-Za-z]/.test(line)) {
        blocks.set(current, buffer.join("\n"));
        current = null;
        buffer = [];
        continue;
      }
      buffer.push(line);
    }
  }
  if (current !== null) blocks.set(current, buffer.join("\n"));
  return blocks;
}

const blocks = pathBlocks(spec);

describe("openapi.yaml", () => {
  it("TC-FND-070: declares the contract version and every route the worker serves", () => {
    expect(spec).toMatch(/^openapi: 3\.1\./m);
    for (const path of [
      "/health",
      "/sessions",
      "/me",
      "/me/matches",
      "/matches",
      "/leaderboard",
      "/turn-credentials",
      "/rooms",
      "/rooms/{code}",
      "/rooms/{code}/join",
      "/rooms/{code}/ws",
    ]) {
      expect([...blocks.keys()], `openapi.yaml has no ${path}`).toContain(path);
    }
  });

  it("TC-FND-070: every operation can answer with the problem body", () => {
    // The websocket upgrade is the one operation that cannot: it either upgrades or fails before a body.
    const exempt = new Set(["/rooms/{code}/ws"]);

    for (const [path, block] of blocks) {
      if (exempt.has(path)) continue;
      expect(block, `${path} has no application/problem+json response`).toContain("application/problem+json");
    }
  });
});
