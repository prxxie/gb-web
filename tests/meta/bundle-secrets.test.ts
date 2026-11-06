/**
 * TC-FND-012 (`US-FND-001` AC4, `NFR-12`): the SPA bundle is public. Anything the browser build inlines is
 * visible to every visitor, so a secret that leaks into `import.meta.env.VITE_*` — or into source that ships —
 * is a disclosure, not a bug report waiting to happen.
 *
 * The test builds the app the way `pnpm build` does, then greps every emitted asset for the names of the
 * Worker's secrets and, when a local `apps/worker/.dev.vars` exists, for their real values too.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { build } from "vite";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const WEB = join(ROOT, "apps/web");
const DEV_VARS = join(ROOT, "apps/worker/.dev.vars");

/** Names that must never appear in a public bundle — they are Worker-only by contract. */
const FORBIDDEN_NAMES = ["SESSION_TOKEN_SECRET", "TURN_KEY_API_TOKEN", "TURN_KEY_ID", "CLERK_SECRET_KEY"];

function assets(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...assets(path));
    else out.push(path);
  }
  return out;
}

/** Real values from the untracked dev file, so a leak of the *value* is caught even without the name. */
function devSecretValues(): string[] {
  if (!existsSync(DEV_VARS)) return [];
  return readFileSync(DEV_VARS, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.slice(line.indexOf("=") + 1))
    .filter((value) => value.length >= 12)
    .filter((value) => !["dev-only-change-me", "development"].includes(value));
}

describe("built web bundle", () => {
  it("TC-FND-012: no Worker secret name or value survives into the built assets", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "gbw-bundle-"));
    try {
      // The same build `pnpm build` runs, driven through Vite's API with the app's own config. Vite is a
      // root dependency, not an `apps/web` one, so this avoids depending on a per-package `node_modules/.bin`.
      process.env.VITE_API_BASE = "/api/v1";
      process.env.VITE_CLERK_PUBLISHABLE_KEY = "";
      await build({
        configFile: join(WEB, "vite.config.ts"),
        root: WEB,
        logLevel: "error",
        build: { outDir, emptyOutDir: true },
      });

      const files = assets(outDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files.some((file) => file.endsWith(".js"))).toBe(true);

      const needles = [...FORBIDDEN_NAMES, ...devSecretValues()];
      const leaks: string[] = [];
      for (const file of files) {
        const text = readFileSync(file, "utf8");
        for (const needle of needles) {
          if (text.includes(needle)) leaks.push(`${file.slice(outDir.length + 1)} contains ${needle}`);
        }
      }
      expect(leaks).toEqual([]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 120_000);
});
