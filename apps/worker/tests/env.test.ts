/**
 * TC-FND-002 (`US-FND-001` AC5, `NFR-12`): the two example files are the only place a new teammate learns
 * which environment variables exist, so they must match what the code actually reads — and they must never
 * carry a value that matters.
 *
 * The worker reads three kinds of name, and the test accepts all three sources:
 * plain vars and bindings declared in `wrangler.jsonc`, and secrets kept out of the repository in
 * `.dev.vars` (represented by the example file). The web app reads only `import.meta.env.VITE_*`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const WORKER_SRC = join(ROOT, "apps/worker/src");
const WEB_SRC = join(ROOT, "apps/web/src");

function walk(dir: string, extensions: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path, extensions));
    else if (extensions.some((ext) => path.endsWith(ext))) out.push(path);
  }
  return out;
}

function readAll(dir: string, extensions: readonly string[]): string {
  return walk(dir, extensions)
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

/** `env.NAME` in the worker, anywhere in `apps/worker/src`. */
function workerEnvReads(): Set<string> {
  const source = readAll(WORKER_SRC, [".ts"]);
  const names = new Set<string>();
  for (const match of source.matchAll(/\benv\.([A-Z][A-Z0-9_]+)\b/g)) names.add(match[1] as string);
  return names;
}

/** `import.meta.env.NAME` in the SPA, minus the ones Vite defines itself. */
const VITE_BUILTINS = new Set(["DEV", "PROD", "MODE", "BASE_URL", "SSR"]);

function webEnvReads(): Set<string> {
  const source = readAll(WEB_SRC, [".ts", ".tsx"]);
  const names = new Set<string>();
  for (const match of source.matchAll(/import\.meta\.env\.([A-Za-z0-9_]+)/g)) {
    const name = match[1] as string;
    if (!VITE_BUILTINS.has(name)) names.add(name);
  }
  return names;
}

interface ExampleFile {
  readonly keys: string[];
  readonly values: Map<string, string>;
}

function parseExample(path: string): ExampleFile {
  const keys: string[] = [];
  const values = new Map<string, string>();
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    expect(index, `${path}: "${line}" is not KEY=VALUE`).toBeGreaterThan(0);
    const key = line.slice(0, index);
    keys.push(key);
    values.set(key, line.slice(index + 1));
  }
  return { keys, values };
}

const devVars = (): ExampleFile => parseExample(join(ROOT, "apps/worker/.dev.vars.example"));
const webEnv = (): ExampleFile => parseExample(join(ROOT, "apps/web/.env.example"));

/** `wrangler.jsonc` is JSONC: the file carries comments, `JSON.parse` does not accept them. */
function stripJsonComments(text: string): string {
  return text.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Names `wrangler.jsonc` declares: plain vars plus the two bindings. */
function wranglerNames(): Set<string> {
  const config = JSON.parse(stripJsonComments(readFileSync(join(ROOT, "apps/worker/wrangler.jsonc"), "utf8"))) as {
    vars?: Record<string, string>;
    d1_databases?: { binding: string }[];
    durable_objects?: { bindings: { name: string }[] };
  };
  const names = new Set<string>();
  for (const key of Object.keys(config.vars ?? {})) names.add(key);
  for (const entry of config.d1_databases ?? []) names.add(entry.binding);
  for (const entry of config.durable_objects?.bindings ?? []) names.add(entry.name);
  return names;
}

describe("environment example files", () => {
  it("TC-FND-002: every name the worker reads is declared in wrangler.jsonc or listed in .dev.vars.example", () => {
    const declared = wranglerNames();
    for (const key of devVars().keys) declared.add(key);
    const missing = [...workerEnvReads()].filter((name) => !declared.has(name)).sort();
    expect(missing).toEqual([]);
  });

  it("TC-FND-002: every name the SPA reads is listed in apps/web/.env.example", () => {
    const listed = new Set(webEnv().keys);
    const missing = [...webEnvReads()].filter((name) => !listed.has(name)).sort();
    expect(missing).toEqual([]);
  });

  it("TC-FND-002: neither example file advertises a name the code never reads", () => {
    expect(devVars().keys.filter((key) => !workerEnvReads().has(key))).toEqual([]);
    expect(webEnv().keys.filter((key) => !webEnvReads().has(key))).toEqual([]);
  });

  it("TC-FND-002: no example row carries a secret", () => {
    const dev = devVars().values;
    expect(dev.get("TURN_KEY_ID")).toBe("");
    expect(dev.get("TURN_KEY_API_TOKEN")).toBe("");
    expect(dev.get("CLERK_ISSUER")).toBe("");
    // The local placeholder is public by construction and must stay recognisable as one.
    expect(dev.get("SESSION_TOKEN_SECRET")).toMatch(/^dev-only/);

    const web = webEnv().values;
    expect(web.get("VITE_API_BASE")).toBe("/api/v1");
    expect(web.get("VITE_CLERK_PUBLISHABLE_KEY")).toBe("");
  });
});
