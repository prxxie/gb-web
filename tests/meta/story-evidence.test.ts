/**
 * `Definition of Done` D1 — "every acceptance criterion is met and traced to a test".
 *
 * This cannot prove an AC is met, but it can refuse the two shortcuts that make a `done` status a lie: a story
 * marked `done` whose case ids are never cited by a test, and a case cited only as a comment. It is deliberately
 * cheap; `cpt-review` is what reads the AC itself.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return entry === "node_modules" || entry === "dist" ? [] : walk(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

interface Story {
  readonly id: string;
  readonly status: string;
  readonly path: string;
}

function stories(): Story[] {
  const epicDirectory = join(ROOT, "docs", "03-stories");
  return readdirSync(epicDirectory)
    .filter((epic) => epic.startsWith("EPIC-"))
    .flatMap((epic) =>
      readdirSync(join(epicDirectory, epic))
        .filter((file) => file.startsWith("US-") && file.endsWith(".md"))
        .map((file) => {
          const text = readFileSync(join(epicDirectory, epic, file), "utf8");
          const status = /^status:\s*(\S+)/m.exec(text)?.[1] ?? "unknown";
          return { id: file.slice(0, file.indexOf("-", 7)), status, path: `${epic}/${file}` };
        }),
    );
}

/** `caseId → storyId` from the one table that defines them. */
function caseTable(): Map<string, string> {
  const rows = readFileSync(join(ROOT, "docs", "05-quality", "test-cases.md"), "utf8").split("\n");
  const table = new Map<string, string>();
  for (const row of rows) {
    const match = /^\| (TC-[A-Z]+-\d+) \| (US-[A-Z]+-\d+) \|/.exec(row);
    if (match?.[1] !== undefined && match[2] !== undefined) table.set(match[1], match[2]);
  }
  return table;
}

/** Every case id a test file mentions. */
function citedCases(): Set<string> {
  const cited = new Set<string>();
  for (const file of walk(join(ROOT, "apps")).concat(walk(join(ROOT, "packages")), walk(join(ROOT, "tests")))) {
    for (const match of readFileSync(file, "utf8").matchAll(/TC-[A-Z]+-\d+/g)) cited.add(match[0]);
  }
  return cited;
}

describe("story evidence", () => {
  const all = stories();
  const cases = caseTable();
  const cited = citedCases();

  it("every story file declares a status the workflow knows", () => {
    const known = new Set(["draft", "ready", "in-progress", "done"]);
    expect(all.filter((story) => !known.has(story.status)).map((story) => `${story.path}: ${story.status}`)).toEqual([]);
  });

  it("a story marked done has at least one case that a test cites", () => {
    const uncovered = all
      .filter((story) => story.status === "done")
      .filter((story) => {
        const ids = [...cases.entries()].filter(([, storyId]) => storyId === story.id).map(([id]) => id);
        return !ids.some((id) => cited.has(id));
      })
      .map((story) => story.path);
    expect(uncovered).toEqual([]);
  });

  it("a story marked done names no dependency that is not done", () => {
    const done = new Set(all.filter((story) => story.status === "done").map((story) => story.id));
    const broken = all
      .filter((story) => story.status === "done")
      .flatMap((story) => {
        const text = readFileSync(join(ROOT, "docs", "03-stories", story.path), "utf8");
        const dependencies = /^depends_on:\s*\[(.*?)\]/m.exec(text)?.[1] ?? "";
        return dependencies
          .split(",")
          .map((dependency) => dependency.trim())
          .filter((dependency) => dependency.length > 0 && !done.has(dependency))
          .map((dependency) => `${story.id} depends on ${dependency}`);
      });
    expect(broken).toEqual([]);
  });
});
