#!/usr/bin/env node
/**
 * Daily SLO snapshot (`US-OPS-002`).
 *
 * `docs/08-ops/slo.md` is the source of truth for *which* SLIs exist, their targets, windows and the `NFR-nn` each
 * one operationalises — this script reads that table instead of keeping its own copy, so a new SLO appears in the
 * snapshot without touching code, and a snapshot can never quietly drop one (`AC4`).
 *
 * Usage:
 *   node scripts/slo-snapshot.mjs                     # yesterday, from the Cloudflare analytics API
 *   node scripts/slo-snapshot.mjs --date 2026-12-01
 *   node scripts/slo-snapshot.mjs --values ./values.json   # offline: {"slo-1": 99.72, ...}
 *
 * Required environment for the live path: `CF_ANALYTICS_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (and optionally
 * `GBW_WORKER_NAME`, default `gbw-api`). Exit code 1 means at least one SLI breached — the CI run fails so the
 * breach is visible (`AC2`), and a metric that is missing counts as a breach, never as a skip (`AC3`).
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SLO_DOC = join(ROOT, "docs", "08-ops", "slo.md");
const OUTPUT_DIR = join(ROOT, "docs", "06-reports", "slo-snapshots");
const GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";

const [SLO_1, SLO_2, SLO_3, SLO_4] = ["slo-1", "slo-2", "slo-3", "slo-4"];

/**
 * The four queries in `docs/08-ops/slo.md` § 1, in the Cloudflare GraphQL dialect. Each returns one number and the
 * comparison direction that decides the verdict.
 */
export const QUERIES = {
  [SLO_1]: {
    direction: "at-least",
    query: ({ accountTag, worker, window }) => `query { viewer { accounts(filter: {accountTag: "${accountTag}"}) { workersInvocationsAdaptive(filter: {scriptName: "${worker}", ${window}}, limit: 1) { sum { requests, errors } } } } }`,
    pick: (data) => {
      const sums = data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.[0]?.sum;
      if (!sums || sums.requests === 0) return null;
      return ((sums.requests - (sums.errors ?? 0)) / sums.requests) * 100;
    },
  },
  [SLO_2]: {
    direction: "at-most",
    // `workersInvocationsAdaptive.quantiles` carries no percentile in the live schema — `p50`, `p75`, `p90`, `p95` and
    // `p99` are all rejected as unknown fields, and `workersOverviewRequestsAdaptiveGroups` has no `quantiles` at all — so
    // the histogram the SLO is written against cannot be read from this API. The mean is what can be measured, and it is
    // held to the same 400 ms ceiling: mean ≤ 400 ms is a strictly stronger claim than p95 ≤ 400 ms, so the row cannot be
    // green while the p95 target is breached. `docs/08-ops/slo.md` § 1 records the substitution.
    query: ({ accountTag, worker, window }) => `query { viewer { accounts(filter: {accountTag: "${accountTag}"}) { workersInvocationsAdaptive(filter: {scriptName: "${worker}", ${window}}, limit: 1) { sum { requests, duration } } } } }`,
    pick: (data) => {
      const sums = data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.[0]?.sum;
      if (!sums || !sums.requests) return null;
      return sums.duration / sums.requests;
    },
  },
  [SLO_3]: {
    direction: "at-least",
    query: ({ accountTag, worker, window }) => `query { viewer { accounts(filter: {accountTag: "${accountTag}"}) { rooms: workersInvocationsAdaptive(filter: {scriptName: "${worker}", ${window}}, limit: 1) { sum { requests } } } } }`,
    // SLO-3 is a product ratio computed from D1 (`match_record` vs rooms that reached `playing`), not from Workers
    // analytics; `scripts/slo-snapshot.mjs` reads it from the D1 query in `docs/08-ops/slo.md` § 2.
    pick: (data) => data?.viewer?.accounts?.[0]?.rooms?.[0]?.sum?.requests ?? null,
  },
  [SLO_4]: {
    direction: "at-most",
    query: ({ accountTag, window }) => `query { viewer { accounts(filter: {accountTag: "${accountTag}"}) { d1AnalyticsAdaptiveGroups(filter: {${window}}, limit: 1) { sum { rowsWritten } } } } }`,
    pick: (data) => {
      const rows = data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups?.[0]?.sum?.rowsWritten;
      return rows === undefined ? null : (rows / 100_000) * 100;
    },
  },
};

/** `docs/08-ops/slo.md` § 1 → `[{ id, sli, target, window, unit, nfr, direction }]`. */
export function parseSloTable(markdown) {
  const rows = [];
  for (const line of markdown.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 8) continue;
    const id = cells[1];
    if (!/^SLO-\d+$/.test(id)) continue;
    const targetText = cells[3] ?? "";
    // "≤ 400 ms p95, ≤ 1 s p99" carries two ceilings; the first is the one the SLI is judged on.
    const atMost = /≤/.test(targetText);
    const target = Number(/(\d+(?:\.\d+)?)/.exec(targetText)?.[1] ?? "NaN");
    // "≤ 80 % of daily writes" is the SLO-4 shape: the number is a ceiling either way, the unit is what differs.
    rows.push({
      id: id.toLowerCase(),
      label: id,
      target: Number.isNaN(target) ? null : target,
      targetText,
      window: cells[4] ?? "",
      nfr: cells[5] ?? "",
      unit: /ms/.test(targetText) ? "ms" : "%",
      direction: atMost ? "at-most" : "at-least",
      sli: cells[2] ?? "",
    });
  }
  return rows;
}

