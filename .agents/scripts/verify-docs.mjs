#!/usr/bin/env node
/**
 * Verify the CPT doc set against the contracts in .agents/rules/02-docs-navigation.md.
 *
 * Usage: node .agents/scripts/verify-docs.mjs [--docs DIR] [--strict] [--fix] [--time]
 *
 *   --fix     regenerate every generated block (<!-- cpt:<kind> --> … <!-- /cpt:<kind> -->) before checking
 *   --strict  treat warnings as errors
 *   --time    report wall-clock runtime on stderr as `verify-docs: <seconds>s`; stdout is unchanged and the exit code
 *             does not move, so the hook and CI can watch the 2.0 s budget (NFR-09) without parsing the report
 *
 * Exit codes: 0 = no errors, 1 = errors found (or warnings with --strict), 2 = docs directory not found.
 * Node standard library only.
 *
 * This is a byte-for-byte port of verify-docs.py (US-NOD-002). The message strings, the order findings are produced
 * in, and the bytes `--fix` writes are frozen by tests/parity/golden/ — do not "improve" them.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const STORY_STATUSES = ["done", "in-progress", "ready", "blocked", "draft", "closed"]; // order used in stats
const PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const SIZES = new Set(["S", "M", "L"]);
// A skill is loaded whole into an agent's context. 1800 words is the ceiling that keeps the biggest one (cpt-release,
// 1663 words at 2.3.0) from crowding out the task it was loaded for; see NFR-09's sibling in conventions.md.
export const SKILL_WORDS_BUDGET = 1800;

const SIZE_DAYS = new Map([["S", 1.0], ["M", 2.5], ["L", 4.5]]); // story-days per size, the delivery plan's only source
const OQ_STATUSES = new Set(["open", "answered", "withdrawn"]);
const OQ_REQUIRED_FIELDS = ["Status", "Raised", "Blocks", "Assumption", "Answer"];
const ADR_STATUSES = new Set(["proposed", "accepted", "superseded", "deprecated"]);
const TIERS = new Set(["lite", "standard", "full"]);
const RELEASE_ENVIRONMENTS = new Set(["staging", "production"]);
const RELEASE_STATUSES = new Set(["planned", "deployed", "rolled-back"]);
const RELEASE_REQUIRED = ["id", "version", "date", "environment", "status", "previous", "stories"];
const RELEASE_SECTIONS = ["Included stories", "Changes", "Migrations", "Pre-release gates", "Deployment",
    "Post-deploy checks", "Rollback"];
const INCIDENT_SEVERITIES = new Set(["SEV1", "SEV2", "SEV3", "SEV4"]);
const INCIDENT_STATUSES = new Set(["open", "mitigated", "resolved", "closed"]);
const INCIDENT_REQUIRED = ["id", "title", "severity", "status", "detected"];
const INCIDENT_SECTIONS = ["Impact", "Timeline", "Mitigation", "Root cause", "Detection", "Actions"];
const SIGN_OFF_STATUSES = new Set(["pending", "signed", "waived"]);
// ADR-0004: an independent acceptance is a review file in 05-quality/reviews/, with these fields and sections.
const REVIEW_SECTIONS = ["Scope", "What was checked", "Findings", "Verdict"];
const REVIEW_ACCEPTS = new Set(["accept", "accepted", "accept-with-findings", "accept with findings"]);
const SIGN_OFF_GATES = ["G1", "G2", "G3", "G4"];
const SIGN_OFF_COLUMNS = ["Gate", "Criterion", "Evidence", "Status", "Signed by", "Role", "Date", "Note"];
const PACK_PREFIX = "cpt-stack-";
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const COMMIT_RE = /^[0-9a-f]{7,40}$/i;
const COMMAND_RE = /`([^`\n]{1,200})`/;
// A span is a command when its first word is one of the runners a reader is meant to type.
const COMMAND_PREFIXES = ["python3 ", "python ", "node ", "./install.sh", "bash ", "git ", "pytest", "npm ", "npx "];
// Current-state prose: the files where a repeated command is drift. The record directories (00-source, 03-stories,
// 04-decisions, 05-quality, 06-reports, 07-release) are excluded on purpose — a record keeps the command it ran, forever.
const IN_SCOPE_DOC_FILES = ["README.md", "01-overview", "02-reference", "08-ops"];

const TC_RE = /\bTC-[A-Z]{2,6}-\d{3}\b/;
const TC_ROW_RE = /^\|\s*(TC-[A-Z]{2,6}-\d{3})\s*\|\s*(US-[A-Z]+-\d{3})\s*\|\s*([^|]*)\|/m;
const GAP_ROW_RE = /^\|\s*(US-[A-Z]+-\d{3})\s*\|\s*(AC\d+)\s*\|\s*([^|]*)\|/m;
const AC_ROW_RE = /^\|\s*(AC\d+)\s*\|/m;
const AC_CELL_RE = /AC(\d+)(?:\s*[\u2013\u2014-]\s*AC?(\d+))?/;
const PROJECT_TYPES = new Set([
    "web-app", "api-service", "mobile-app", "cli-tool",
    "library", "data-ml", "integration", "desktop-app",
]);
const STORY_REQUIRED = ["id", "title", "epic", "status", "priority", "size", "depends_on", "open_questions"];
const STORY_LISTS = ["depends_on", "open_questions", "accepted_assumptions", "refs"];
const FINISHED = new Set(["done", "closed"]);

const EPIC_DIR_RE = /^EPIC-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EPIC_CODE_RE = /^[A-Z]{2,6}$/;
const STORY_ID_RE = /^US-([A-Z]{2,6})-\d{3}$/;
const STORY_FILE_RE = /^(US-[A-Z]{2,6}-\d{3})(?:-[a-z0-9-]+)?\.md$/;
const ADR_FILE_RE = /^(ADR-\d{4})(?:-[a-z0-9-]+)?\.md$/;
const RELEASE_FILE_RE = /^(REL-\d{3})(?:-[a-z0-9-]+)?\.md$/;
const INCIDENT_FILE_RE = /^(INC-\d{3})(?:-[a-z0-9-]+)?\.md$/;
const OQ_HEADING_RE = /^##\s+(OQ-\d{2,})\b\s*(?:[—–-]\s*)?(.*)$/;
const OQ_FIELD_RE = /^-\s+\*\*([A-Za-z][A-Za-z ]*)\*\*:\s*(.*)$/;
const LINK_RE = /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/;
const MENTION_RE = /\b(US-[A-Z]{2,6}-\d{3}|OQ-\d{2,}|ADR-\d{4}|REL-\d{3}|INC-\d{3})\b/;
const ASSUMPTION_TAG_RE = /\[assumption:\s*(OQ-\d{2,})\]/;
const PACK_REF_RE = /cpt-stack-([a-z0-9]+(?:-[a-z0-9]+)*)/;
const NFR_RE = /\bNFR-\d{2,}\b/;
// Something a reference contract can be checked against: a test-case id, a path under tests/, a test file name, or a
// test runner command. Table separators and header cells are checked separately (ORACLE_COLUMN_RE).
const ORACLE_RE = new RegExp(
    "\\bTC-[A-Z]{2,6}-\\d{3}\\b"
    + "|\\btests?/[\\w./-]+"
    + "|\\b(?:test_[\\w]+|[\\w-]+_(?:test|spec))\\.(?:py|js|ts|tsx|jsx|go|rs|java|kt|rb|php|cs|swift)\\b"
    + "|\\b(?:pytest|npm (?:run )?test|yarn test|go test|cargo test|dotnet test|phpunit|rspec|swift test|mvn test)\\b"
);
const ORACLE_COLUMN_RE = /^\|\s*(?:oracle|checked by|test|tests)\s*\|/im;
// The verifier's own separator: loose on purpose (the stricter first definition in the Python module is replaced).
const TABLE_SEPARATOR_RE = /^\|?[\s:|-]+\|?$/;
// Template placeholders look like `<capability>` or `<What problem, for whom>`: '<' at a word boundary, a letter first,
// and no characters that occur in comparisons, generics after a word, e-mails, or URLs.
const PLACEHOLDER_RE = /(?:^|(?<=[\s(|]))<([A-Za-z][^<>@=:/\n]*)>/;
const EMPTY_FIELD_RE = /^-\s+\*\*[^*]+\*\*:\s*$/;
const BLOCK_RE = /(<!-- cpt:([a-z-]+) -->[ \t]*\r?\n)(.*?)(<!-- \/cpt:\2 -->)/sd;
const BLOCK_MARKER_RE = /<!-- (\/?)cpt:([a-z-]+) -->/;
const FENCE_RE = /^\s*(`{3,}|~{3,})(.*)$/;
const INLINE_CODE_RE = /`[^`]*`/;
const HTML_COMMENT_RE = /<!--.*?-->/s;
const NO_ANSWER = new Set(["", "—", "-", "none"]);

// --------------------------------------------------------------------------- python-compatible primitives

const PY_WS_CLASS = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_WS_START = new RegExp(`^[${PY_WS_CLASS}]+`);
const PY_WS_END = new RegExp(`[${PY_WS_CLASS}]+$`);
const PY_WS_SPLIT = new RegExp(`[${PY_WS_CLASS}]+`);

/** str.strip() with no argument: Python's whitespace set, not JavaScript's. */
export function pyStrip(text) {
    return text.replace(PY_WS_START, "").replace(PY_WS_END, "");
}

export function pyLstrip(text) {
    return text.replace(PY_WS_START, "");
}

/** str.split() with no argument. */
export function pySplitWs(text) {
    return text.split(PY_WS_SPLIT).filter((item) => item !== "");
}

