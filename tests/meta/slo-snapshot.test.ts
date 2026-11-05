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
