/**
 * `TC-MATCH-190` / `TC-ROOM-700` — the two size rules the split stories promise (`US-MATCH-008`, `US-ROOM-008`).
 *
 * Both stories were written to be closed by a refactor, and both cite this file as the thing that keeps them closed. It did
 * not exist, so the rule lived only in prose: the match page grew back to 1 108 lines and the room object to 1 198 with
 * nothing to stop them. A refactor that nothing measures is a refactor that lasts until the next feature.
 *
 * The limits are the stories' own numbers, not new ones: the match page and the room object are ≤ 400 lines, no route file
 * is over 500, and the collaborators the stories name exist under `apps/worker/src/room/`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const ROUTES = join(ROOT, "apps", "web", "src", "routes");
const ROOM_DIR = join(ROOT, "apps", "worker", "src", "room");

/** Physical lines, which is what a reader counts and what the story's number means. */
function lineCount(path: string): number {
  return readFileSync(path, "utf8").split("\n").length;
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("TC-MATCH-190: the match page fits the size rule", () => {
  it("keeps MatchPage.tsx at or under 400 lines", () => {
    const lines = lineCount(join(ROUTES, "MatchPage.tsx"));
    expect(lines).toBeLessThanOrEqual(400);
  });

  it("keeps every route file at or under 500 lines", () => {
    const over = routeFiles(ROUTES)
      .map((path) => ({ path: path.slice(ROOT.length + 1), lines: lineCount(path) }))
      .filter((file) => file.lines > 500);
    expect(over).toEqual([]);
  });

  it("keeps the effects in named hooks, not in the page body (AC3)", () => {
    const source = readFileSync(join(ROUTES, "MatchPage.tsx"), "utf8");
    const effects = source.match(/useEffect\(/g) ?? [];
    expect(effects.length).toBeLessThanOrEqual(4);
  });
});

describe("TC-ROOM-700: the room object fits the size rule", () => {
  it("keeps room-do.ts at or under 400 lines", () => {
    const lines = lineCount(join(ROOT, "apps", "worker", "src", "room-do.ts"));
    expect(lines).toBeLessThanOrEqual(400);
  });

  it("puts the budgets, the election and the recording in their own modules (AC1)", () => {
    const files = readdirSync(ROOM_DIR);
    // Named by responsibility, not by the file the first attempt happened to use: a rename is fine, a merge is not.
    const has = (pattern: RegExp): boolean => files.some((file) => pattern.test(file));
    expect(has(/^rate-limit\.ts$|^budgets\.ts$/), "the socket budgets live in their own module").toBe(true);
    expect(has(/^election\.ts$/), "the host election lives in its own module").toBe(true);
    expect(has(/^records\.ts$|^recording\.ts$/), "the match recording lives in its own module").toBe(true);
  });

  it("keeps the room object holding the storage and the alarm wiring, and nothing else (AC3)", () => {
    const source = readFileSync(join(ROOT, "apps", "worker", "src", "room-do.ts"), "utf8");
    // The three things only a Durable Object can do: storage, the alarm, the sockets it accepts.
    expect(source).toContain("ctx.storage");
    expect(source).toContain("setAlarm");
    expect(source).toContain("webSocketMessage");
    // A new storage key is a behaviour change, so the set is pinned: the room record plus the three side keys the
    // refactor promised not to touch (`US-ROOM-008` AC3).
    const keys = [...new Set([...source.matchAll(/storage\.(get|put|delete)\(\s*[`"]([^`"]+)/g)].map((match) => match[2]))];
    expect(keys.sort()).toEqual(["hostCheck", "matchStartedAt", "origin", "room", "snapshot"]);
  });
});
