/**
 * `US-OPS-002` — the daily snapshot job. The network half needs a Cloudflare token, so what is proven here is the
 * half that decides whether a snapshot is honest: it reads its SLIs from `docs/08-ops/slo.md` instead of a private
 * list, a missing metric counts as a breach, and a breach makes the job fail.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSloTable, renderSnapshot, verdictFor } from "../../scripts/slo-snapshot.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const rows = parseSloTable(readFileSync(join(ROOT, "docs", "08-ops", "slo.md"), "utf8"));

describe("slo snapshot", () => {
  it("TC-OPS-901: every SLO in slo.md becomes a row and names its NFR", () => {
    // Arrange / Act
    const rendered = renderSnapshot("2026-12-01", rows, {});

    // Assert
    expect(rows.map((row) => row.id)).toEqual(["slo-1", "slo-2", "slo-3", "slo-4"]);
    expect(rows.every((row) => /^NFR-\d+$/.test(row.nfr))).toBe(true);
    for (const row of rows) expect(rendered.markdown).toContain(`| ${row.id} |`);
    expect(rendered.markdown).toContain("| NFR-26 |");
  });

  it("TC-OPS-903: a missing metric reads no data and counts as a breach", () => {
    // Act
    const rendered = renderSnapshot("2026-12-01", rows, { "slo-1": 99.72 });

    // Assert
    expect(rendered.markdown).toContain("| slo-1 | 99.72 % |");
    expect(rendered.markdown).toContain("| slo-2 | no data |");
    expect(rendered.breached).toBe(true);
  });

  it("TC-OPS-904: a day inside every target exits clean and a breach marks only that row", () => {
    // Arrange
    const good = { "slo-1": 99.72, "slo-2": 320, "slo-3": 74, "slo-4": 61 };
    const bad = { ...good, "slo-1": 99.1 };

    // Act
    const clean = renderSnapshot("2026-12-01", rows, good);
    const breached = renderSnapshot("2026-12-01", rows, bad);

    // Assert — "≤ 400 ms p95" and "≥ 70 %" both resolve from the table's own target text
    expect(clean.breached).toBe(false);
    expect(breached.breached).toBe(true);
    expect(breached.markdown).toContain("| slo-1 | 99.10 % |");
    expect(breached.markdown).toMatch(/\| slo-1 \| 99\.10 % \|.*\| BREACH \|/);
    expect(breached.markdown).toMatch(/\| slo-2 \| 320 ms \|.*\| ok \|/);
  });

  it("TC-OPS-905: a metric without a target is a breach, never an assumed pass", () => {
    // Act / Assert
    expect(verdictFor({ target: null, direction: "at-least", unit: "%" }, 99.9).verdict).toBe("BREACH");
    expect(verdictFor({ target: 99.5, direction: "at-least", unit: "%" }, null).verdict).toBe("BREACH");
  });
});

/**
 * TC-OPS-907: an unconfigured repository skips the job instead of failing it (`US-OPS-002` AC2/AC3).
 *
 * The alarm only works if red means a number is bad. The job went red every morning because no analytics token was set,
 * which is a configuration fact, not a breached SLO — and a daily false red is how a team learns to ignore the board. The
 * rule lives in the workflow, so this case reads the workflow: the snapshot step is gated on the configuration check and
 * a missing metric still counts as a breach once it runs (that half is `TC-OPS-903`).
 */
describe("TC-OPS-907: the workflow separates 'not configured' from 'breached'", () => {
  const workflow = readFileSync(join(ROOT, ".github", "workflows", "slo-snapshot.yml"), "utf8");

  it("checks the credentials before it reads any analytics", () => {
    const configIndex = workflow.indexOf("id: config");
    const snapshotIndex = workflow.indexOf("node scripts/slo-snapshot.mjs");
    expect(configIndex).toBeGreaterThan(-1);
    expect(snapshotIndex).toBeGreaterThan(configIndex);
    expect(workflow).toContain("configured=true");
    expect(workflow).toContain("configured=false");
  });

  it("runs the snapshot and the commit only when it is configured", () => {
    const gated = workflow.split("if: steps.config.outputs.configured == 'true'").length - 1;
    expect(gated).toBe(2);
    // A skip must be visible as a notice, not as a silent no-op.
    expect(workflow).toContain("::notice title=SLO snapshot skipped::");
  });

  it("leaves the script's own rule alone: a missing metric is still a breach", () => {
    // If the skip had been pushed into the script, `renderSnapshot` would treat an empty value set as "nothing to do".
    const rendered = renderSnapshot("2026-12-01", rows, {});
    expect(rendered.breached).toBe(true);
  });
});
