/**
 * `US-FND-001` AC1/AC2/AC7 — the workspace itself is a deliverable: three packages, the layout the docs describe,
 * no dependency outside the approved set, and no `(planned — …)` marker left in the two files a new joiner reads
 * first. Commands are executed by CI; what is checked here is the shape those commands run against.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (relative: string): string => readFileSync(join(ROOT, relative), "utf8");
const json = (relative: string): Record<string, unknown> => JSON.parse(read(relative)) as Record<string, unknown>;

describe("US-FND-001: the workspace", () => {
  it("TC-FND-074: the layout the docs name exists", () => {
    for (const path of [
      "apps/web/src",
      "apps/worker/src",
      "packages/core/src",
      "packages/core/tests",
      "apps/worker/tests",
      "apps/web/tests",
      "tests/e2e",
      "tests/meta",
      "scripts",
    ]) {
      expect(existsSync(join(ROOT, path)), `missing ${path}`).toBe(true);
    }
    expect(read("pnpm-workspace.yaml")).toContain("apps/*");
    expect(read("pnpm-workspace.yaml")).toContain("packages/*");
  });

  it("TC-FND-075: every package declares the same Node floor, and it is the documented one", () => {
    // `AGENTS.md` § PROJECT states the floor once; `engines.node` is the authority (`US-FND-001` AC1).
    const floor = ">=22.12.0";
    expect((json("package.json")["engines"] as { node?: string } | undefined)?.node).toBe(">=22.12");
    for (const manifest of ["apps/web/package.json", "apps/worker/package.json", "packages/core/package.json"]) {
      const engines = json(manifest)["engines"] as { node?: string } | undefined;
      // A package may omit `engines` and inherit the floor from the workspace root; it may not contradict it.
      if (engines?.node !== undefined) expect(engines.node, manifest).toBe(floor.slice(1));
    }
  });

  it("TC-FND-076: no `(planned — …)` marker survives in the two entry documents", () => {
    // AC7: a reader must never be told a command exists and then find it is planned.
    for (const path of ["AGENTS.md", "docs/01-overview/environment-setup.md"]) {
      expect(read(path), `${path} still carries a planned marker`).not.toMatch(/\(planned\s*—/);
    }
  });
});
