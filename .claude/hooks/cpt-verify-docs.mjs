#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook: after an edit under docs/, run `verify-docs.mjs --fix` (AGENTS.md hard rule 5).
 *
 * Reads the hook event as JSON on stdin and acts only when `tool_input.file_path` is inside the project's docs/.
 * The generated index files are checked but never fixed: `--fix` rewrites them, so fixing *because* one of them was
 * edited would replace the file the agent just read ("File has been modified since read") and cost a re-read per turn.
 * Exit codes follow the Claude Code hook contract: 0 = nothing to report, 2 = verifier errors (stderr is shown to
 * Claude), 1 = the hook itself failed (shown to the user, non-blocking). Node standard library only.
 *
 * This is a faithful port of cpt-verify-docs.py (US-NOD-004): same stdin contract, same exit codes, same messages.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const VERIFIER = path.join(".agents", "scripts", "verify-docs.mjs");
const VERIFY_ERRORS = 1; // verify-docs.mjs: 1 = errors found, 2 = no docs directory
// Indexes that `--fix` regenerates. Checking them is useful; fixing them from their own edit is not.
const GENERATED = [path.join("docs", "README.md"), path.join("docs", "03-stories", "README.md")];

/** Path.resolve() that also resolves symlinks, like Python's Path.resolve(): `docs/` may be a symlink. */
function resolved(target) {
  const absolute = path.resolve(target);
  try {
    return fs.realpathSync(absolute);
  } catch {
    try {
      return path.join(fs.realpathSync(path.dirname(absolute)), path.basename(absolute));
    } catch {
      return absolute;
    }
  }
}

function editedPath(event) {
  const toolInput = event !== null && typeof event === "object" ? event.tool_input : null;
  if (toolInput === null || typeof toolInput !== "object" || Array.isArray(toolInput)) return "";
  const edited = toolInput.file_path;
  return typeof edited === "string" ? edited : "";
}

function main() {
  let event;
  try {
    event = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch (exc) {
    console.error(`cpt-verify-docs: hook input is not JSON: ${exc.message}`);
    return 1;
  }
  const edited = editedPath(event);
  if (!edited) return 0;
  const cwd = event !== null && typeof event === "object" && typeof event.cwd === "string" ? event.cwd : "";
  const project = resolved(process.env.CLAUDE_PROJECT_DIR || cwd || process.cwd());
  const target = resolved(path.resolve(project, edited));
  const docs = path.join(project, "docs");
  const parents = new Set();
  for (let parent = path.dirname(target); parent !== path.dirname(parent); parent = path.dirname(parent)) {
    parents.add(parent);
  }
  if (!parents.has(docs) && !parents.has(resolved(docs))) return 0; // docs/ may be a symlink
  if (!fs.statSync(path.join(project, VERIFIER), { throwIfNoEntry: false })?.isFile()) {
    return 0; // CPT was uninstalled or never installed here: nothing to verify against
  }

  const command = [process.execPath, VERIFIER];
  if (!GENERATED.some((name) => target === path.join(project, name))) command.push("--fix");
  const result = spawnSync(command[0], command.slice(1), { cwd: project, encoding: "utf8" });
  if (result.error) {
    console.error(`cpt-verify-docs: could not run the verifier: ${result.error.message}`);
    return 1;
  }
  if (result.status === VERIFY_ERRORS) {
    console.error("verify-docs.mjs found errors in docs/ — fix them before moving on:");
    console.error((result.stdout ?? "") + (result.stderr ?? ""));
    return 2;
  }
  return 0;
}

process.exitCode = main();