/** str.splitlines(): \n, \r\n, \r, \v, \f, \x1c, \x1d, \x1e, \x85, \u2028 and \u2029 all end a line. */
export function splitLines(text, keepends = false) {
    const separator = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/g;
    const out = [];
    let last = 0;
    for (const match of text.matchAll(separator)) {
        const end = keepends ? match.index + match[0].length : match.index;
        out.push(text.slice(last, end));
        last = match.index + match[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}

/** Python string ordering compares code points; JavaScript's < compares UTF-16 code units. */
export function cmpStr(a, b) {
    if (a === b) return 0;
    const left = Array.from(a);
    const right = Array.from(b);
    const count = Math.min(left.length, right.length);
    for (let i = 0; i < count; i += 1) {
        const ca = left[i].codePointAt(0);
        const cb = right[i].codePointAt(0);
        if (ca !== cb) return ca < cb ? -1 : 1;
    }
    if (left.length === right.length) return 0;
    return left.length < right.length ? -1 : 1;
}

function sortedStrings(values) {
    return [...values].sort(cmpStr);
}

/** str(value) as an f-string renders it: None, True/False, and list repr for containers. */
function pyStr(value) {
    if (value === undefined || value === null) return "None";
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return value ? "True" : "False";
    if (typeof value === "number") return String(value);
    if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
    return String(value);
}

function pyRepr(value) {
    if (typeof value === "string") {
        return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
    }
    return pyStr(value);
}

function globalClone(re) {
    return new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
}

function findAll(re, text) {
    return [...text.matchAll(globalClone(re))];
}

function subAll(re, replacement, text) {
    return text.replace(globalClone(re), replacement);
}

function escapeRe(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function capitalize(text) {
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function stripChars(text, chars) {
    let out = text;
    let start = 0;
    while (start < out.length && chars.includes(out[start])) start += 1;
    out = out.slice(start);
    let end = out.length;
    while (end > 0 && chars.includes(out[end - 1])) end -= 1;
    return out.slice(0, end);
}

function isBlank(value) {
    // Python's `value or ""`: an empty list or object is falsy there, while [] and {} are truthy in JS. An empty
    // frontmatter field parses to [], so without this `approved_by:` would not read as blank.
    const nothing = value === undefined || value === null || value === false || value === 0
        || (Array.isArray(value) && value.length === 0)
        || (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
    const text = pyStrip(nothing ? "" : pyStr(value));
    return ["", "—", "-", "none", "tbd", "TBD", '""'].includes(text) || text.toLowerCase().startsWith("<");
}

function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1 || year > 9999 || month < 1 || month > 12) return false;
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    return day >= 1 && day <= days;
}

/** urllib.parse.unquote(): %XX bytes decoded as UTF-8, invalid sequences replaced, '+' untouched. */
function unquote(text) {
    if (!text.includes("%")) return text;
    const chunks = [];
    let literal = "";
    for (let i = 0; i < text.length; i += 1) {
        if (text[i] === "%" && i + 2 < text.length && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
            if (literal) {
                chunks.push(Buffer.from(literal, "utf8"));
                literal = "";
            }
            chunks.push(Buffer.from([parseInt(text.slice(i + 1, i + 3), 16)]));
            i += 2;
        } else {
            literal += text[i];
        }
    }
    if (literal) chunks.push(Buffer.from(literal, "utf8"));
    return Buffer.concat(chunks).toString("utf8");
}

// --------------------------------------------------------------------------- paths and files

/** Path.resolve(): realpath the deepest existing ancestor, keep the rest lexical. */
function resolvePath(target) {
    const absolute = path.resolve(target);
    const tail = [];
    let current = absolute;
    for (;;) {
        try {
            return path.join(fs.realpathSync.native(current), ...tail);
        } catch {
            const parent = path.dirname(current);
            if (parent === current) return absolute;
            tail.unshift(path.basename(current));
            current = parent;
        }
    }
}

function isUnder(target, base) {
    if (target === base) return true;
    const rel = path.relative(base, target);
    return rel !== "" && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/** str(path.relative_to(root)), falling back to the absolute path as Python does. */
function relativeTo(target, root) {
    const rel = path.relative(root, target);
    if (rel === "") return ".";
    if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return target;
    return rel.split(path.sep).join("/");
}

function exists(target) {
    try {
        fs.statSync(target);
        return true;
    } catch {
        return false;
    }
}

function isFile(target) {
    try {
        return fs.statSync(target).isFile();
    } catch {
        return false;
    }
}

function isDir(target) {
    try {
        return fs.statSync(target).isDirectory();
    } catch {
        return false;
    }
}

function readdirNames(directory) {
    try {
        return fs.readdirSync(directory);
    } catch {
        return [];
    }
}

/** Path.glob("<prefix>*<suffix>") in one directory, sorted like Python (by the full path string). */
function globDir(directory, namePattern) {
    return readdirNames(directory)
        .filter((name) => namePattern.test(name))
        .map((name) => path.join(directory, name))
        .sort(cmpStr);
}

/** Path.rglob("*.md"): recursive, symlinked directories are not followed, results sorted. */
function rglobDir(directory, namePattern) {
    const out = [];
    const walk = (current) => {
        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (namePattern.test(entry.name)) {
                out.push(full);
            }
        }
    };
    walk(directory);
    return out.sort(cmpStr);
}

/** Path.read_text(encoding="utf-8-sig", errors="replace"). */
function readText(target) {
    let text = fs.readFileSync(target).toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return text;
}

function hasUtf8Bom(buffer) {
    return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

// --------------------------------------------------------------------------- regex helpers on lines

function fenceMask(lines) {
    const mask = [];
    let opener = null;
    for (const rawLine of lines) {
        // splitLines(keepends=true) hands us lines with their terminator; Python's FENCE_RE relies on `$` matching
        // before it. Strip it here so both callers behave the same.
        const line = rawLine.replace(/[\r\n\v\f\x1c\x1d\x1e\x85\u2028\u2029]+$/u, "");
        const fence = FENCE_RE.exec(line);
        if (opener === null) {
            if (fence && !(fence[1][0] === "`" && fence[2].includes("`"))) opener = fence[1]; // ```a``` is inline code
            mask.push(opener !== null);
            continue;
        }
        mask.push(true);
        if (fence && fence[1][0] === opener[0] && fence[1].length >= opener.length && pyStrip(fence[2]) === "") {
            opener = null;
        }
    }
    return mask;
}

/** [line_number, line] outside fenced code blocks, with inline code and HTML comments removed. */
function proseLines(text) {
    const cleaned = subAll(HTML_COMMENT_RE, (match) => "\n".repeat((match[0].match(/\n/g) || []).length), text);
    const lines = splitLines(cleaned);
    const mask = fenceMask(lines);
    const out = [];
    for (let i = 0; i < lines.length; i += 1) {
        if (!mask[i]) out.push([i + 1, subAll(INLINE_CODE_RE, "", lines[i])]);
    }
    return out;
}

/** Every inline-code span that starts with a runnable command, outside fenced blocks. */
function commandSpans(text) {
    const lines = splitLines(text);
    const mask = fenceMask(lines);
    const spans = [];
    for (let i = 0; i < lines.length; i += 1) {
        if (mask[i]) continue;
        for (const match of findAll(COMMAND_RE, lines[i])) {
            const command = pySplitWs(match[1]).join(" ");
            if (COMMAND_PREFIXES.some((prefix) => command.startsWith(prefix))) spans.push(command);
        }
    }
    return spans;
}

function githubSlug(heading) {
    let text = pyStrip(heading).toLowerCase();
    text = subAll(/<[^>]+>/, "", text);
    text = subAll(/\[([^\]]*)\]\([^)]*\)/, "$1", text);
    text = subAll(/[^\p{L}\p{N}_\- ]/gu, "", text); // keeps letters, digits, '_', '-', spaces — as GitHub does
    return text.replace(/ /g, "-");
}

function headingAnchors(target) {
    const anchors = new Set();
    const counts = new Map();
    const lines = splitLines(readText(target));
    const mask = fenceMask(lines);
    for (let i = 0; i < lines.length; i += 1) {
        if (mask[i]) continue;
        const match = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(lines[i]);
        if (!match) continue;
        const slug = githubSlug(match[2]);
        const seen = counts.get(slug) ?? 0;
        anchors.add(seen === 0 ? slug : `${slug}-${seen}`);
        counts.set(slug, seen + 1);
    }
    return anchors;
}

function sectionText(text, heading) {
    const match = new RegExp(`^##\\s+${escapeRe(heading)}\\s*$`, "m").exec(text);
    if (!match) return "";
    const rest = text.slice(match.index + match[0].length);
    const following = /^##\s+/m.exec(rest);
    return following ? rest.slice(0, following.index) : rest;
}

function numberedSection(text, number) {
    const match = new RegExp(`^##\\s*${number}\\.\\s*\\S.*$`, "m").exec(text);
    if (!match) return "";
    const rest = text.slice(match.index + match[0].length);
    const following = /^##\s+/m.exec(rest);
    return following ? rest.slice(0, following.index) : rest;
}

function storyAcIds(text) {
    return findAll(AC_ROW_RE, numberedSection(text, 3)).map((match) => match[1]);
}

function storyRedLine(text) {
    for (const line of splitLines(numberedSection(text, 8))) {
        // the convention writes the marker bold ("- **Red:** …"), so drop the bullet and the emphasis first
        const marker = pyStrip(pyStrip(line).replace(/^[-*]+/, "")).replace(/\*\*/g, "");
        const match = /^red:\s*(?<rest>.*)$/i.exec(marker);
        if (match) return pyStrip(match.groups.rest.replace(/`/g, ""));
    }
    return null;
}

function redTestIds(line) {
    const ids = [];
    // `.py[::Class.method]`, `.mjs[::case name]`, `.ts[::case name]`: a story must be able to name the test file of
    // whatever runner the project uses, and a TypeScript project is as valid as a Python or a Node one.
    for (const match of findAll(/(tests\/[A-Za-z0-9_.\/-]+\.(?:py|mjs|js|mts|cts|tsx|ts))(?:::(?<qual>[A-Za-z0-9_ .,>'-]+))?/, line.replace(/`/g, ""))) {
        if (!ids.includes(match[0])) ids.push(match[0]);
    }
    return ids;
}

/**
 * Resolve the file a `tests/…` id names. A story writes the id the convention documents (`tests/core/x.test.ts`),
 * but a workspace keeps its suites next to the package that owns them (`packages/core/tests/x.test.ts`,
 * `apps/worker/tests/x.test.ts`), so the id is accepted when some real file *ends with* it.
 */
function resolveTestFile(root, pathPart) {
    const direct = path.join(root, pathPart);
    if (isFile(direct)) return direct;
    const wanted = `/${pathPart}`;
    const stack = [path.join(root, "apps"), path.join(root, "packages"), path.join(root, "tests")];
    while (stack.length > 0) {
        const dir = stack.pop();
        if (!isDir(dir)) continue;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
            const child = path.join(dir, entry.name);
            if (entry.isDirectory()) stack.push(child);
            else if (child.endsWith(wanted)) return child;
        }
    }
    return null;
}

function testExists(root, testId) {
    const split = testId.indexOf("::");
    const pathPart = split >= 0 ? testId.slice(0, split) : testId;
    const qualifier = split >= 0 ? testId.slice(split + 2) : "";
    const target = resolveTestFile(root, pathPart);
    if (target === null) return false;
    if (!qualifier) return true;
    const text = readText(target);
    if (/\.(?:mjs|js|mts|cts|tsx|ts)$/.test(target)) {
        // A node:test case is registered by name, so the name must appear as a string literal.
        return text.includes(`"${qualifier}"`) || text.includes(`'${qualifier}'`);
    }
    const dot = qualifier.lastIndexOf(".");
    const klass = dot >= 0 ? qualifier.slice(0, dot) : "";
    const method = dot >= 0 ? qualifier.slice(dot + 1) : qualifier;
    if (klass && !new RegExp(`^class\\s+${escapeRe(klass)}\\b`, "m").test(text)) return false;
    return new RegExp(`^\\s*def\\s+${escapeRe(method)}\\s*\\(`, "m").test(text);
}

function expandAcCell(cell) {
    const result = new Set();
    for (const match of findAll(AC_CELL_RE, cell)) {
        const first = parseInt(match[1], 10);
        const last = match[2] ? parseInt(match[2], 10) : first;
        if (last >= first) {
            for (let n = first; n <= Math.min(last, first + 50); n += 1) result.add(`AC${n}`);
        }
    }
    return result;
}

function parseTestCases(text) {
    const covered = new Map();
    for (const match of findAll(TC_ROW_RE, text)) {
        if (!covered.has(match[2])) covered.set(match[2], new Set());
        for (const ac of expandAcCell(match[3])) covered.get(match[2]).add(ac);
    }
    const gaps = findAll(GAP_ROW_RE, sectionText(text, "Known gaps"))
        .map((match) => [match[1], match[2], pyStrip(match[3])]);
    return [covered, gaps];
}

// --------------------------------------------------------------------------- parsing

function scalar(raw) {
    const value = pyStrip(raw);
    const quoted = /^(["'])(.*?)\1\s*(?:#.*)?$/.exec(value);
    if (quoted) return quoted[2];
    return pyStrip(subAll(/\s+#.*$/, "", value));
}

function isOneOf(value, allowed) {
    return typeof value === "string" && (allowed instanceof Set ? allowed.has(value) : allowed.includes(value));
}

function inlineList(raw) {
    const inner = subAll(/\s+#.*$/, "", pyStrip(raw)).slice(1, -1);
    return inner.split(",").filter((item) => pyStrip(item) !== "").map((item) => scalar(item));
}

/** A minimal YAML subset: `key: value`, `key: [a, b]`, and `key:` followed by `- item` lines. */
export function parseFrontmatter(text) {
    const lines = splitLines(text);
    if (!lines.length || pyStrip(lines[0]) !== "---") return null;
    let end = -1;
    for (let i = 1; i < lines.length; i += 1) {
        if (pyStrip(lines[i]) === "---") {
            end = i;
            break;
        }
    }
    if (end < 0) return null;

    const meta = new Map();
    let currentListKey = null;
    for (const line of lines.slice(1, end)) {
        if (!pyStrip(line) || pyLstrip(line).startsWith("#")) continue;
        const item = /^\s*-\s+(.*)$/.exec(line);
        if (item && currentListKey !== null) {
            meta.set(currentListKey, [...meta.get(currentListKey), scalar(item[1])]);
            continue;
        }
        const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
        if (!pair) continue;
        const key = pair[1];
        const raw = pair[2];
        const stripped = pyStrip(subAll(/\s+#.*$/, "", raw));
        if (stripped === "") {
            meta.set(key, []);
            currentListKey = key;
        } else if (stripped.startsWith("[") && stripped.endsWith("]")) {
            meta.set(key, inlineList(stripped));
            currentListKey = null;
        } else {
            meta.set(key, scalar(raw));
            currentListKey = null;
        }
    }
    return meta;
}

/** A frontmatter value as a list: lists as-is, a non-empty scalar as one item, anything else empty. */
function asList(value) {
    if (Array.isArray(value)) return value;
    return typeof value === "string" && value ? [value] : [];
}

function listOf(meta, key) {
    const value = meta.get(key);
    return Array.isArray(value) ? value : [];
}

function fenceSpans(text) {
    const spans = [];
    let offset = 0;
    let start = null;
    const lines = splitLines(text, true);
    const mask = fenceMask(lines);
    for (let i = 0; i < lines.length; i += 1) {
        if (mask[i] && start === null) start = offset;
        else if (!mask[i] && start !== null) {
            spans.push([start, offset]);
            start = null;
        }
        offset += lines[i].length;
    }
    if (start !== null) spans.push([start, offset]);
    return spans;
}

function inSpans(position, spans) {
    return spans.some(([start, end]) => start <= position && position < end);
}

function blankSpans(text, spans) {
    let out = text;
    for (const [start, end] of spans) {
        out = out.slice(0, start) + out.slice(start, end).replace(/[^\r\n]/g, " ") + out.slice(end);
    }
    return out;
}

function isBriefContent(line, nextLine) {
    const stripped = pyStrip(line);
    if (!stripped || stripped.startsWith("#") || stripped.startsWith(">") || /^\*\*[^*]+\*\*$/.test(stripped)) {
        return false;
    }
    if (stripped.startsWith("|")) {
        if (TABLE_SEPARATOR_RE.test(stripped) || TABLE_SEPARATOR_RE.test(pyStrip(nextLine) || "x")) {
            return false; // separator row, or header row (followed by a separator)
        }
        return subAll(/[|\s]/, "", stripped) !== "";
    }
    return !EMPTY_FIELD_RE.test(stripped);
}

function docSections(text) {
    const result = new Map();
    let current = null;
    for (const [, line] of proseLines(text)) {
        if (line.startsWith("## ")) {
            current = pyStrip(line.slice(3));
            if (!result.has(current)) result.set(current, []);
            continue;
        }
        if (current !== null) result.get(current).push(line);
    }
    return result;
}

function sectionHasContent(lines) {
    for (let index = 0; index < lines.length; index += 1) {
        const nextLine = index + 1 < lines.length ? lines[index + 1] : "";
        if (["—", "-", "_not applicable_"].includes(pyStrip(lines[index]))) continue;
        if (isBriefContent(lines[index], nextLine)) return true;
    }
    return false;
}

function tableRows(lines) {
    const rows = [];
    let seenSeparator = false;
    for (const line of lines) {
        const stripped = pyStrip(line);
        if (!stripped.startsWith("|")) {
            if (rows.length) break;
            continue;
        }
        if (TABLE_SEPARATOR_RE.test(stripped)) {
            seenSeparator = true;
            continue;
        }
        if (!seenSeparator) continue; // header
        rows.push(stripped.replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((cell) => pyStrip(cell)));
    }
    return rows;
}

function table(header, rows) {
    const lines = [`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`];
    lines.push(...rows.map((row) => `| ${row.map((cell) => cell.replace(/\|/g, "\\|")).join(" | ")} |`));
    return `${lines.join("\n")}\n`;
}

function hasTable(text) {
    const lines = splitLines(text);
    const fenced = fenceMask(lines);
    for (let index = 0; index < lines.length - 1; index += 1) {
        if (fenced[index] || !pyLstrip(lines[index]).startsWith("|")) continue;
        if (!fenced[index + 1] && TABLE_SEPARATOR_RE.test(pyStrip(lines[index + 1]))) return true;
    }
    return false;
}

function skillFiles(docs) {
    const directory = path.join(docs, "..", ".agents", "skills");
    const files = [];
    for (const name of readdirNames(directory)) {
        const candidate = path.join(directory, name, "SKILL.md");
        if (exists(candidate)) files.push(candidate);
    }
    return files.sort(cmpStr);
}

function linkTo(fromFile, toFile, anchor = "") {
    const rel = path.relative(path.dirname(fromFile), toFile).split(path.sep).join("/");
    return anchor ? `${rel}#${anchor}` : rel;
}

// --------------------------------------------------------------------------- data

class Finding {
    constructor(level, target, message) {
        this.level = level; // "error" | "warning"
        this.path = target;
        this.message = message;
    }

    render() {
        return `${this.level.toUpperCase().padEnd(7)} ${this.path}: ${this.message}`;
    }
}

export class Story {
    constructor(id, target, meta) {
        this.id = id;
        this.path = target;
        this.meta = meta;
    }

    get status() {
        const value = this.meta.get("status");
        return typeof value === "string" ? value : "";
    }
}

class Question {
    constructor(id, title, heading, line, fields = new Map()) {
        this.id = id;
        this.title = title;
        this.heading = heading; // raw heading text, for the GitHub anchor
        this.line = line;
        this.fields = fields;
    }

    get status() {
        return this.fields.get("Status") ?? "";
    }

    get isOpen() {
        return this.status === "open";
    }
}

class Release {
    constructor(id, target, meta) {
        this.id = id;
        this.path = target;
        this.meta = meta;
    }

    get status() {
        const value = this.meta.get("status");
        return typeof value === "string" ? value : "";
    }

    get version() {
        const value = this.meta.get("version");
        return typeof value === "string" ? value : "";
    }
}

/** Renders the content of generated blocks from the parsed doc set. */
export class Generator {
    constructor(stories, questions, epics, oqFile, releases = new Map()) {
        this.stories = stories;
        this.questions = questions;
        this.epics = epics;
        this.oqFile = oqFile;
        this.releases = releases;
    }

    blocking() {
        const result = new Map();
        for (const story of [...this.stories.values()].sort((a, b) => cmpStr(a.id, b.id))) {
            if (story.status !== "blocked") continue;
            for (const oq of listOf(story.meta, "open_questions")) {
                if (this.questions.has(oq) && this.questions.get(oq).isOpen) {
                    if (!result.has(oq)) result.set(oq, []);
                    result.get(oq).push(story.id);
                }
            }
        }
        return result;
    }

    oqCounts() {
        const statuses = [...this.questions.values()].map((question) => question.status);
        const count = (status) => statuses.filter((value) => value === status).length;
        return `**Open: ${count("open")} · Blocking: ${this.blocking().size} · `
            + `Answered: ${count("answered")} · Withdrawn: ${count("withdrawn")}**`;
    }

    stats() {
        const counts = STORY_STATUSES.map((status) => String(
            [...this.stories.values()].filter((story) => story.status === status).length,
        ));
        const header = ["Stories", ...STORY_STATUSES.map((status) => capitalize(status.replace(/-/g, " ")))];
        return `${table(header, [[String(this.stories.size), ...counts]])}\nOpen questions: ${this.oqCounts()}\n`;
    }

    epicsTable(target) {
        const rows = [];
        for (const epic of this.epics) {
            const own = [...this.stories.values()].filter((story) => story.meta.get("epic") === epic.name);
            const done = own.filter((story) => story.status === "done").length;
            const blocked = own.filter((story) => story.status === "blocked").length;
            rows.push([`[${epic.name}](${linkTo(target, epic.path)})`, epic.code, epic.title,
                String(own.length), String(done), String(blocked)]);
        }
        return table(["Epic", "Code", "Title", "Stories", "Done", "Blocked"], rows);
    }

    epicStories(target) {
        const epicName = path.basename(path.dirname(target));
        const rows = [];
        for (const story of [...this.stories.values()].sort((a, b) => cmpStr(a.id, b.id))) {
            if (story.meta.get("epic") !== epicName) continue;
            const deps = listOf(story.meta, "depends_on").join(", ") || "—";
            rows.push([`[${story.id}](${linkTo(target, story.path)})`, pyStr(story.meta.get("title") ?? ""),
                pyStr(story.meta.get("priority") ?? ""), pyStr(story.meta.get("size") ?? ""), story.status, deps]);
        }
        return table(["Id", "Title", "Priority", "Size", "Status", "Depends on"], rows);
    }

    epicWaves() {
        const epicOf = new Map();
        for (const story of this.stories.values()) epicOf.set(story.id, pyStr(story.meta.get("epic") ?? ""));
        const needs = new Map();
        for (const epic of this.epics) needs.set(epic.name, new Set());
        for (const story of this.stories.values()) {
            const epic = epicOf.get(story.id) ?? "";
            if (!needs.has(epic)) continue;
            for (const dependency of listOf(story.meta, "depends_on")) {
                const other = epicOf.get(dependency) ?? "";
                if (other && other !== epic) needs.get(epic).add(other);
            }
        }
        const waves = new Map();
        for (const name of needs.keys()) waves.set(name, 1);
        for (let round = 0; round < needs.size + 1; round += 1) {
            let changed = false;
            for (const [name, dependencies] of needs) {
                const linked = [...dependencies].filter((dep) => waves.has(dep)).map((dep) => waves.get(dep) + 1);
                const wanted = linked.length ? Math.max(...linked) : 1;
                if (wanted > waves.get(name)) {
                    waves.set(name, wanted);
                    changed = true;
                }
            }
            if (!changed) break;
        }
        return waves;
    }

    skillBudget() {
        const docs = path.dirname(path.dirname(this.oqFile));
        const counts = skillFiles(docs).map((target) => [path.basename(path.dirname(target)),
            pySplitWs(fs.readFileSync(target).toString("utf8")).length]);
        counts.sort((a, b) => (a[1] !== b[1] ? b[1] - a[1] : cmpStr(a[0], b[0])));
        const rows = counts.map(([name, words]) => [name, String(words)]);
        rows.push(["**Total**", String(counts.reduce((sum, [, words]) => sum + words, 0))]);
        return `${table(["Skill", "Words"], rows)}\n`;
    }

    deliveryPlan(target) {
        const waves = this.epicWaves();
        const rows = [];
        const epics = [...this.epics].sort((a, b) => {
            const waveA = waves.get(a.name) ?? 1;
            const waveB = waves.get(b.name) ?? 1;
            return waveA !== waveB ? waveA - waveB : cmpStr(a.name, b.name);
        });
        const days = (story) => SIZE_DAYS.get(pyStr(story.meta.get("size") ?? "")) ?? 0.0;
        for (const epic of epics) {
            const own = [...this.stories.values()].filter((story) => story.meta.get("epic") === epic.name);
            const total = own.reduce((sum, story) => sum + days(story), 0);
            const finished = own.filter((story) => FINISHED.has(story.status)).length;
            rows.push([`[${epic.name}](${linkTo(target, epic.path)})`, String(waves.get(epic.name) ?? 1),
                String(own.length), String(finished), total.toFixed(1)]);
        }
        const all = [...this.stories.values()];
        const totalDays = all.reduce((sum, story) => sum + days(story), 0);
        rows.push(["**Total**", "—", String(this.stories.size),
            String(all.filter((story) => FINISHED.has(story.status)).length), totalDays.toFixed(1)]);
        return table(["Epic", "Wave", "Stories", "Done", "Story-days"], rows);
    }

    oqSummary(target) {
        const blocking = this.blocking();
        const rows = [];
        const questions = [...this.questions.values()].sort((a, b) => parseInt(a.id.slice(3), 10) - parseInt(b.id.slice(3), 10));
        for (const question of questions) {
            const anchor = githubSlug(question.heading);
            rows.push([`[${question.id}](${linkTo(target, this.oqFile, anchor)})`, question.title,
                question.status, (blocking.get(question.id) ?? []).join(", ") || "—"]);
        }
        return `${this.oqCounts()}\n\n${table(["Id", "Question", "Status", "Blocking"], rows)}`;
    }

    releasesTable(target) {
        const rows = [];
        // newest first: the README says the newest deployed row is what a project can install
        const releases = [...this.releases.values()]
            .sort((a, b) => parseInt(b.id.slice(4), 10) - parseInt(a.id.slice(4), 10));
        for (const release of releases) {
            rows.push([`[${release.id}](${linkTo(target, release.path)})`, release.version,
                pyStr(release.meta.get("date") ?? ""), pyStr(release.meta.get("environment") ?? ""),
                release.status, String(listOf(release.meta, "stories").length)]);
        }
        return table(["Release", "Version", "Date", "Environment", "Status", "Stories"], rows);
    }

    render(kind, target) {
        const renderers = {
            stats: "stats",
            epics: "epicsTable",
            "epic-stories": "epicStories",
            "oq-summary": "oqSummary",
            releases: "releasesTable",
            delivery: "deliveryPlan",
            skills: "skillBudget",
        };
        const renderer = renderers[kind];
        return renderer ? this[renderer](target) : null;
    }
}

// --------------------------------------------------------------------------- checks

export class Verifier {
    constructor(docs) {
        this.docs = docs;
        this.root = path.dirname(docs);
        this.findings = [];
        this.epics = [];
    }

    rel(target) {
        return relativeTo(target, this.root);
    }

    error(target, message) {
        this.findings.push(new Finding("error", this.rel(target), message));
    }

    warn(target, message) {
        this.findings.push(new Finding("warning", this.rel(target), message));
    }

    get oqFile() {
        return path.join(this.docs, "04-decisions", "open-questions.md");
    }

    // -- open questions ----------------------------------------------------

    parseQuestions() {
        const target = this.oqFile;
        if (!exists(target)) return new Map();
        const questions = new Map();
        let current = null;
        const text = readText(target);
        const rawLines = splitLines(text);
        for (const [number, line] of proseLines(text)) {
            const heading = OQ_HEADING_RE.exec(line);
            if (heading) {
                const oqId = heading[1];
                if (questions.has(oqId)) this.error(target, `line ${number}: duplicate question id ${oqId}`);
                const rawHeading = pyStrip(subAll(/^#+\s+/, "", rawLines[number - 1]));
                const rawTitle = subAll(/^OQ-\d+\s*(?:[—–-]\s*)?/, "", rawHeading);
                current = new Question(oqId, rawTitle, rawHeading, number);
                questions.set(oqId, current);
                continue;
            }
            if (line.startsWith("#")) {
                current = null;
                continue;
            }
            const field = OQ_FIELD_RE.exec(line);
            if (field && current) current.fields.set(pyStrip(field[1]), pyStrip(field[2]));
        }
        return questions;
    }

    checkQuestions(questions) {
        const target = this.oqFile;
        for (const question of questions.values()) {
            const where = `line ${question.line}: ${question.id}`;
            for (const name of OQ_REQUIRED_FIELDS) {
                if (!question.fields.has(name)) this.error(target, `${where} is missing the **${name}** field`);
            }
            if (question.fields.has("Status") && !OQ_STATUSES.has(question.status)) {
                this.error(target, `${where} has invalid status '${question.status}'`);
            }
            if (question.status === "answered" && NO_ANSWER.has((question.fields.get("Answer") ?? "").toLowerCase())) {
                this.error(target, `${where} is answered but **Answer** is empty`);
            }
        }
    }

    // -- ADRs --------------------------------------------------------------

    checkAdrs() {
        const adrDir = path.join(this.docs, "04-decisions", "adr");
        const ids = new Set();
        if (!isDir(adrDir)) return ids;
        for (const target of globDir(adrDir, /\.md$/)) {
            if (path.basename(target).toLowerCase() === "readme.md") continue;
            const match = ADR_FILE_RE.exec(path.basename(target));
            if (!match) {
                this.error(target, "ADR filename must be ADR-<nnnn>-<slug>.md");
                continue;
            }
            const adrId = match[1];
            if (ids.has(adrId)) this.error(target, `duplicate ADR id ${adrId}`);
            ids.add(adrId);
            const meta = parseFrontmatter(readText(target));
            if (meta === null) {
                this.error(target, "missing frontmatter");
                continue;
            }
            if (meta.get("id") !== adrId) {
                this.error(target, `frontmatter id '${pyStr(meta.get("id"))}' does not match filename (${adrId})`);
            }
            if (!isOneOf(meta.get("status"), ADR_STATUSES)) {
                this.error(target, `invalid status '${pyStr(meta.get("status"))}'`);
            }
            if (typeof meta.get("title") !== "string" || !meta.get("title")) {
                this.error(target, "frontmatter 'title' is missing or empty");
            }
            if (!validDate(meta.get("date"))) {
                this.error(target, `date '${pyStr(meta.get("date"))}' is not a valid YYYY-MM-DD date`);
            }
            for (const old of asList(meta.get("supersedes"))) {
                if (!/^ADR-\d{4}$/.test(old)) this.error(target, `supersedes entry '${old}' is not an ADR id`);
            }
        }
        return ids;
    }

    // -- epics and stories -------------------------------------------------

    parseEpic(epicDir, codes) {
        const readme = path.join(epicDir, "README.md");
        if (!exists(readme)) {
            this.error(epicDir, "epic directory has no README.md");
            return null;
        }
        const meta = parseFrontmatter(readText(readme)) ?? new Map();
        const code = meta.get("code");
        if (typeof code !== "string" || !EPIC_CODE_RE.test(code)) {
            this.error(readme, `frontmatter 'code' must be 2-6 uppercase letters, got '${pyStr(code)}'`);
            return null;
        }
        if (codes.has(code)) this.error(readme, `epic code ${code} already used by ${this.rel(codes.get(code))}`);
        codes.set(code, epicDir);
        const title = meta.get("title");
        this.epics.push({ name: path.basename(epicDir), code, title: typeof title === "string" ? title : "", path: readme });
        return code;
    }

    collectStories() {
        const storiesDir = path.join(this.docs, "03-stories");
        const stories = new Map();
        if (!isDir(storiesDir)) return stories;
        for (const stray of globDir(storiesDir, /^US-.*\.md$/)) {
            this.error(stray, "story must live inside an EPIC-<nn>-<slug> directory");
        }

        const codes = new Map();
        const epicDirs = readdirNames(storiesDir)
            .map((name) => path.join(storiesDir, name))
            .filter((target) => isDir(target))
            .sort(cmpStr);
        for (const epicDir of epicDirs) {
            if (!EPIC_DIR_RE.test(path.basename(epicDir))) {
                this.error(epicDir, "epic directory must be named EPIC-<nn>-<slug>");
                continue;
            }
            const code = this.parseEpic(epicDir, codes);
            for (const target of globDir(epicDir, /^US-.*\.md$/)) {
                const story = this.parseStory(target, path.basename(epicDir), code);
                if (story === null) continue;
                if (stories.has(story.id)) {
                    this.error(target, `duplicate story id ${story.id} (also ${this.rel(stories.get(story.id).path)})`);
                    continue;
                }
                stories.set(story.id, story);
            }
        }
        return stories;
    }

    parseStory(target, epicName, code) {
        const fileMatch = STORY_FILE_RE.exec(path.basename(target));
        if (!fileMatch) {
            this.error(target, "story filename must be US-<CODE>-<nnn>-<slug>.md");
            return null;
        }
        const meta = parseFrontmatter(readText(target));
        if (meta === null) {
            this.error(target, "missing frontmatter");
            return null;
        }

        for (const key of STORY_REQUIRED) {
            if (!meta.has(key)) this.error(target, `frontmatter missing '${key}'`);
        }
        const storyId = meta.get("id") ?? "";
        if (storyId !== fileMatch[1]) {
            this.error(target, `id '${pyStr(storyId)}' does not match filename (${fileMatch[1]})`);
        }
        const idMatch = STORY_ID_RE.exec(typeof storyId === "string" ? storyId : "");
        if (code && idMatch && idMatch[1] !== code) {
            this.error(target, `id code ${idMatch[1]} does not match epic code ${code}`);
        }
        if (meta.get("epic") !== epicName) {
            this.error(target, `epic '${pyStr(meta.get("epic"))}' does not match directory ${epicName}`);
        }
        this.checkEnum(target, meta, "status", STORY_STATUSES);
        this.checkEnum(target, meta, "priority", PRIORITIES);
        this.checkEnum(target, meta, "size", SIZES);
        const title = meta.get("title") ?? "";
        if (typeof title === "string" && title.endsWith(".")) {
            this.warn(target, "title should not end with a period");
        }
        for (const key of STORY_LISTS) {
            if (meta.has(key) && !Array.isArray(meta.get(key))) this.error(target, `'${key}' must be a list`);
        }
        return new Story(fileMatch[1], target, meta);
    }

    checkEnum(target, meta, key, allowed) {
        if (meta.has(key) && !isOneOf(meta.get(key), allowed)) {
            this.error(target, `${key} '${pyStr(meta.get(key))}' is not one of ${pyStr(sortedStrings(allowed))}`);
        }
    }

    checkStoryRelations(stories, questions) {
        for (const story of stories.values()) {
            this.checkDependencies(story, stories);
            this.checkStoryQuestions(story, questions);
            for (const ref of listOf(story.meta, "refs")) {
                if (!exists(path.join(this.docs, ref.split("#", 1)[0]))) {
                    this.error(story.path, `ref '${ref}' does not exist under docs/`);
                }
            }
        }
        this.checkCycles(stories);
    }

    checkDependencies(story, stories) {
        for (const dep of listOf(story.meta, "depends_on")) {
            if (dep === story.id) {
                this.error(story.path, "story depends on itself");
            } else if (!stories.has(dep)) {
                this.error(story.path, `depends_on ${dep} does not exist`);
            } else if (["in-progress", "done"].includes(story.status) && !FINISHED.has(stories.get(dep).status)) {
                this.error(story.path, `is ${story.status} but dependency ${dep} is '${stories.get(dep).status}'`);
            }
        }
    }

    checkStoryQuestions(story, questions) {
        const listed = listOf(story.meta, "open_questions");
        const accepted = listOf(story.meta, "accepted_assumptions");
        for (const oq of [...listed, ...accepted]) {
            if (!questions.has(oq)) this.error(story.path, `${oq} not found in 04-decisions/open-questions.md`);
        }
        const known = listed.filter((oq) => questions.has(oq));
        if (story.status === "blocked") {
            if (!listed.length) {
                this.error(story.path, "blocked story must list at least one open question");
            } else if (known.length && !known.some((oq) => questions.get(oq).isOpen)) {
                this.error(story.path, "is blocked but none of its open_questions is still open");
            }
        } else if (["ready", "in-progress", "done"].includes(story.status)) {
            for (const oq of known) {
                if (questions.get(oq).isOpen) {
                    this.error(story.path, `is ${story.status} but lists open question ${oq} — answer it, mark the `
                        + "story blocked, or move it to accepted_assumptions");
                } else {
                    this.warn(story.path, `${oq} is ${questions.get(oq).status}; remove it from open_questions`);
                }
            }
        }
        for (const oq of accepted) {
            if (questions.has(oq) && NO_ANSWER.has((questions.get(oq).fields.get("Assumption") ?? "").toLowerCase())) {
                this.error(story.path, `accepted assumption ${oq} has no **Assumption** recorded`);
            }
        }
    }

    checkCycles(stories) {
        const state = new Map(); // 1 = visiting, 2 = done

        const visit = (node, trail) => {
            if (state.get(node) === 2 || !stories.has(node)) return;
            if (state.get(node) === 1) {
                const cycle = [...trail.slice(trail.indexOf(node)), node].join(" -> ");
                this.error(stories.get(node).path, `dependency cycle: ${cycle}`);
                return;
            }
            state.set(node, 1);
            for (const dep of listOf(stories.get(node).meta, "depends_on")) visit(dep, [...trail, node]);
            state.set(node, 2);
        };

        for (const storyId of sortedStrings(stories.keys())) visit(storyId, []);
    }

    // -- brief and AGENTS.md -------------------------------------------------

    checkBrief() {
        const target = path.join(this.docs, "00-source", "brief.md");
        if (!exists(target)) return false;
        const text = readText(target);
        const meta = parseFrontmatter(text);
        if (meta === null) {
            this.error(target, "missing frontmatter");
            return false;
        }
        if (!isOneOf(meta.get("tier"), TIERS)) {
            this.error(target, `tier '${pyStr(meta.get("tier"))}' is not one of ${pyStr(sortedStrings(TIERS))}`);
        }
        const types = meta.get("project_types");
        if (!Array.isArray(types)) {
            this.error(target, "project_types must be a list");
        } else {
            for (const unknown of sortedStrings(new Set(types).difference(PROJECT_TYPES))) {
                this.error(target, `unknown project type '${unknown}'`);
            }
        }
        if (!isOneOf(meta.get("status"), new Set(["draft", "confirmed"]))) {
            this.error(target, `status '${pyStr(meta.get("status"))}' must be draft or confirmed`);
        }
        const confirmed = meta.get("status") === "confirmed";
        if (confirmed) {
            if (!validDate(meta.get("updated"))) {
                this.error(target, `updated '${pyStr(meta.get("updated"))}' is not a valid YYYY-MM-DD date`);
            }
            this.checkBriefComplete(target, text);
        }
        return confirmed;
    }

    checkBriefComplete(target, text) {
        const lines = proseLines(text);
        let section = null;
        let hasContent = false;
        for (let index = 0; index < lines.length; index += 1) {
            const [number, line] = lines[index];
            if (line.startsWith("## ")) {
                this.reportEmptySection(target, section, hasContent);
                section = pyStrip(line.slice(3));
                hasContent = false;
                continue;
            }
            if (PLACEHOLDER_RE.test(line)) {
                this.error(target, `line ${number}: confirmed brief still has a template placeholder`);
            }
            if (EMPTY_FIELD_RE.test(line)) {
                this.error(target, `line ${number}: confirmed brief has an empty field`);
            }
            const nextLine = index + 1 < lines.length ? lines[index + 1][1] : "";
            if (section && isBriefContent(line, nextLine)) hasContent = true;
        }
        this.reportEmptySection(target, section, hasContent);
    }

    reportEmptySection(target, section, hasContent) {
        if (section && !hasContent) {
            this.error(target, `confirmed brief has an empty section '${section}' (write _not applicable_ and why)`);
        }
    }

    checkAgentsMd(confirmed) {
        const target = path.join(this.root, "AGENTS.md");
        if (!confirmed || !exists(target) || !isDir(path.join(this.docs, "01-overview"))) return;
        for (const [number, line] of proseLines(readText(target))) {
            if (line.includes("_not set_")) {
                this.error(target, `line ${number}: PROJECT field not set although docs exist (${pyStrip(line)})`);
            }
        }
    }

    checkStackPacks() {
        const target = path.join(this.root, "AGENTS.md");
        if (!exists(target) || !isDir(path.join(this.docs, "01-overview"))) return;
        if (!isDir(path.join(this.root, ".agents"))) return; // a docs-only export: nothing installed to compare against
        // raw lines: prose_lines() strips inline code, and the pack names are written in backticks
        const line = splitLines(readText(target)).find((text) => text.includes("**Stack packs**"));
        if (line === undefined || line.includes("_not set_")) return; // check_agents_md reports the unset field
        const marker = line.indexOf("**Stack packs**:");
        const value = (marker >= 0 ? line.slice(marker + "**Stack packs**:".length) : line).split("(", 1)[0];
        let listed;
        if (value.includes("_none_")) {
            listed = new Set();
        } else {
            listed = new Set(findAll(PACK_REF_RE, value).map((match) => match[1]));
            if (!listed.size) { // bare names, as in "fastapi, react-vite"
                listed = new Set();
                for (const token of value.split(/[,/]/)) {
                    const clean = stripChars(token, "`* ");
                    if (clean && !clean.startsWith("_")) listed.add(clean);
                }
            }
        }
        const skills = path.join(this.root, ".agents", "skills");
        const installed = new Set();
        if (isDir(skills)) {
            for (const name of readdirNames(skills).sort(cmpStr)) {
                if (!name.startsWith(PACK_PREFIX)) continue;
                if (isDir(path.join(skills, name))) installed.add(name.slice(PACK_PREFIX.length));
            }
        }
        for (const pack of sortedStrings(new Set([...installed].filter((item) => !listed.has(item))))) {
            this.error(target, `stack pack ${PACK_PREFIX}${pack} is installed but 'Stack packs' does not list it`);
        }
        for (const pack of sortedStrings(new Set([...listed].filter((item) => !installed.has(item))))) {
            this.error(target, `'Stack packs' lists '${pack}' but .agents/skills/${PACK_PREFIX}${pack} is not installed`);
        }
    }

    // -- NFR traceability ----------------------------------------------------

    checkNfrCoverage(stories) {
        const target = path.join(this.docs, "01-overview", "nonfunctional-requirements.md");
        if (!exists(target) || !stories.size) return;
        const defined = new Map();
        for (const [, line] of proseLines(readText(target))) {
            for (const nfr of findAll(NFR_RE, line).map((match) => match[0])) {
                if (!defined.has(nfr)) defined.set(nfr, line);
            }
        }
        const covered = new Set();
        for (const story of stories.values()) {
            for (const match of findAll(NFR_RE, readText(story.path))) covered.add(match[0]);
        }
        for (const nfr of sortedStrings(defined.keys())) {
            if (!covered.has(nfr) && !defined.get(nfr).toLowerCase().includes("operational")) {
                this.warn(target, `${nfr} is not referenced by any story and not marked operational`);
            }
        }
    }

    // -- contract oracles ----------------------------------------------------

    currentStateFiles() {
        const files = [path.join(this.root, "README.md"), path.join(this.root, "AGENTS.md")]
            .filter((target) => isFile(target));
        for (const rel of IN_SCOPE_DOC_FILES) {
            const base = path.join(this.docs, rel);
            if (isFile(base)) {
                files.push(base);
            } else if (isDir(base)) {
                files.push(...globDir(base, /\.md$/));
            }
        }
        return files;
    }

    checkSkillBudget() {
        for (const target of skillFiles(this.docs)) {
            const words = pySplitWs(fs.readFileSync(target).toString("utf8")).length;
            if (words > SKILL_WORDS_BUDGET) {
                this.error(target, `skill ${path.basename(path.dirname(target))} is ${words} words, over the `
                    + `${SKILL_WORDS_BUDGET}-word budget — move the detail behind a link`);
            }
        }
    }

    checkRedProofs(stories) {
        if (!isDir(path.join(this.root, "tests"))) return;
        for (const story of [...stories.values()].sort((a, b) => cmpStr(a.id, b.id))) {
            if (!FINISHED.has(story.status)) continue;
            const line = storyRedLine(readText(story.path));
            if (line === null) {
                this.warn(story.path, "§ 8 has no 'Red:' line — name the test that failed before the fix, or 'none' "
                    + "and why");
                continue;
            }
            const ids = redTestIds(line);
            if (!ids.length) {
                if (line.toLowerCase().startsWith("none")) {
                    if (!/^none\s+[—-]\s+\S/i.test(line)) {
                        this.warn(story.path, "'Red: none' needs a reason after — or -");
                    }
                } else {
                    this.warn(story.path, "'Red:' names no tests/… id");
                }
                continue;
            }
            for (const testId of ids) {
                if (!testExists(this.root, testId)) {
                    this.error(story.path, `'Red:' names ${testId}, which does not exist`);
                }
            }
        }
    }

    checkDuplicateCommands() {
        const homes = new Map();
        for (const target of this.currentStateFiles()) {
            for (const command of commandSpans(readText(target))) {
                if (!homes.has(command)) homes.set(command, []);
                const paths = homes.get(command);
                const rel = this.rel(target);
                if (!paths.includes(rel)) paths.push(rel);
            }
        }
        for (const command of sortedStrings(homes.keys())) {
            const paths = homes.get(command);
            if (paths.length < 2) continue;
            const ordered = sortedStrings(paths);
            const listed = ordered.join(", ");
            this.warn(path.join(this.root, ordered[0]),
                `command '${command}' appears in ${paths.length} files: ${listed} — keep it in one home and link there`);
        }
    }

    checkTestCaseCoverage(stories) {
        const target = path.join(this.docs, "05-quality", "test-cases.md");
        if (!isFile(target)) return;
        const [covered, gaps] = parseTestCases(readText(target));
        const recorded = new Set(gaps.map(([storyId, ac]) => `${storyId}\u0000${ac}`));
        for (const story of [...stories.values()].sort((a, b) => cmpStr(a.id, b.id))) {
            if (!FINISHED.has(story.status)) continue;
            for (const ac of storyAcIds(readText(story.path))) {
                if ((covered.get(story.id) ?? new Set()).has(ac) || recorded.has(`${story.id}\u0000${ac}`)) continue;
                this.error(target, `${story.id}: ${ac} has no test case in 05-quality/test-cases.md`);
            }
        }
        for (const [storyId, ac, reason] of gaps) {
            const story = stories.get(storyId);
            if (story === undefined) {
                this.error(target, `'Known gaps' names ${storyId}, which is not a story`);
            } else if (!FINISHED.has(story.status)) {
                this.error(target, `'Known gaps' lists ${storyId} ${ac}, but ${storyId} is not done `
                    + `('${story.status}')`);
            } else {
                const known = storyAcIds(readText(story.path));
                if (!known.includes(ac)) {
                    this.error(target, `'Known gaps' lists ${storyId} ${ac}, but ${storyId} has no such criterion`);
                } else if ((covered.get(storyId) ?? new Set()).has(ac)) {
                    this.error(target, `${storyId} ${ac} is listed in 'Known gaps' but is already covered — `
                        + "drop the row");
                }
            }
            if (!reason) this.error(target, `'Known gaps' row ${storyId} ${ac} needs a reason`);
        }
    }

    checkContractOracles() {
        const reference = path.join(this.docs, "02-reference");
        if (!isDir(reference)) return;
        for (const target of rglobDir(reference, /\.md$/)) {
            const text = readText(target);
            if (!hasTable(text) || ORACLE_RE.test(text) || ORACLE_COLUMN_RE.test(text)) continue;
            this.warn(target, "contract table names no oracle — say how it is checked: a TC-… id, a tests/ path, a "
                + "test runner command, or an 'Oracle' column (cpt-docs references/doc-specs.md)");
        }
    }

    // -- releases, operations, and gates -------------------------------------

    tier() {
        const target = path.join(this.docs, "00-source", "brief.md");
        if (!exists(target)) return "";
        const meta = parseFrontmatter(readText(target)) ?? new Map();
        const value = meta.get("tier");
        return typeof value === "string" ? value : "";
    }

    collectReleases() {
        const directory = path.join(this.docs, "07-release");
        const releases = new Map();
        if (!isDir(directory)) return releases;
        for (const target of globDir(directory, /^REL-.*\.md$/)) {
            const match = RELEASE_FILE_RE.exec(path.basename(target));
            if (!match) {
                this.error(target, "release record filename must be REL-<nnn>-<slug>.md");
                continue;
            }
            const meta = parseFrontmatter(readText(target));
            if (meta === null) {
                this.error(target, "missing frontmatter");
                continue;
            }
            if (releases.has(match[1])) {
                this.error(target, `duplicate release id ${match[1]}`);
                continue;
            }
            releases.set(match[1], new Release(match[1], target, meta));
        }
        return releases;
    }

    checkReleases(releases, stories) {
        if (!releases.size) return;
        const numbers = [...releases.values()].map((release) => parseInt(release.id.slice(4), 10)).sort((a, b) => a - b);
        const expected = Array.from({ length: numbers.length }, (_, index) => index + 1);
        if (numbers.length !== expected.length || numbers.some((value, index) => value !== expected[index])) {
            this.warn(path.join(this.docs, "07-release"), `release ids are not contiguous from 1: ${pyStr(numbers)}`);
        }
        const versions = new Set([...releases.values()].map((release) => release.version).filter((value) => value));
        for (const release of releases.values()) {
            const target = release.path;
            const meta = release.meta;
            const text = readText(target);
            for (const key of RELEASE_REQUIRED) {
                if (!meta.has(key)) this.error(target, `frontmatter missing '${key}'`);
            }
            if (meta.get("id") !== release.id) {
                this.error(target, `id '${pyStr(meta.get("id"))}' does not match filename (${release.id})`);
            }
            this.checkEnum(target, meta, "environment", RELEASE_ENVIRONMENTS);
            this.checkEnum(target, meta, "status", RELEASE_STATUSES);
            if (!VERSION_RE.test(pyStr(meta.get("version")))) {
                this.error(target, `version '${pyStr(meta.get("version"))}' is not <major>.<minor>.<patch>`);
            }
            if (!validDate(meta.get("date"))) {
                this.error(target, `date '${pyStr(meta.get("date"))}' is not a valid YYYY-MM-DD date`);
            }
            const previous = meta.get("previous");
            if (previous === meta.get("version")) {
                this.error(target, "previous must not be the version being released");
            } else if (previous !== "none" && !versions.has(previous)) {
                this.warn(target, `previous '${pyStr(previous)}' is not the version of any recorded release`);
            }
            const included = listOf(meta, "stories");
            if (!included.length) this.error(target, "stories must list at least one story");
            for (const storyId of included) {
                const story = stories.get(storyId);
                if (story === undefined) {
                    this.error(target, `includes unknown story ${storyId}`);
                } else if (!FINISHED.has(story.status)) {
                    this.error(target, `includes ${storyId}, which is '${story.status}', not done`);
                }
            }
            if (release.status === "deployed") {
                const commit = pyStr(meta.get("commit") || "");
                if (!COMMIT_RE.test(commit)) {
                    this.error(target, `a deployed record needs the deployed commit sha, not '${commit}'`);
                }
                if (isBlank(meta.get("deployed_at"))) {
                    this.error(target, "a deployed record needs 'deployed_at' (UTC)");
                }
            }
            if (meta.get("environment") === "production" && ["deployed", "rolled-back"].includes(release.status)
                && isBlank(meta.get("approved_by"))) {
                this.error(target, "a production release needs 'approved_by' — who cleared it");
            }
            const sections = docSections(text);
            for (const heading of RELEASE_SECTIONS) {
                if (!sections.has(heading)) {
                    this.error(target, `missing required section '## ${heading}'`);
                } else if (!sectionHasContent(sections.get(heading))) {
                    this.error(target, `section '${heading}' is empty — state the facts or write 'none — <reason>'`);
                }
            }
            if (release.status !== "planned") {
                for (const [number, line] of proseLines(text)) {
                    const placeholder = PLACEHOLDER_RE.exec(line);
                    if (placeholder) {
                        this.error(target, `line ${number}: release record still has a template placeholder `
                            + `'${placeholder[0]}'`);
                        break;
                    }
                }
            }
        }
    }

    collectIncidents() {
        const directory = path.join(this.docs, "08-ops", "incidents");
        const incidents = new Map();
        if (!isDir(directory)) return incidents;
        for (const target of globDir(directory, /^INC-.*\.md$/)) {
            const match = INCIDENT_FILE_RE.exec(path.basename(target));
            if (!match) {
                this.error(target, "incident filename must be INC-<nnn>-<slug>.md");
                continue;
            }
            if (incidents.has(match[1])) {
                this.error(target, `duplicate incident id ${match[1]}`);
                continue;
            }
            incidents.set(match[1], target);
        }
        return incidents;
    }

    checkIncidents(incidents, releases) {
        for (const [incidentId, target] of incidents) {
            const text = readText(target);
            const meta = parseFrontmatter(text);
            if (meta === null) {
                this.error(target, "missing frontmatter");
                continue;
            }
            for (const key of INCIDENT_REQUIRED) {
                if (!meta.has(key)) this.error(target, `frontmatter missing '${key}'`);
            }
            if (meta.get("id") !== incidentId) {
                this.error(target, `id '${pyStr(meta.get("id"))}' does not match filename (${incidentId})`);
            }
            this.checkEnum(target, meta, "severity", INCIDENT_SEVERITIES);
            this.checkEnum(target, meta, "status", INCIDENT_STATUSES);
            if (!validDate(meta.get("detected"))) {
                this.error(target, `detected '${pyStr(meta.get("detected"))}' is not a valid YYYY-MM-DD date`);
            }
            const status = meta.get("status");
            if (["resolved", "closed"].includes(status) && !validDate(meta.get("resolved"))) {
                this.error(target, `status '${status}' needs a 'resolved' date`);
            }
            const releaseId = pyStr(meta.get("release") || "");
            if (!["", "none"].includes(releaseId) && !releases.has(releaseId)) {
                this.error(target, `release '${releaseId}' does not exist`);
            }
            const sections = docSections(text);
            for (const heading of INCIDENT_SECTIONS) {
                if (!sections.has(heading)) {
                    this.error(target, `missing required section '## ${heading}'`);
                } else if (!sectionHasContent(sections.get(heading))) {
                    this.error(target, `section '${heading}' is empty — say what happened, or 'none — <reason>'`);
                }
            }
            const rootCause = sections.get("Root cause") ?? [];
            if (status === "closed" && rootCause.some((line) => pyStrip(line).toLowerCase().startsWith("unknown"))) {
                this.error(target, "closed with an unknown root cause — record the mechanism or leave it open");
            }
            if (["SEV1", "SEV2"].includes(meta.get("severity"))) {
                const postmortem = sections.get("Postmortem");
                const required = "not required";
                if (postmortem === undefined) {
                    this.error(target, `${pyStr(meta.get("severity"))} needs a '## Postmortem' section`);
                } else if (postmortem.some((line) => pyStrip(line).toLowerCase().startsWith(required))
                    || !sectionHasContent(postmortem)) {
                    this.error(target, `a ${pyStr(meta.get("severity"))} postmortem is required`);
                }
            }
            for (const row of tableRows(sections.get("Actions") ?? [])) {
                const joined = row.join(" | ");
                if (!MENTION_RE.test(joined) && !/\bnone\b|\bno action\b/i.test(joined)) {
                    this.warn(target, `action '${row[0]}' names no story or question id`);
                }
            }
        }
    }

    checkSignoff() {
        const target = path.join(this.docs, "05-quality", "acceptance-signoff.md");
        const full = this.tier() === "full";
        if (!exists(target)) {
            if (full) this.error(target, "full tier needs the gate record — copy .agents/templates/signoff.md");
            return;
        }
        const rows = [];
        for (const [, line] of proseLines(readText(target))) {
            const stripped = pyStrip(line);
            if (/^\|\s*G\d\b/.test(stripped)) {
                rows.push(stripped.replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((cell) => pyStrip(cell)));
            }
        }
        const seen = new Set();
        const signed = new Map();
        for (const row of rows) {
            const gate = row[0];
            if (!SIGN_OFF_GATES.includes(gate)) {
                this.error(target, `unknown gate '${gate}' — the gates are ${SIGN_OFF_GATES.join(", ")}`);
                continue;
            }
            if (seen.has(gate)) this.error(target, `gate ${gate} has more than one row`);
            seen.add(gate);
            if (row.length < SIGN_OFF_COLUMNS.length) {
                this.error(target, `gate ${gate}: row needs ${SIGN_OFF_COLUMNS.length} columns, has ${row.length}`);
                continue;
            }
            const cell = {};
            SIGN_OFF_COLUMNS.forEach((column, index) => { cell[column] = row[index]; });
            const status = cell.Status;
            if (!SIGN_OFF_STATUSES.has(status)) {
                this.error(target, `gate ${gate}: status '${status}' is not one of ${pyStr(sortedStrings(SIGN_OFF_STATUSES))}`);
                continue;
            }
            if (status === "pending") continue;
            if (isBlank(cell["Signed by"])) {
                this.error(target, `gate ${gate} is ${status} with nobody named in 'Signed by'`);
            }
            if (!validDate(cell.Date)) {
                this.error(target, `gate ${gate} is ${status} without a valid 'Date'`);
            }
            if (status === "signed") {
                if (isBlank(cell.Evidence)) {
                    this.error(target, `gate ${gate} is signed with no evidence — a gate without evidence is pending`);
                }
                if (gate === "G3" && !TC_RE.test(cell.Evidence)) {
                    this.error(target, `gate ${gate} is signed without a TC-… id in 'Evidence'`);
                }
                if (gate === "G3" && pyStrip(cell.Role) !== "independent") {
                    this.error(target, "G3 is acceptance by the client or an outside reviewer — the maintainer cannot "
                        + "sign their own delivery (ADR-0004)");
                }
                signed.set(gate, [pyStrip(cell["Signed by"]), pyStrip(cell.Role)]);
            }
            if (status === "waived" && isBlank(cell.Note)) {
                this.error(target, `gate ${gate} is waived with no 'Note' — name the gap, the risk, the control`);
            }
        }
        if (full) {
            for (const gate of SIGN_OFF_GATES) {
                if (!seen.has(gate)) this.error(target, `full tier needs a row for gate ${gate}`);
            }
        }
        this.checkReviews(target, signed);
    }

    checkReviews(signoff, signed) {
        const directory = path.join(this.docs, "05-quality", "reviews");
        const reviews = new Map();
        for (const target of globDir(directory, /^REVIEW-.*\.md$/)) {
            const text = readText(target);
            const meta = parseFrontmatter(text);
            if (meta === null) {
                this.error(target, "missing frontmatter — ADR-0004 fixes the four fields");
                continue;
            }
            const gate = pyStrip(pyStr(meta.get("gate") ?? ""));
            const reviewer = pyStrip(pyStr(meta.get("reviewer") ?? ""));
            const role = pyStrip(pyStr(meta.get("role") ?? ""));
            const verdict = pyStrip(pyStr(meta.get("verdict") ?? ""));
            if (!SIGN_OFF_GATES.includes(gate)) {
                this.error(target, `gate '${gate}' is not one of ${SIGN_OFF_GATES.join(", ")}`);
                continue;
            }
            if (!reviewer) {
                this.error(target, "frontmatter needs 'reviewer' — a review without a name is not a signature");
            }
            if (!verdict) {
                this.error(target, "frontmatter needs 'verdict' — accepted or rejected");
            }
            if (role !== "independent") {
                this.error(target, `role is '${role}', but an acceptance review is the independent party's (ADR-0004)`);
            }
            for (const heading of REVIEW_SECTIONS) {
                if (!pyStrip(sectionText(text, heading))) {
                    this.error(target, `missing the **${heading}** section`);
                }
            }
            if (!reviews.has(gate)) reviews.set(gate, []);
            reviews.get(gate).push({ reviewer, verdict });
        }

        const maintainers = new Set([...signed.values()].filter(([, role]) => role === "maintainer").map(([signer]) => signer));
        for (const gate of sortedStrings(signed.keys())) {
            const [signer, role] = signed.get(gate);
            if (role !== "independent") continue;
            const found = reviews.get(gate) ?? [];
            if (!found.length) {
                this.error(signoff, `gate ${gate} is signed by an independent reviewer but `
                    + `05-quality/reviews/REVIEW-*-${gate.toLowerCase()}.md does not exist — ADR-0004 makes the `
                    + "review file the evidence");
                continue;
            }
            const accepting = found.filter((review) => REVIEW_ACCEPTS.has(review.verdict));
            if (!accepting.length) {
                this.error(signoff, `the review for ${gate} does not accept — its verdict is `
                    + `'${found[0].verdict}'`);
                continue;
            }
            if (accepting.every((review) => maintainers.has(review.reviewer))) {
                this.error(signoff, `the independent reviewer of ${gate} is the same person who signed another gate `
                    + "as the maintainer — independence needs a different party");
            }
            if (maintainers.has(signer)) {
                this.error(signoff, `gate ${gate} is signed by '${signer}', the same person who signed another gate as `
                    + "the maintainer");
            }
        }
    }

    checkedFiles() {
        const source = path.join(this.docs, "00-source");
        const keep = new Set([path.join(source, "brief.md"), path.join(source, "ingest-report.md")]);
        const changeRequests = path.join(source, "change-requests");
        const files = rglobDir(this.docs, /\.md$/).filter((target) => !isUnder(target, source)
            || keep.has(target) || isUnder(target, changeRequests));
        const agents = path.join(this.root, "AGENTS.md");
        return exists(agents) ? [agents, ...files] : files;
    }

    checkLinksAndMentions(knownIds, questions) {
        const anchorCache = new Map();
        for (const target of this.checkedFiles()) {
            for (const [number, line] of proseLines(readText(target))) {
                for (const match of findAll(LINK_RE, line)) {
                    this.checkLink(target, number, match[1], anchorCache);
                }
                const mentions = new Set(findAll(MENTION_RE, line).map((match) => match[0]));
                for (const mention of sortedStrings([...mentions].filter((item) => !knownIds.has(item)))) {
                    this.warn(target, `line ${number}: mentions unknown id ${mention}`);
                }
                for (const match of findAll(ASSUMPTION_TAG_RE, line)) {
                    const oq = match[1];
                    if (questions.has(oq) && !questions.get(oq).isOpen) {
                        this.warn(target, `line ${number}: stale [assumption: ${oq}] — ${oq} is `
                            + `${questions.get(oq).status}; replace with the decided fact`);
                    }
                }
                if (line.includes("⚠️ Assumption") && !ASSUMPTION_TAG_RE.test(line)) {
                    this.warn(target, `line ${number}: assumption without an [assumption: OQ-nn] tag`);
                }
            }
        }
    }

    checkLink(target, number, linkTarget, cache) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(linkTarget)) return; // external URL, mailto:, etc.
        const hash = linkTarget.indexOf("#");
        const rawFile = hash >= 0 ? linkTarget.slice(0, hash) : linkTarget;
        const anchor = hash >= 0 ? linkTarget.slice(hash + 1) : "";
        const filePart = unquote(rawFile);
        let resolved;
        if (!filePart) {
            resolved = target;
        } else if (filePart.startsWith("/")) { // root-relative: resolved from the repository root
            resolved = resolvePath(path.join(this.root, filePart.replace(/^\/+/, "")));
        } else {
            resolved = resolvePath(path.join(path.dirname(target), filePart));
        }
        if (!exists(resolved)) {
            this.error(target, `line ${number}: broken link '${linkTarget}'`);
            return;
        }
        if (anchor && path.extname(resolved) === ".md") {
            if (!cache.has(resolved)) cache.set(resolved, headingAnchors(resolved));
            if (!cache.get(resolved).has(unquote(anchor).toLowerCase())) {
                this.warn(target, `line ${number}: anchor '#${anchor}' not found in ${path.basename(resolved)}`);
            }
        }
    }

    // -- generated blocks ----------------------------------------------------

    syncBlocks(generator, fix) {
        const fixed = [];
        for (const target of this.checkedFiles()) {
            const raw = fs.readFileSync(target);
            let text;
            try {
                text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
            } catch {
                this.error(target, "not valid UTF-8; generated blocks were not checked");
                continue;
            }
            const fences = fenceSpans(text);
            if (!this.markersBalanced(target, text, fences)) continue;
            const newline = text.includes("\r\n") ? "\r\n" : "\n";
            const stale = [];
            // Match on a copy with fenced code blanked, so a marker example in a fence never pairs with a real marker.
            // Offsets are unchanged, so every slice below is taken from the original text.
            const masked = blankSpans(text, fences);
            const pieces = [];
            const matched = new Set();
            let last = 0;
            for (const match of masked.matchAll(globalClone(BLOCK_RE))) {
                matched.add(match.index);
                const kind = match[2];
                let expected = generator.render(kind, target);
                if (expected === null) {
                    this.error(target, `unknown generated block 'cpt:${kind}'`);
                    continue;
                }
                expected = expected.replace(/\n/g, newline);
                if (text.slice(match.indices[3][0], match.indices[3][1]) !== expected) stale.push(kind);
                pieces.push(text.slice(last, match.indices[1][1]), expected);
                last = match.indices[4][0];
            }
            const updated = pieces.join("") + text.slice(last);
            for (const match of masked.matchAll(globalClone(BLOCK_MARKER_RE))) {
                if (match[1] !== "/" && !matched.has(match.index)) {
                    this.error(target, `generated block 'cpt:${match[2]}' is malformed — put each marker on a `
                        + "line of its own");
                }
            }
            if (!stale.length) continue;
            if (fix) {
                const body = Buffer.from(updated, "utf8");
                fs.writeFileSync(target, hasUtf8Bom(raw) ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body);
                fixed.push(this.rel(target));
            } else {
                for (const kind of stale) {
                    this.error(target, `generated block 'cpt:${kind}' is out of date — run node .agents/scripts/verify-docs.mjs --fix`);
                }
            }
        }
        return fixed;
    }

    markersBalanced(target, text, fences) {
        const openKinds = [];
        for (const match of findAll(BLOCK_MARKER_RE, text)) {
            if (inSpans(match.index, fences)) continue;
            const closing = match[1] === "/";
            const kind = match[2];
            if (!closing && !openKinds.length) {
                openKinds.push(kind);
            } else if (closing && openKinds.length && openKinds[openKinds.length - 1] === kind) {
                openKinds.pop();
            } else {
                this.error(target, `unbalanced generated block markers near 'cpt:${kind}' — fix them by hand`);
                return false;
            }
        }
        if (openKinds.length) {
            this.error(target, `unbalanced generated block markers: 'cpt:${openKinds[openKinds.length - 1]}' is never closed`);
            return false;
        }
        return true;
    }

    // -- run -----------------------------------------------------------------

    run(fix = false) {
        const confirmed = this.checkBrief();
        this.checkAgentsMd(confirmed);
        this.checkStackPacks();
        const questions = this.parseQuestions();
        this.checkQuestions(questions);
        const adrIds = this.checkAdrs();
        const stories = this.collectStories();
        this.checkStoryRelations(stories, questions);
        this.checkNfrCoverage(stories);
        this.checkContractOracles();
        this.checkTestCaseCoverage(stories);
        this.checkDuplicateCommands();
        this.checkSkillBudget();
        this.checkRedProofs(stories);
        const releases = this.collectReleases();
        this.checkReleases(releases, stories);
        const incidents = this.collectIncidents();
        this.checkIncidents(incidents, releases);
        this.checkSignoff();
        const fixed = this.syncBlocks(new Generator(stories, questions, this.epics, this.oqFile, releases), fix);
        const knownIds = new Set([
            ...questions.keys(),
            ...adrIds,
            ...stories.keys(),
            ...releases.keys(),
            ...incidents.keys(),
        ]);
        this.checkLinksAndMentions(knownIds, questions);
        return [this.findings, fixed];
    }
}

// --------------------------------------------------------------------------- CLI

const PROGRAM = path.basename(process.argv[1] ?? "verify-docs.mjs");
const USAGE = `usage: ${PROGRAM} [-h] [--docs DOCS] [--strict] [--fix] [--time]`;
const HELP = `${USAGE}

Verify the CPT doc set.

options:
  -h, --help  show this help message and exit
  --docs DOCS  docs directory (default: ./docs)
  --strict     treat warnings as errors
  --fix        regenerate generated blocks before checking
  --time       report wall-clock runtime on stderr as \`verify-docs: <seconds>s\` (NFR-09 budget)
`;

function cliError(message, stderr = process.stderr) {
    stderr.write(`${USAGE}\n${PROGRAM}: error: ${message}\n`);
    process.exitCode = 2;
    return null;
}

/** A tiny argparse: four long flags, `--docs` takes a value, unambiguous prefixes are accepted. */
export function parseCli(argv, stderr = process.stderr) {
    const options = { docs: "docs", strict: false, fix: false, time: false, help: false };
    const long = ["--help", "--docs", "--strict", "--fix", "--time"];
    const takesValue = new Set(["--docs"]);
    for (let index = 0; index < argv.length; index += 1) {
        const raw = argv[index];
        if (raw === "-h") {
            options.help = true;
            continue;
        }
        if (!raw.startsWith("--")) return cliError(`unrecognized arguments: ${raw}`, stderr);
        const equals = raw.indexOf("=");
        let name = equals >= 0 ? raw.slice(0, equals) : raw;
        let value = equals >= 0 ? raw.slice(equals + 1) : null;
        if (!long.includes(name)) {
            const candidates = long.filter((option) => option.startsWith(name));
            if (candidates.length === 1) {
                name = candidates[0];
            } else if (candidates.length > 1) {
                return cliError(`ambiguous option: ${raw}`, stderr);
            } else {
                return cliError(`unrecognized arguments: ${raw}`, stderr);
            }
        }
        if (value !== null && !takesValue.has(name)) {
            // argparse verbosity, reproduced because a wrapper script may grep stderr
            return cliError(`argument ${name}: ignored explicit argument '${value}'`, stderr);
        }
        if (name === "--help") {
            options.help = true;
            continue;
        }
        if (takesValue.has(name)) {
            if (value === null) {
                if (index + 1 >= argv.length) return cliError(`argument ${name}: expected one argument`, stderr);
                index += 1;
                value = argv[index];
            }
            options.docs = value;
            continue;
        }
        options[name.slice(2)] = true;
    }
    return options;
}

/** Run the verifier, writing to `streams` (the CLI passes process streams; tests pass buffers). */
export function check(args, streams = {}) {
    const stdout = streams.stdout ?? process.stdout;
    const stderr = streams.stderr ?? process.stderr;
    const docs = resolvePath(args.docs);
    if (!isDir(docs)) {
        stderr.write(`verify-docs: docs directory not found: ${docs}\n`);
        return 2;
    }

    const [findings, fixed] = new Verifier(docs).run(args.fix);
    for (const target of fixed) {
        stdout.write(`FIXED   ${target}: regenerated generated blocks\n`);
    }
    for (const finding of findings) stdout.write(`${finding.render()}\n`);
    const errors = findings.filter((finding) => finding.level === "error").length;
    const warnings = findings.length - errors;
    stdout.write(`verify-docs: ${errors} error(s), ${warnings} warning(s)\n`);
    return errors || (args.strict && warnings) ? 1 : 0;
}

/** The Python `main(argv)`: parse, run, report --time on stderr, and return the exit code. */
export function main(argv = process.argv.slice(2), streams = {}) {
    const stdout = streams.stdout ?? process.stdout;
    const stderr = streams.stderr ?? process.stderr;
    const options = parseCli(argv, stderr);
    if (options === null) return 2;
    if (options.help) {
        stdout.write(HELP);
        return 0;
    }
    const started = process.hrtime.bigint();
    try {
        return check(options, { stdout, stderr });
    } finally {
        if (options.time) {
            // stderr only: stdout is the summary scripts and the hook grep for, byte for byte
            const seconds = Number(process.hrtime.bigint() - started) / 1e9;
            stderr.write(`verify-docs: ${seconds.toFixed(2)}s\n`);
        }
    }
}

/** True only when this file is the process entry point (tolerates a missing argv[1]). */
function isMainModule() {
    const entry = process.argv[1];
    if (!entry) return false;
    try {
        return fs.realpathSync(entry) === fs.realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
}

if (isMainModule()) {
    process.exitCode = main();
}
