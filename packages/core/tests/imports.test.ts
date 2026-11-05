/**
 * TC-FND-018 (`US-FND-001` AC3, `NFR-22`): `packages/core` is the deterministic engine — it must stay
 * free of Phaser, of DOM globals and of every network primitive, or the simulation stops being replayable
 * outside a browser (`docs/01-overview/architecture.md#source-layout`).
 *
 * A static scan, not an ESLint rule, so it also catches indirect imports such as
 * `import { x } from "phaser"` reached through a re-export in `src/index.ts`.
 *
 * DOM globals are not scanned here: `packages/core/tsconfig.json` compiles with `lib: ["ES2023"]` and
 * `types: []`, so `document` or `window` is a type error before any test runs. The second test pins that
 * setting, which is what keeps the compiler-level half of `TC-FND-018` true.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const REPO = fileURLToPath(new URL("../../..", import.meta.url));

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly hit: string;
}

/** Patterns that must never appear in the engine; each one is a behaviour the engine cannot own. */
const FORBIDDEN: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: "phaser import", pattern: /\bfrom\s+["']phaser(?:\/[^"']*)?["']/ },
  { label: "dynamic phaser import", pattern: /\bimport\(\s*["']phaser(?:\/[^"']*)?["']\s*\)/ },
  { label: "network call", pattern: /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource)\s*\(/ },
  { label: "network module", pattern: /\bfrom\s+["'](?:node:)?(?:http|https|net|tls|dgram|ws)["']/ },
  { label: "app import", pattern: /\bfrom\s+["'](?:\.\.\/)+apps\// },
  { label: "workspace app import", pattern: /\bfrom\s+["'](?:@gbw\/web|@gbw\/worker)["']/ },
];

function scan(): Violation[] {
  const violations: Violation[] = [];
  for (const file of sources(SRC)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, index) => {
      for (const rule of FORBIDDEN) {
        if (rule.pattern.test(text)) {
          violations.push({ file: relative(REPO, file), line: index + 1, hit: rule.label });
        }
      }
    });
  }
  return violations;
}

describe("core import boundary", () => {
  it("TC-FND-018: packages/core imports no Phaser, no DOM global and no network module", () => {
    expect(scan()).toEqual([]);
  });

  it("TC-FND-018: the engine compiles without the DOM library, so DOM globals cannot appear", () => {
    const tsconfig = JSON.parse(readFileSync(fileURLToPath(new URL("../tsconfig.json", import.meta.url)), "utf8")) as {
      compilerOptions: { lib: string[]; types: string[] };
    };
    expect(tsconfig.compilerOptions.lib).toEqual(["ES2023"]);
    expect(tsconfig.compilerOptions.types).toEqual([]);
  });

  it("TC-FND-018: the scan can see the engine sources at all", () => {
    expect(sources(SRC).length).toBeGreaterThan(10);
  });
});
