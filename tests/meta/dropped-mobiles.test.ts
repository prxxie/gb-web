/**
 * `TC-BAL-131` — a dropped machine has no trace left in the product (`US-BAL-005` AC4, § 5).
 *
 * The roster went from twenty to seventeen on 2026-11-13. Deleting the rows is the easy half: the ids also had to leave
 * the loadout screen, the i18n copy, the worker's pick parser and every doc, or a stale fixture keeps a machine alive
 * that no screen can draw. This case is the thing that keeps them gone — it reads the tree, not a fixture, so the next
 * row edit cannot quietly reintroduce one.
 *
 * The two story files that describe the drop are the only place the ids may still appear, and they are excluded by
 * name rather than by pattern so a new story cannot become an accidental exemption.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { MOBILES, isMobileId, resolveMobileId } from "@gbw/core";

const ROOT = join(import.meta.dirname, "..", "..");
const DROPPED = ["mbl-06", "mbl-08", "mbl-16"];

const STORY_ALLOWLIST = new Set([
  "docs/03-stories/EPIC-09-ballistics/US-BAL-005-field-the-seventeen-reference-machines.md",
  "docs/03-stories/EPIC-09-ballistics/US-BAL-004-fly-the-original-trajectory.md",
  // The records of the drop itself: a changelog entry and the case that proves it. They name the ids to say they are
  // gone, which is the opposite of shipping them — but they are the only two records allowed to.
  "docs/CHANGELOG.md",
  "docs/05-quality/test-cases.md",
  // A source document or a build artefact may name them; shipping code and reference docs may not.
  "packages/core/dist-types/data/mobiles.d.ts",
]);

const SCANNED_TREES = ["apps/web/src", "apps/worker/src", "packages/core/src", "docs"];
const SCANNED_SUFFIXES = /\.(ts|tsx|json|md|sql)$/;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return SCANNED_SUFFIXES.test(entry) ? [path] : [];
  });
}

describe("TC-BAL-131: the dropped machines are gone from the product", () => {
  it("no shipped file names a dropped mobile id", () => {
    const offenders: string[] = [];
    for (const tree of SCANNED_TREES) {
      for (const path of filesUnder(join(ROOT, tree))) {
        const id = relative(ROOT, path).replaceAll("\\", "/");
        if (STORY_ALLOWLIST.has(id)) continue;
        const text = readFileSync(path, "utf8");
        for (const dropped of DROPPED) {
          if (text.includes(dropped)) offenders.push(`${id}: ${dropped}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the roster itself never resolves a dropped id to a machine", () => {
    for (const dropped of DROPPED) {
      expect(isMobileId(dropped)).toBe(false);
      expect(resolveMobileId(dropped)).toBe(MOBILES[0]?.mobileId);
    }
    expect(MOBILES).toHaveLength(17);
  });
});
