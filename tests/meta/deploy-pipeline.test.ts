/**
 * TC-FND-135 (`US-FND-005` AC1–AC4): the production pipeline is a contract, not a habit.
 *
 * A deploy that runs in the wrong order, that arms itself before the account can deploy, or that reports success
 * without asking the deployed worker and the deployed site what they are serving, is a deploy nobody can trust. Each
 * assertion here names the failure it prevents; `docs/01-overview/deployment.md` § 2 is the prose.
 *
 * The workflow file is read as text on purpose: parsing YAML would let a step pass by being valid rather than by being
 * present, and the ordering claim is about the sequence of `- name:` blocks as written.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PRODUCTION = readFileSync(join(ROOT, ".github/workflows/deploy-production.yml"), "utf8");
const PREVIEW = readFileSync(join(ROOT, ".github/workflows/deploy-preview.yml"), "utf8");
const SMOKE = readFileSync(join(ROOT, ".github/workflows/smoke.yml"), "utf8");
const DEPLOYMENT_DOC = readFileSync(join(ROOT, "docs/01-overview/deployment.md"), "utf8");
const RUNBOOK = readFileSync(join(ROOT, "docs/08-ops/runbook.md"), "utf8");

/** The index of a named step, so the order of the pipeline can be asserted rather than eyeballed. */
function stepIndex(workflow: string, name: string): number {
  const index = workflow.indexOf(`- name: ${name}`);
  expect(index, `step "${name}" is missing`).toBeGreaterThan(-1);
  return index;
}

describe("TC-FND-135: the pipeline arms itself on a merge to main", () => {
  it("AC1: runs when CI on main succeeds, and only then", () => {
    expect(PRODUCTION).toMatch(/workflow_run:\s*\n\s*workflows: \[CI\]/);
    expect(PRODUCTION).toMatch(/types: \[completed\]/);
    expect(PRODUCTION).toMatch(/branches: \[main\]/);
    // A red CI run must not reach the account, and a repo that cannot deploy must not produce a red run per merge.
    expect(PRODUCTION).toMatch(/workflow_run\.conclusion == 'success' && vars\.PRODUCTION_READY == 'true'/);
    // A manual dispatch stays possible for a roll-forward after an outage.
    expect(PRODUCTION).toMatch(/workflow_dispatch:/);
  });

  it("AC1: two deploys cannot race, and the second does not cancel the first", () => {
    expect(PRODUCTION).toMatch(/concurrency:\s*\n\s*group: deploy-production\s*\n\s*cancel-in-progress: false/);
  });
});

describe("TC-FND-135: the order keeps the schema ahead of the code", () => {
  it("AC2: migrations run before the worker, and Pages is last", () => {
    const migrations = stepIndex(PRODUCTION, "Apply production migrations");
    const worker = stepIndex(PRODUCTION, "Deploy the production worker");
    const pages = stepIndex(PRODUCTION, "Deploy the Pages production branch");
    expect(migrations).toBeLessThan(worker);
    expect(worker).toBeLessThan(pages);
  });

  it("AC2: the worker deploy stamps the sha the gate will grep for", () => {
    expect(PRODUCTION).toMatch(/wrangler deploy --env production --var VERSION:\$\{SHA:0:7\}/);
  });
});

describe("TC-FND-135: success is only claimed after asking what is serving", () => {
  it("AC3: the worker must report this commit, and the site must serve a bundle built for this API", () => {
    const sha = stepIndex(PRODUCTION, "Verify the deployed sha");
    const wiring = stepIndex(PRODUCTION, "Verify the bundle was built against this API");
    const site = stepIndex(PRODUCTION, "Verify the Pages deployment");
    expect(sha).toBeLessThan(wiring);
    expect(wiring).toBeLessThan(site);
    // The wiring check reads the built assets, not the source: a stale `VITE_API_BASE` ships an app for another backend.
    expect(PRODUCTION).toMatch(/grep -rl "\$host" apps\/web\/dist\/assets/);
    // And the site check fetches the page and the asset it names, so a 200 with a missing bundle fails.
    expect(PRODUCTION).toMatch(/curl -fsS -o "\$RUNNER_TEMP\/index\.html"/);
    expect(PRODUCTION).toMatch(/curl -fsS -o \/dev\/null "\$WEB\$asset"/);
  });

  it("AC4: a failed gate rolls the worker back instead of leaving it serving", () => {
    expect(PRODUCTION).toMatch(/if: failure\(\) && steps\.worker\.outcome == 'success'/);
    expect(PRODUCTION).toMatch(/wrangler rollback --env production/);
  });
});

describe("TC-FND-135: the preview and smoke jobs stay usable", () => {
  it("AC5: a pull request gets its own worker and database, and both URLs are commented", () => {
    expect(PREVIEW).toMatch(/d1 migrations apply gbw-preview --remote --env preview/);
    expect(PREVIEW).toMatch(/--var VERSION:\$\{SHA:0:7\}/);
    expect(PREVIEW).toMatch(/Web: /);
    expect(PREVIEW).toMatch(/API: /);
  });

  it("AC5: the smoke job can ask any deployment which sha it serves", () => {
    expect(SMOKE).toMatch(/workflow_dispatch:/);
    expect(SMOKE).toMatch(/expect/);
    // The job greps the health body for the sha it was asked to expect.
    expect(SMOKE).toContain("version");
    expect(SMOKE).toContain("$EXPECT");
  });
});

describe("TC-FND-143: the docs name the hostnames that exist", () => {
  it("AC5/US-FND-004 AC5: deployment.md and the runbook describe workers.dev, not a domain nobody owns", () => {
    // The account has no Cloudflare zone, so every `gbw.<domain>` in these docs is a promise the deployment cannot keep.
    for (const [name, text] of [
      ["deployment.md", DEPLOYMENT_DOC],
      ["runbook.md", RUNBOOK],
    ] as const) {
      expect(text, `${name} still names a placeholder domain`).not.toMatch(/gbw\.<domain>|api\.gbw\.<domain>/);
      expect(text, `${name} does not name the live API host`).toContain("gbw-api.gbw-demo.workers.dev");
    }
    // And the documented order is the one the workflow runs.
    expect(DEPLOYMENT_DOC).toMatch(/migrations[^\n]*before[^\n]*worker/i);
  });
});
