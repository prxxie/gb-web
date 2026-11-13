/**
 * TC-BAL-152 (`US-BAL-007` AC4, `screens/practice.md` § Notes): the solver is the calculation a match must never have.
 *
 * The guard is the import graph, walked from each route's own entry file: nothing `MatchPage` reaches may import the
 * solver (or name one of its answers from the barrel), and nothing the practice screen reaches may import the Phaser
 * battle (`src/game`) — the practice tool is arithmetic, not a third way to fire a shell.
 *
 * The walk is textual on purpose: it is the same graph the bundler sees for tree shaking, and it needs no build.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const WEB = join(ROOT, "apps/web/src");

/** The exports a match must not reach — `solver.ts`'s three answers and its shapes. */
const SOLVER_SYMBOLS = ["barForDistance", "distanceForBar", "timeForShot", "SolveContext", "SolveResult"];

/** `import … from "x"`, `export … from "x"` and `import("x")`, with the clause in front of it. */
const IMPORT = /(?:import|export)([\s\S]*?)from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;

interface Edge {
  readonly specifier: string;
  readonly clause: string;
}

function edges(file: string): Edge[] {
  const source = readFileSync(file, "utf8");
  return Array.from(source.matchAll(IMPORT), (match) => ({
    specifier: match[2] ?? match[3] ?? match[4] ?? "",
    clause: match[1] ?? "",
  }));
}

/** A relative specifier as a real file: `./x`, `./x.ts`, `./x/index.ts` and the `.js` extension this repo writes. */
function resolveLocal(from: string, specifier: string): string | null {
  const base = resolve(dirname(from), specifier.replace(/\.js$/, ""));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx"), base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every file reachable from `entry` by relative imports, entry included. */
function graph(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const edge of edges(file)) {
      const next = resolveLocal(file, edge.specifier);
      if (next) queue.push(next);
    }
  }
  return [...seen];
}

const name = (file: string): string => relative(ROOT, file).split("\\").join("/");

describe("TC-BAL-152: the match route cannot reach the solver (US-BAL-007 AC4)", () => {
  const match = graph(join(WEB, "routes/MatchPage.tsx"));

  it("walks a real graph, so the check is not vacuous", () => {
    expect(match.length).toBeGreaterThan(20);
    expect(match.map(name)).toContain("apps/web/src/game/scene.ts");
  });

  it("reaches no file named solver, directly or through a helper", () => {
    expect(match.map(name).filter((file) => /solver/.test(file))).toEqual([]);
  });

  it("names none of the solver's answers from the core barrel", () => {
    const confessed = match.flatMap((file) =>
      edges(file)
        .filter((edge) => edge.specifier === "@gbw/core")
        .flatMap((edge) => SOLVER_SYMBOLS.filter((symbol) => edge.clause.includes(symbol)).map((symbol) => `${name(file)} → ${symbol}`)),
    );
    expect(confessed).toEqual([]);
  });

  it("names none of them in a body either", () => {
    // `@gbw/core` is one barrel, so an import clause says nothing about which exports a file uses: `import * as core`
    // or a shared helper reaching the solver would slip past the check above. The symbols themselves would not.
    const used = match.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return SOLVER_SYMBOLS.filter((symbol) => new RegExp(`\\b${symbol}\\b`).test(source)).map(
        (symbol) => `${name(file)} → ${symbol}`,
      );
    });
    expect(used).toEqual([]);
  });
});

describe("TC-BAL-152: the practice screen reaches the solver and nothing of the battle", () => {
  const practice = graph(join(WEB, "routes/PracticePage.tsx"));

  it("imports the solver's answers from the core barrel", () => {
    const names = practice.flatMap((file) => edges(file).filter((edge) => edge.specifier === "@gbw/core").map((edge) => edge.clause));
    expect(names.join(" ")).toContain("barForDistance");
  });

  it("reaches nothing under src/game — no canvas, no Phaser, no scene", () => {
    expect(practice.map(name).filter((file) => file.startsWith("apps/web/src/game/"))).toEqual([]);
  });

  it("never imports the match route or the bot", () => {
    expect(practice.map(name).filter((file) => /MatchPage|useBotOpponent|\/bot\.ts$/.test(file))).toEqual([]);
  });
});
