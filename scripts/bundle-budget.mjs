#!/usr/bin/env node
/**
 * `NFR-03` — the weight of the web bundle is a ratchet, not a wish.
 *
 * `tests/e2e/pwa-prod.spec.ts` measures the cold load against the 5 MB transfer budget, but that spec only runs in the
 * Playwright job on a production build, so a chunk that quietly doubles between two e2e runs is invisible until someone
 * reads a build log. This script turns the numbers `vite build` prints into a checked contract: every bucket below has
 * the gzip size it had when the record was last raised, and the check fails on any growth.
 *
 * Raising a number is a deliberate act — edit `scripts/bundle-budget.json` in the same change that adds the weight, so
 * the diff shows what the payload cost. A new chunk that matches no bucket is a failure too: an unrecorded chunk is
 * weight nobody agreed to.
 *
 * Run it after `pnpm build` (`pnpm budget`); it reads `apps/web/dist/assets` and needs no network.
 */
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const DIST = "apps/web/dist/assets";
const BUDGET_PATH = new URL("./bundle-budget.json", import.meta.url);

const budget = JSON.parse(readFileSync(BUDGET_PATH, "utf8"));
const unit = budget.unit ?? "KiB gzip";

let files;
try {
  files = readdirSync(DIST).filter((name) => /\.(js|css)$/.test(name));
} catch {
  console.error(`budget: ${DIST} is missing — run \`pnpm build\` first.`);
  process.exit(1);
}
if (files.length === 0) {
  console.error(`budget: ${DIST} holds no chunk — run \`pnpm build\` first.`);
  process.exit(1);
}

/** gzip size of every chunk, in KiB, as the browser pays it. */
const sizes = new Map(
  files.map((name) => [name, gzipSync(readFileSync(`${DIST}/${name}`)).length / 1024]),
);

const problems = [];
const rows = [];
const claimed = new Set();

for (const [bucket, spec] of Object.entries(budget.buckets)) {
  const pattern = new RegExp(spec.chunks);
  const members = files.filter((name) => pattern.test(name));
  if (members.length === 0) {
    problems.push(`bucket \`${bucket}\` matched no chunk (${spec.chunks}) — did a chunk get renamed?`);
    continue;
  }
  for (const name of members) claimed.add(name);
  const total = members.reduce((sum, name) => sum + (sizes.get(name) ?? 0), 0);
  rows.push([bucket, members, total, spec.maxKiB]);
  if (total > spec.maxKiB) {
    problems.push(
      `bucket \`${bucket}\` is ${total.toFixed(1)} ${unit}, over its ${spec.maxKiB} ${unit} by ${(total - spec.maxKiB).toFixed(1)}`,
    );
  }
}

for (const name of files) {
  if (!claimed.has(name)) problems.push(`\`${name}\` matches no bucket — record it in scripts/bundle-budget.json`);
}

const total = [...sizes.values()].reduce((sum, size) => sum + size, 0);
if (budget.totalMaxKiB !== undefined && total > budget.totalMaxKiB) {
  problems.push(`the whole bundle is ${total.toFixed(1)} ${unit}, over its ${budget.totalMaxKiB} ${unit}`);
}

const width = Math.max(...rows.map(([bucket]) => bucket.length), 6);
for (const [bucket, members, size, max] of rows) {
  const head = `  ${bucket.padEnd(width)}  ${size.toFixed(1).padStart(7)} / ${String(max).padStart(4)} ${unit}`;
  console.log(`${head}  ${members.join(", ")}`);
}
console.log(`  ${"total".padEnd(width)}  ${total.toFixed(1).padStart(7)} / ${String(budget.totalMaxKiB ?? "-").padStart(4)} ${unit}`);

if (problems.length > 0) {
  console.error(`\nbudget: ${problems.length} problem(s) — measured ${budget.measured}:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`\nbudget: every bucket is inside its recorded weight (measured ${budget.measured}).`);
