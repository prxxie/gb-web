/**
 * Traceability (`rule 03` D1, `docs/05-quality/test-cases.md` coverage rules).
 *
 * Two directions are enforced:
 *  - a test may not invent an id — every `TC-…` in a test file must exist in the case table;
 *  - documented coverage may not silently fall — the baseline is a committed number that only moves
 *    when someone deliberately raises it.
 *
 * Full coverage is not claimed here: cases that need two phones, Clerk keys, a production deployment
 * or fifty rooms are executed by hand and recorded in the release record, which is why the baseline
 * is a floor rather than 100 %.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../..", import.meta.url).pathname;
const ID_PATTERN = /TC-[A-Z]{2,6}-\d{3}/g;
const ROW_PATTERN = /^\|\s*(TC-[A-Z]{2,6}-\d{3})\s*\|/gm;

const BASELINE = Number(readFileSync(join(ROOT, "tests/meta/traceability-baseline.txt"), "utf8").trim());

function walk(dir: string, extensions: readonly string[], acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry === "dist-types" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, extensions, acc);
    else if (extensions.some((extension) => full.endsWith(extension))) acc.push(full);
  }
  return acc;
}

function documented(): Set<string> {
  const table = readFileSync(join(ROOT, "docs/05-quality/test-cases.md"), "utf8");
  return new Set([...table.matchAll(ROW_PATTERN)].map((match) => match[1] ?? "").filter(Boolean));
}

function tested(): Set<string> {
  const files = [
    ...walk(join(ROOT, "packages/core/tests"), [".ts"]),
    ...walk(join(ROOT, "apps/worker/tests"), [".ts"]),
    ...walk(join(ROOT, "apps/web/tests"), [".ts", ".tsx"]),
    ...walk(join(ROOT, "tests/e2e"), [".ts"]),
  ].filter((file) => !file.endsWith("setup.ts"));
  const ids = new Set<string>();
  for (const file of files) {
    for (const match of readFileSync(file, "utf8").matchAll(ID_PATTERN)) ids.add(match[0]);
  }
  return ids;
}

describe("test-case traceability", () => {
  it("a test never cites an id the case table does not define", () => {
    const known = documented();
    const invented = [...tested()].filter((id) => !known.has(id)).sort();
    expect(invented).toEqual([]);
  });

  it("every story row in the case table names a real story", () => {
    const table = readFileSync(join(ROOT, "docs/05-quality/test-cases.md"), "utf8");
    const stories = new Set(
      walk(join(ROOT, "docs/03-stories"), [".md"])
        .map((file) => /US-[A-Z]{2,6}-\d{3}/.exec(file)?.[0] ?? "")
        .filter(Boolean),
    );
    const rows = [...table.matchAll(/\|\s*TC-[A-Z]{2,6}-\d{3}\s*\|\s*(US-[A-Z]{2,6}-\d{3})\s*\|/g)].map((match) => match[1] ?? "");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((story) => !stories.has(story))).toEqual([]);
  });

  it("a case is cited in the scope its table row declares", () => {
    // Scope is how a case is executed, not a preference: a `worker` case needs miniflare, so a core unit
    // test citing it is really testing something else under a borrowed id. This is how `TC-CORE-914`
    // ("blast radius 80 on the mask") ended up on three unrelated behaviours in two files.
    const table = readFileSync(join(ROOT, "docs/05-quality/test-cases.md"), "utf8");
    const scope = new Map(
      [...table.matchAll(/^\|\s*(TC-[A-Z]{2,6}-\d{3})\s*\|[^|]*\|[^|]*\|[^|]*\|\s*(\w+)\s*\|/gm)].map(
        (match) => [match[1] ?? "", match[2] ?? ""] as const,
      ),
    );
    const directories: readonly (readonly [string, string])[] = [
      ["packages/core/tests", "unit"],
      ["apps/worker/tests", "worker"],
      ["apps/web/tests", "web"],
      ["tests/e2e", "e2e"],
    ];
    const violations = new Set<string>();
    for (const [directory, declared] of directories) {
      for (const file of walk(join(ROOT, directory), [".ts", ".tsx"])) {
        if (file.endsWith("setup.ts")) continue;
        for (const match of readFileSync(file, "utf8").matchAll(ID_PATTERN)) {
          const row = scope.get(match[0]);
          if (row !== undefined && row !== declared) {
            violations.add(`${match[0]} ${file.slice(ROOT.length).replace(/^\/+/, "")}`);
          }
        }
      }
    }
    const registered = new Set(
      readFileSync(join(ROOT, "tests/meta/traceability-scope-exceptions.txt"), "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#")),
    );
    expect([...violations].filter((line) => !registered.has(line)).sort()).toEqual([]);
    // A registered debt that stopped violating means the list was not kept honest.
    expect([...registered].filter((line) => !violations.has(line)).sort()).toEqual([]);
  });

  it("documented coverage does not fall below the recorded baseline", () => {
    const covered = [...tested()].filter((id) => documented().has(id)).length;
    console.info(`traceability: ${covered} of ${documented().size} documented cases have an automated test (baseline ${BASELINE})`);
    expect(covered).toBeGreaterThanOrEqual(BASELINE);
  });
});