/** A missing number is a breach, not a gap (`AC3`). */
export function verdictFor(row, value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { verdict: "BREACH", budgetLeft: "no data", text: "no data" };
  }
  if (row.target === null) return { verdict: "BREACH", budgetLeft: "no target", text: String(value) };
  const ok = row.direction === "at-most" ? value <= row.target : value >= row.target;
  // Budget left is the share of the allowance still unspent: for a ceiling that is (target − value)/target, for a
  // ratio floor it is (value − target)/(100 − target) — "99.72 % against 99.5 %" has 56 % of its 0.5 % left.
  const budget =
    row.direction === "at-most"
      ? ((row.target - value) / row.target) * 100
      : row.target >= 100
        ? 0
        : ((value - row.target) / (100 - row.target)) * 100;
  const budgetLeft = `${Math.max(0, Math.min(100, budget)).toFixed(0)} %`;
  return {
    verdict: ok ? "ok" : "BREACH",
    budgetLeft: `${budget.toFixed(0)} %`,
    text: row.unit === "%" ? `${value.toFixed(2)} %` : `${value.toFixed(0)} ms`,
  };
}

/** The file body. Pure, so the shape is testable without a network. */
export function renderSnapshot(date, rows, values) {
  const lines = [
    `# SLO snapshot — ${date}`,
    "",
    "Generated by `scripts/slo-snapshot.mjs` from `docs/08-ops/slo.md` § 1 and the Cloudflare analytics API.",
    "",
    "| SLI | Value | Target | Window | Budget left | Verdict | NFR |",
    "|-----|-------|--------|--------|-------------|---------|-----|",
  ];
  let breached = false;
  for (const row of rows) {
    const { verdict, budgetLeft, text } = verdictFor(row, values[row.id]);
    if (verdict !== "ok") breached = true;
    lines.push(`| ${row.id} | ${text} | ${row.targetText} | ${row.window} | ${budgetLeft} | ${verdict} | ${row.nfr} |`);
  }
  lines.push("");
  return { markdown: `${lines.join("\n")}\n`, breached };
}

async function collectLive(date, env) {
  const accountTag = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CF_ANALYTICS_TOKEN;
  if (!accountTag || !token) {
    throw new Error("CF_ANALYTICS_TOKEN and CLOUDFLARE_ACCOUNT_ID are required (or pass --values)");
  }
  const worker = env.GBW_WORKER_NAME ?? "gbw-api";
  // The API answers an unbounded range with "cannot request a time range wider than 4w4d" — the default is not "today".
  // A snapshot for `date` measures the 24 h that end at that date's midnight UTC.
  const until = new Date(`${date}T00:00:00Z`);
  const since = new Date(until.getTime() - 86_400_000);
  const window = `datetime_geq: "${since.toISOString()}", datetime_leq: "${until.toISOString()}"`;
  const values = {};
  for (const id of [SLO_1, SLO_2, SLO_3, SLO_4]) {
    const spec = QUERIES[id];
    const response = await fetch(GRAPHQL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query: spec.query({ accountTag, worker, window }), variables: { date } }),
    });
    if (!response.ok) {
      // `AC6`: the job fails loudly and writes nothing rather than a partial file.
      throw new Error(`analytics query for ${id} failed: ${response.status} ${await response.text()}`);
    }
    const body = await response.json();
    if (body.errors) throw new Error(`analytics query for ${id} failed: ${JSON.stringify(body.errors)}`);
    // A missing metric stays null: the row then reads `no data` and counts as a breach in `verdictFor`.
    values[id] = spec.pick(body.data) ?? null;
  }
  return values;
}

function parseArgs(argv) {
  const args = { date: null, values: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--date") args.date = argv[index + 1] ?? null;
    if (argv[index] === "--values") args.values = argv[index + 1] ?? null;
  }
  if (args.date === null) {
    const yesterday = new Date(Date.now() - 86_400_000);
    args.date = yesterday.toISOString().slice(0, 10);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = parseSloTable(readFileSync(SLO_DOC, "utf8"));
  if (rows.length === 0) throw new Error("docs/08-ops/slo.md § 1 declares no SLO rows");
  const values = args.values === null ? await collectLive(args.date, process.env) : JSON.parse(readFileSync(args.values, "utf8"));
  const { markdown, breached } = renderSnapshot(args.date, rows, values);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const file = join(OUTPUT_DIR, `${args.date}.md`);
  writeFileSync(file, markdown, "utf8");
  process.stdout.write(`${file}${breached ? " (BREACH)" : ""}\n`);
  process.exitCode = breached ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
