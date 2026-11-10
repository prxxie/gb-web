/**
 * `US-OPS-003` — the load test's own arithmetic, `TC-OPS-906`.
 *
 * The run itself needs a live worker (and the report it writes is the evidence), so what is pinned here is the part that
 * decides whether a run passed: the nearest-rank percentile, the error-rate and p95 budgets, and the report's shape. A
 * load test whose summary lies is worse than no load test.
 */
import { describe, expect, it } from "vitest";
import { percentile, renderReport, summarise } from "../../scripts/load-test-rooms.mjs";

const BUDGET = { maxErrorRate: 0.02, maxP95Ms: 3000 };

describe("TC-OPS-906: the load test's summary", () => {
  it("takes the nearest rank, so p95 of 50 rooms is a real room", () => {
    const values = Array.from({ length: 50 }, (_, index) => index + 1);
    expect(percentile(values, 50)).toBe(25);
    expect(percentile(values, 95)).toBe(48);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 95)).toBeNull();
  });

  it("passes a clean run and counts the failures by reason", () => {
    const runs = [
      { ok: true, readyMs: 400 },
      { ok: true, readyMs: 900 },
      { ok: false, reason: "/rooms 429" },
      { ok: false, reason: "/rooms 429" },
      { ok: false, reason: "roster-timeout" },
    ];
    const summary = summarise(runs, BUDGET);
    expect(summary.rooms).toBe(5);
    expect(summary.ready).toBe(2);
    expect(summary.errorRate).toBeCloseTo(0.6, 6);
    expect(summary.failures).toEqual([
      ["/rooms 429", 2],
      ["roster-timeout", 1],
    ]);
    // 60 % failures is far past a 2 % budget: the run must be red, not "mostly fine".
    expect(summary.breached).toBe(true);
  });

  it("breaches on latency even when every room came up", () => {
    // Ten of a hundred slow rooms is past a p95 budget: the nearest-rank p95 of 100 values is the 95th, so five slow
    // rooms would still read as a pass — which is exactly why the budget is a share of the run, not one outlier.
    const runs = Array.from({ length: 100 }, (_, index) => ({ ok: true, readyMs: index < 90 ? 500 : 9_000 }));
    const summary = summarise(runs, BUDGET);
    expect(summary.errorRate).toBe(0);
    expect(summary.p95).toBeGreaterThan(BUDGET.maxP95Ms);
    expect(summary.breached).toBe(true);
  });

  it("an empty run is a breach, never a pass", () => {
    const summary = summarise([], BUDGET);
    expect(summary.rooms).toBe(0);
    expect(summary.breached).toBe(true);
  });

  it("writes the verdict, the budgets and every failure into the report", () => {
    const summary = summarise([{ ok: true, readyMs: 500 }, { ok: false, reason: "socket-error" }], BUDGET);
    const report = renderReport(summary, {
      rooms: 2,
      date: "2026-11-10",
      base: "http://127.0.0.1:8787/api/v1",
      concurrency: 2,
      seats: 2,
      maxErrorRate: BUDGET.maxErrorRate,
      maxP95Ms: BUDGET.maxP95Ms,
    });
    expect(report).toContain("# Load test — 2 rooms — 2026-11-10");
    expect(report).toContain("| Rooms ready (both seats in the roster) | 1 |");
    expect(report).toContain("BREACH");
    expect(report).toContain("`socket-error`");
    expect(report).toContain("p95 ≤ 3000 ms");
  });
});
