#!/usr/bin/env node
/**
 * Fill the CPT weekly-report workbook template from a JSON data file.
 *
 * Usage: node build_weekly_report.mjs --data weekly-data.json --out DIR [--template XLSX]
 *
 * Port of build_weekly_report.py onto ExcelJS (ADR-0005). The template
 * (../assets/weekly-report-template.xlsx) is loaded as-is, so every style, width, banner and guide text comes from it.
 * This script only writes data, grows or shrinks each table to the number of rows supplied, adds sprint columns beyond
 * the template's six, and rewrites every formula against the final row positions.
 *
 * The data contract is ../references/weekly-data-contract.md. Requires exceljs: `npm install exceljs` in the
 * project that runs it (`install.sh` copies files, it installs no packages).
 *
 * Exit codes: 0 = written, 1 = invalid data, 2 = exceljs or the template is missing.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Loaded dynamically so a project without the dependency gets the documented exit code and one actionable line,
// instead of an ERR_MODULE_NOT_FOUND stack trace (the Python script guarded its `from openpyxl import …` the same way).
let ExcelJS;
try {
    ({ default: ExcelJS } = await import("exceljs"));
} catch (error) {
    const missing = error && error.code === "ERR_MODULE_NOT_FOUND";
    process.stderr.write(missing
        ? "exceljs is required: `npm install exceljs` in the project (it is the only dependency of cpt-report)\n"
        : `exceljs could not be loaded: ${error && error.message ? error.message : error}\n`);
    process.exit(2);
}

const { ValueType } = ExcelJS;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TEMPLATE = path.join(SCRIPT_DIR, "..", "assets", "weekly-report-template.xlsx");
const FORBIDDEN_IN_NAME = /[\\/:*?"<>|]/;
const PLACEHOLDER = /\[[^\]\n]*[A-Za-z][^\]\n]*\]/g;
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/; // \t \n \r are allowed: multi-line cells use \n
const ISO_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const LINE_HEIGHT = 13.5; // points per wrapped line at the template's 10 pt Aptos
const CHARS_PER_WIDTH = 1.15; // characters that fit per column-width unit at 10 pt
const DEFAULT_WIDTH = 8.43;
const TEMPLATE_SPRINT_SLOTS = 6; // WBS columns E..J
const PROGRESS_BY_STATUS = [0, 50, 70, 80, 100, 0]; // template's SWITCH, in the order of its Status drop-down
const WBS_BAR_COLOURS = new Map([ // status -> (fill, font), the tones of the template's Quality Metrics rules
    ["Done", ["E2F0D9", "375623"]],
    ["In progress", ["D9EAF7", "17365D"]],
    ["At risk", ["FFF2CC", "7F6000"]],
    ["Blocked", ["F4CCCC", "9C0006"]],
    ["Planned", ["EEF2F7", "243447"]],
]);

// Template coordinates: the first data row and how many data rows the template ships, per table.
const WR_PROGRESS = 14, WR_PROGRESS_ROWS = 6;
const WR_PEOPLE = 23, WR_PEOPLE_ROWS = 3;
const WR_NOTE = 27;
const LEAVE = 5, LEAVE_ROWS = 3;
const CAPACITY_OFFSET = 6; // first capacity row sits six rows below the leave total
const TASKS = 5, TASKS_ROWS = 28;
const WBS = 5, WBS_ROWS = 15;
const MILESTONES = 24, MILESTONE_ROWS = 4;
const METRICS = 5, METRICS_ROWS = 11;
const METRICS_NOTE_OFFSET = 4; // management note sits four rows below the metrics total
const RISKS = 5, RISKS_ROWS = 13;
const RISKS_NOTE_OFFSET = 2;

class DataError extends Error {
    constructor(message) {
        super(message);
        this.name = "DataError";
    }
}

// ----------------------------------------------------------------------------------------- Python-compatible text

/** Python's `repr()` for the value shapes the data contract allows (used in error messages). */
function pyRepr(value) {
    if (value === null || value === undefined) return "None";
    if (typeof value === "string") return pyStr(value);
    if (typeof value === "boolean") return value ? "True" : "False";
    if (typeof value === "number") {
        if (Number.isNaN(value)) return "nan";
        if (value === Infinity) return "inf";
        if (value === -Infinity) return "-inf";
        return String(value);
    }
    if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
    if (typeof value === "object") {
        return `{${Object.entries(value).map(([key, item]) => `${pyStr(key)}: ${pyRepr(item)}`).join(", ")}}`;
    }
    return String(value);
}

function pyStr(text) {
    const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
    let out = "";
    for (const char of text) {
        const code = char.codePointAt(0);
        if (char === "\\") out += "\\\\";
        else if (char === quote) out += `\\${quote}`;
        else if (char === "\n") out += "\\n";
        else if (char === "\r") out += "\\r";
        else if (char === "\t") out += "\\t";
        else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, "0")}`;
        else out += char;
    }
    return quote + out + quote;
}

/** Python `str()` for a float (used only for the values the builder prints: leave days, available man-days). */
function pyFloat(value) {
    return Number.isInteger(value) ? `${value}.0` : String(value);
}

/** Python `str()` for `sum()` over a list: empty sums stay ints, non-empty sums are floats. */
function formatPythonList(values, floats) {
    const rendered = values.map((value) => (floats ? pyFloat(value) : String(value)));
    return `[${rendered.join(", ")}]`;
}

/**
 * `JSON.parse` with Python's `json.loads` extension: bare `NaN` / `Infinity` / `-Infinity` become numbers.
 * Python's parser accepts them; the standard JavaScript parser does not, and the data validator rejects them later.
 */
function parseJson(text) {
    const sentinels = [];
    let out = "";
    let index = 0;
    let inString = false;
    let escaped = false;
    while (index < text.length) {
        const char = text[index];
        if (inString) {
            out += char;
            if (escaped) escaped = false;
            else if (char === "\\") escaped = true;
            else if (char === '"') inString = false;
            index += 1;
            continue;
        }
        if (char === '"') {
            inString = true;
            out += char;
            index += 1;
            continue;
        }
        let end = text.indexOf('"', index);
        if (end < 0) end = text.length;
        out += text.slice(index, end).replace(/(?<![\w.$])(-?Infinity|NaN)(?![\w.$])/g, (token) => {
            sentinels.push(token);
            return `"\\u0000cpt-nonfinite-${sentinels.length - 1}\\u0000"`;
        });
        index = end;
    }
    const restore = (value) => {
        if (typeof value === "string") {
            const match = /^\u0000cpt-nonfinite-(\d+)\u0000$/.exec(value);
            if (match) {
                const token = sentinels[Number(match[1])];
                if (token === "NaN") return NaN;
                return token === "Infinity" ? Infinity : -Infinity;
            }
            return value;
        }
        if (Array.isArray(value)) return value.map(restore);
        if (value && typeof value === "object") {
            for (const key of Object.keys(value)) value[key] = restore(value[key]);
            return value;
        }
        return value;
    };
    return restore(JSON.parse(out));
}

// ----------------------------------------------------------------------------------------------- data access

function isMissing(value) {
    return value === null || value === undefined || value === "";
}

function need(obj, key, where) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj) || isMissing(obj[key])) {
        throw new DataError(`${where}.${key} is required`);
    }
    return obj[key];
}

function needStr(obj, key, where) {
    const value = need(obj, key, where);
    if (typeof value !== "string") {
        throw new DataError(`${where}.${key}: expected text, got ${pyRepr(value)}`);
    }
    return value;
}

function optStr(obj, key, where, fallback = "") {
    const value = obj[key];
    if (isMissing(value)) return fallback;
    if (typeof value !== "string") {
        throw new DataError(`${where}.${key}: expected text, got ${pyRepr(value)}`);
    }
    return value;
}

function needNum(value, where) {
    if (typeof value === "boolean" || typeof value !== "number" || value < 0) {
        throw new DataError(`${where}: expected a non-negative number, got ${pyRepr(value)}`);
    }
    return value;
}

function needList(obj, key, where, required = false) {
    const value = required ? need(obj, key, where) : (Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : []);
    if (!Array.isArray(value) || (required && value.length === 0)) {
        throw new DataError(
            `${where}.${key}: expected a${required ? " non-empty" : ""} list, got ${pyRepr(value)}`,
        );
    }
    return value;
}

/** Reject, anywhere in the data, text Excel cannot store and numbers Excel cannot hold. */
function scan(value, where) {
    if (Array.isArray(value)) {
        value.forEach((item, index) => scan(item, `${where}[${index}]`));
    } else if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) scan(item, where ? `${where}.${key}` : String(key));
    } else if (typeof value === "string") {
        const match = CONTROL_CHARS.exec(value);
        if (match) {
            throw new DataError(`${where}: contains a control character, ${pyRepr(match[0])}`);
        }
    } else if (typeof value === "number" && !Number.isFinite(value)) {
        throw new DataError(`${where}: expected a finite number, got ${pyRepr(value)}`);
    }
}

/** A calendar day, parsed the way Python's `date.fromisoformat` accepts it (strict YYYY-MM-DD). */
function iso(value, where) {
    const fail = () => new DataError(`${where}: expected YYYY-MM-DD, got ${pyRepr(value)}`);
    if (typeof value !== "string" || !ISO_DATE.test(value)) throw fail();
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw fail();
    }
    return { year, month, day };
}

function pad(value, width = 2) {
    return String(value).padStart(width, "0");
}

function dotted(day) {
    return `${pad(day.year, 4)}.${pad(day.month)}.${pad(day.day)}`;
}

function isoString(day) {
    return `${pad(day.year, 4)}-${pad(day.month)}-${pad(day.day)}`;
}

function plain(day) {
    return `${pad(day.month)}.${pad(day.day)}`;
}

function compareDays(a, b) {
    return a.year - b.year || a.month - b.month || a.day - b.day;
}

function span(period, where) {
    return `${dotted(iso(need(period, "from", where), where))} ~ ${dotted(iso(need(period, "to", where), where))}`;
}

/** The values the template's own drop-down accepts in `column`, so data is checked against the template. */
function allowedValues(ws, column) {
    for (const [address, validation] of Object.entries(ws.dataValidations.model || {})) {
        if (addressColumn(address) === column) {
            const formula = validation.formulae[0];
            return formula.replace(/^"+|"+$/g, "").split(",").map((item) => item.trim());
        }
    }
    throw new DataError(`template sheet ${pyStr(ws.name)} has no drop-down in column ${column}`);
}

function check(value, allowed, where) {
    if (!allowed.includes(value)) {
        throw new DataError(`${where}: ${pyRepr(value)} is not one of ${allowed.join(", ")}`);
    }
    return value;
}

// ------------------------------------------------------------------------------------------- address helpers

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function columnLetter(number) {
    let letters = "";
    let value = number;
    while (value > 0) {
        const rest = (value - 1) % 26;
        letters = LETTERS[rest] + letters;
        value = Math.floor((value - 1) / 26);
    }
    return letters;
}

function columnNumber(letters) {
    let number = 0;
    for (const char of letters) number = number * 26 + (char.charCodeAt(0) - 64);
    return number;
}

function addressColumn(address) {
    return address.replace(/[0-9]+$/, "");
}

function addressOf(column, row) {
    return `${columnLetter(column)}${row}`;
}

function parseRange(text) {
    const [first, last] = text.split(":");
    const start = parseAddress(first);
    const end = last ? parseAddress(last) : start;
    return {
        minCol: Math.min(start.col, end.col),
        minRow: Math.min(start.row, end.row),
        maxCol: Math.max(start.col, end.col),
        maxRow: Math.max(start.row, end.row),
    };
}

function parseAddress(text) {
    const match = /^([A-Z]+)([0-9]+)$/.exec(text);
    return { col: columnNumber(match[1]), row: Number(match[2]) };
}

function rangeStr(rect) {
    return `${addressOf(rect.minCol, rect.minRow)}:${addressOf(rect.maxCol, rect.maxRow)}`;
}

// --------------------------------------------------------------------------------------------- layout helpers

function width(ws, col) {
    const value = ws.getColumn(col).width;
    return value ? value : DEFAULT_WIDTH;
}

function linesNeeded(text, chars) {
    return String(text).split("\n").reduce((total, part) => {
        return total + Math.max(1, Math.ceil(Array.from(part).length / Math.max(chars, 1)));
    }, 0);
}

function round2(value) {
    return Number(value.toFixed(2));
}

function cellIsFormula(cell) {
    return cell.type === ValueType.Formula;
}

/** Size rows top..bottom so the text at (top, left), spanning columns left..right, is not clipped. */
function fitRows(ws, top, bottom, left, right, minimum) {
    const cell = ws.getCell(top, left);
    if (cell.value === null || cell.value === undefined || cellIsFormula(cell)) return;
    let chars = 0;
    for (let col = left; col <= right; col += 1) chars += width(ws, col);
    chars = Math.trunc(chars * CHARS_PER_WIDTH);
    const total = Math.max(minimum * (bottom - top + 1), linesNeeded(cell.value, chars) * LINE_HEIGHT + 4);
    for (let row = top; row <= bottom; row += 1) {
        ws.getRow(row).height = round2(total / (bottom - top + 1));
    }
}

function fitDataRow(ws, row, columns, minimum, merged = []) {
    const chars = {};
    for (let col = 1; col <= columns; col += 1) chars[col] = Math.trunc(width(ws, col) * CHARS_PER_WIDTH);
    for (const [left, right] of merged) {
        let total = 0;
        for (let col = left; col <= right; col += 1) total += width(ws, col);
        chars[left] = Math.trunc(total * CHARS_PER_WIDTH);
    }
    let tallest = 1;
    const sheetRow = ws.getRow(row);
    for (let col = 1; col <= columns; col += 1) {
        const cell = sheetRow.getCell(col);
        if (cell.type === ValueType.Merge) continue;
        if (cell.value === null || cell.value === undefined || cellIsFormula(cell)) continue;
        tallest = Math.max(tallest, linesNeeded(cell.value, chars[cell.col]));
    }
    sheetRow.height = Math.max(minimum || 15.0, tallest * LINE_HEIGHT + 4);
}

function mergeRects(ws) {
    return ws.model.merges.map(parseRange);
}

function cloneStyle(style) {
    return structuredClone(style);
}

/**
 * Unmerge every range at or past `pivot` on `axis`; return the shifted or stretched bounds to merge again.
 * (ExcelJS, like openpyxl, does not move merges when rows or columns are inserted, so the script does it.)
 */
function shiftMerges(ws, axis, pivot, delta) {
    const pending = [];
    for (const rect of mergeRects(ws)) {
        const lo = axis === "row" ? rect.minRow : rect.minCol;
        const hi = axis === "row" ? rect.maxRow : rect.maxCol;
        if (hi < pivot) continue;
        const bounds = { ...rect };
        ws.unMergeCells(rangeStr(rect));
        if (lo >= pivot) {
            if (axis === "row") {
                bounds.minRow += delta;
                bounds.maxRow += delta;
            } else {
                bounds.minCol += delta;
                bounds.maxCol += delta;
            }
        } else if (delta > 0) { // a banner spanning the insertion point stretches with it
            if (axis === "row") bounds.maxRow += delta;
            else bounds.maxCol += delta;
        } else {
            const what = axis === "row" ? "rows" : "columns";
            throw new DataError(`${ws.name}: merged range ${rangeStr(rect)} spans ${what} that are being removed`);
        }
        pending.push(bounds);
    }
    return pending;
}

function mergeAgain(ws, pending) {
    for (const rect of pending) {
        ws.mergeCellsWithoutStyle(rect.minRow, rect.minCol, rect.maxRow, rect.maxCol);
    }
}

/** Point drop-downs and conditional formats that covered the old data block at the new one; shift those below. */
function retarget(ws, first, oldLast, newLast, delta) {
    const moved = (rect) => {
        const left = columnLetter(rect.minCol);
        const right = columnLetter(rect.maxCol);
        if (rect.minRow >= first && rect.minRow <= oldLast) {
            const top = first;
            const bottom = newLast;
            if (top === bottom && rect.minCol === rect.maxCol) return `${left}${top}`;
            return `${left}${top}:${right}${bottom}`;
        }
        if (rect.minRow > oldLast) {
            return `${left}${rect.minRow + delta}:${right}${rect.maxRow + delta}`;
        }
        return rangeStr(rect);
    };

    const entries = [];
    for (const [address, validation] of Object.entries(ws.dataValidations.model || {})) {
        if (address.includes(":")) {
            const [topLeft, bottomRight] = address.split(":");
            const top = parseAddress(topLeft);
            const bottom = parseAddress(bottomRight);
            for (let row = top.row; row <= bottom.row; row += 1) {
                for (let col = top.col; col <= bottom.col; col += 1) entries.push([addressOf(col, row), validation]);
            }
        } else {
            entries.push([address, validation]);
        }
    }
    const block = new Map();
    const next = {};
    for (const [address, validation] of entries) {
        const { col, row } = parseAddress(address);
        if (row >= first && row <= oldLast) {
            if (!block.has(col)) block.set(col, validation);
        } else if (row > oldLast) {
            next[addressOf(col, row + delta)] = validation;
        } else {
            next[address] = validation;
        }
    }
    for (const [col, validation] of block) {
        // One range, not one entry per row: ExcelJS writes the model keys in string order, which would split F5:F44
        // into F10:F44 and F5:F9. A range key is written back as a single sqref, exactly like openpyxl's.
        const letter = columnLetter(col);
        next[first === newLast ? `${letter}${first}` : `${letter}${first}:${letter}${newLast}`] = validation;
    }
    ws.dataValidations.model = next;

    for (const formatting of ws.conditionalFormattings) {
        formatting.ref = formatting.ref.split(/\s+/).map((ref) => moved(parseRange(ref))).join(" ");
    }
}

/**
 * Make the template's data block hold `needed` rows (at least one), restyle it zebra-wise, return its last row.
 *
 * `merged` lists (left, right) column spans merged on every data row, e.g. the milestone scope column D:K.
 */
function resizeTable(ws, first, capacity, needed, columns, merged = []) {
    needed = Math.max(needed, 1);
    const delta = needed - capacity;
    const pivot = first + capacity;
    const protos = [0, 1].map((offset) => {
        const row = ws.getRow(first + offset);
        const styles = [];
        for (let col = 1; col <= columns; col += 1) styles.push(cloneStyle(row.getCell(col).style));
        return styles;
    });
    const heights = [0, 1].map((offset) => ws.getRow(first + offset).height);

    for (const rect of mergeRects(ws)) {
        if (rect.minRow >= first && rect.minRow < pivot) ws.unMergeCells(rangeStr(rect));
    }

    if (delta) {
        const pending = shiftMerges(ws, "row", pivot, delta);
        // openpyxl moves cells but not row dimensions; the script therefore clears and re-applies every height at or
        // past the pivot itself. Heights below the pivot keep their row number even when their row is deleted, which
        // is what the Python builder (and therefore the golden workbook) does.
        const heightsBefore = [];
        for (let row = 1; row <= ws.rowCount; row += 1) {
            const height = ws.getRow(row).height;
            if (height !== undefined && height !== null) heightsBefore.push([row, height]);
        }
        for (const [row] of heightsBefore) ws.getRow(row).height = undefined;
        if (delta > 0) {
            ws.spliceRows(pivot, 0, ...Array.from({ length: delta }, () => []));
        } else {
            // ExcelJS only reassigns the rows past the deleted block; clear it, or the old rows survive underneath.
            const start = first + needed;
            for (let row = start; row < start - delta; row += 1) {
                const sheetRow = ws.getRow(row);
                sheetRow.eachCell({ includeEmpty: true }, (cell) => {
                    cell.value = null;
                    cell.style = {};
                });
            }
            ws.spliceRows(start, -delta);
        }
        for (const [row, height] of heightsBefore) {
            ws.getRow(row < pivot ? row : row + delta).height = height;
        }
        mergeAgain(ws, pending);
        retarget(ws, first, pivot - 1, first + needed - 1, delta);
    }

    for (let i = 0; i < needed; i += 1) {
        const row = first + i;
        const sheetRow = ws.getRow(row);
        for (let col = 1; col <= columns; col += 1) {
            const cell = sheetRow.getCell(col);
            cell.style = cloneStyle(protos[i % 2][col - 1]);
            cell.value = null;
        }
        sheetRow.height = heights[i % 2];
        for (const [left, right] of merged) {
            ws.mergeCellsWithoutStyle(row, left, row, right);
        }
    }
    return first + needed - 1;
}

/** Insert `extra` sprint columns before Duration, styled like the last template sprint column (J). */
function addSprintColumns(ws, extra) {
    const pivot = 5 + TEMPLATE_SPRINT_SLOTS;
    const pending = shiftMerges(ws, "col", pivot, extra);
    const maxColumn = ws.columnCount;
    const maxRow = ws.rowCount;
    const widths = new Map();
    for (let col = pivot; col <= maxColumn; col += 1) widths.set(col, width(ws, col));

    ws.spliceColumns(pivot, 0, ...Array.from({ length: extra }, () => new Array(maxRow).fill(null)));

    for (const col of [...widths.keys()].sort((a, b) => b - a)) {
        ws.getColumn(col + extra).width = widths.get(col);
    }
    const sprintWidth = width(ws, pivot - 1);
    for (let col = pivot; col < pivot + extra; col += 1) {
        ws.getColumn(col).width = sprintWidth;
        for (let row = 1; row <= maxRow; row += 1) {
            ws.getCell(row, col).style = cloneStyle(ws.getCell(row, pivot - 1).style);
        }
    }
    mergeAgain(ws, pending);
}

/** Write a data value; text stays text even when it reads like a formula (`=SUM(...)`) or an error (`#N/A`). */
function literal(cell, value) {
    cell.value = value;
}

function put(ws, row, values, start = 1) {
    values.forEach((value, offset) => {
        literal(ws.getCell(row, start + offset), value);
    });
}

function setFormula(ws, address, formula) {
    ws.getCell(address).value = { formula: formula.replace(/^=/, "") };
}

/** Write a note into a merged band and grow its rows to fit. */
function band(ws, coordinate, text) {
    const cell = ws.getCell(coordinate);
    cell.value = text;
    for (const rect of mergeRects(ws)) {
        if (rect.minRow === cell.row && rect.minCol === cell.col) {
            fitRows(ws, rect.minRow, rect.maxRow, rect.minCol, rect.maxCol, 15.0);
            return;
        }
    }
    fitRows(ws, cell.row, cell.row, cell.col, cell.col, 15.0);
}

function leaveDays(text) {
    const count = (needle) => text.split(needle).length - 1;
    return count("Full day") + 0.5 * (count("Morning") + count("Afternoon"));
}

function leaveFormula(cell) {
    return `=(LEN(${cell})-LEN(SUBSTITUTE(${cell},"Full day","")))/LEN("Full day")`
        + `+0.5*(LEN(${cell})-LEN(SUBSTITUTE(${cell},"Morning","")))/LEN("Morning")`
        + `+0.5*(LEN(${cell})-LEN(SUBSTITUTE(${cell},"Afternoon","")))/LEN("Afternoon")`;
}

function breakdown(range, values, empty, separator) {
    const parts = values.map((value) => `"${value} "&COUNTIF(${range},"${value}")`).join(`&"${separator}"&`);
    return `=IF(COUNTA(${range})=0,"${empty}",${parts})`;
}

// --------------------------------------------------------------------------------------------------- sheets

function fillTasks(wb, data, anchors) {
    const ws = wb.getWorksheet("Task Detail");
    const allowed = allowedValues(ws, "F");
    ws.getCell("A2").value = `Task detail · ${span(data.meta.period, "meta.period")} · update all tasks worked on during the week`;
    const tasks = needList(data, "tasks", "data");
    const last = resizeTable(ws, TASKS, TASKS_ROWS, tasks.length, 8);
    const progress = allowed.map((status, index) => `"${status}",${PROGRESS_BY_STATUS[index]}%`).join(",");
    tasks.forEach((task, i) => {
        const where = `tasks[${i}]`;
        const row = TASKS + i;
        const status = check(need(task, "status", where), allowed, `${where}.status`);
        put(ws, row, [i + 1, optStr(task, "storyId", where, "—"), needStr(task, "task", where),
            optStr(task, "module", where), needStr(task, "assignee", where), status,
            null, optStr(task, "notes", where)]);
        setFormula(ws, `G${row}`, `=IF(F${row}="","",_xlfn.SWITCH(F${row},${progress},0%))`);
        fitDataRow(ws, row, 8, 15.0);
    });
    const total = last + 1;
    const range = `$F$${TASKS}:$F$${last}`;
    setFormula(ws, `F${total}`, `=IF(COUNTA(${range})=0,"",COUNTIF(${range},"Done")&" / "&COUNTA(${range}))`);
    setFormula(ws, `G${total}`, `=IFERROR(AVERAGE($G$${TASKS}:$G$${last}),"")`);
    setFormula(ws, `H${total}`, breakdown(range, allowed, "", "   ·   "));
    ws.autoFilter = `A4:H${last}`;
    ws.views = ws.views.map((view) => ({
        ...view, state: "frozen", xSplit: 0, ySplit: 4, topLeftCell: "A5", activeCell: "A1",
    }));
    anchors.tasks_total = `F${total}`;
    const done = tasks.filter((task) => task.status === "Done").length;
    return { "tasks complete": `${done} / ${tasks.length}` };
}

function fillLeave(wb, data, anchors) {
    const ws = wb.getWorksheet("Leave Plan");
    const meta = data.meta;
    const current = span(meta.period, "meta.period");
    const following = span(meta.nextPeriod, "meta.nextPeriod");
    ws.getCell("A2").value = `Leave plan · current week ${current} · next week ${following}`;
    const leave = needList(data, "leave", "data");
    const last = resizeTable(ws, LEAVE, LEAVE_ROWS, leave.length, 8);
    leave.forEach((person, i) => {
        const where = `leave[${i}]`;
        const row = LEAVE + i;
        put(ws, row, [i + 1, needStr(person, "role", where), needStr(person, "name", where),
            needStr(person, "current", where), needStr(person, "next", where),
            null, null, optStr(person, "impact", where)]);
        setFormula(ws, `F${row}`, leaveFormula(`D${row}`));
        setFormula(ws, `G${row}`, leaveFormula(`E${row}`));
        fitDataRow(ws, row, 8, 48.0);
    });
    const total = last + 1;
    setFormula(ws, `F${total}`, `=SUM(F${LEAVE}:F${last})`);
    setFormula(ws, `G${total}`, `=SUM(G${LEAVE}:G${last})`);

    const capacity = needList(data, "capacity", "data");
    if (capacity.length !== 2) {
        throw new DataError("capacity must have exactly two rows: the current week, then next week");
    }
    const firstCapacity = total + CAPACITY_OFFSET;
    capacity.forEach((week, i) => {
        const where = `capacity[${i}]`;
        const row = firstCapacity + i;
        const days = need(week, "workingDays", where);
        if (typeof days === "boolean" || typeof days !== "number" || !(days >= 0 && days <= 7)) {
            throw new DataError(`${where}.workingDays must be a number of days between 0 and 7`);
        }
        put(ws, row, [needStr(week, "week", where), days, null, null, null, null, optStr(week, "note", where)], 2);
        const formulas = [
            `=COUNTA($C$${LEAVE}:$C$${last})`,
            `=C${row}*D${row}`,
            `=$${"FG"[i]}${total}`,
            `=E${row}-F${row}`,
        ];
        "DEFG".split("").forEach((column, index) => setFormula(ws, `${column}${row}`, formulas[index]));
        fitDataRow(ws, row, 8, 30.0);
    });
    for (const column of "EFG") {
        setFormula(ws, `${column}${firstCapacity + 2}`, `=SUM(${column}${firstCapacity}:${column}${firstCapacity + 1})`);
    }

    anchors.next_available = `G${firstCapacity + 1}`;
    anchors.next_capacity = `E${firstCapacity + 1}`;
    const daysOff = [
        leave.reduce((sum, person) => sum + leaveDays(person.current), 0),
        leave.reduce((sum, person) => sum + leaveDays(person.next), 0),
    ];
    const nextCapacity = capacity[1].workingDays * leave.length;
    return {
        "leave days (current, next)": formatPythonList(daysOff, leave.length > 0),
        "next week available / capacity (md)": `${leave.length === 0 ? nextCapacity : pyFloat(nextCapacity - daysOff[1])} / ${nextCapacity}`,
    };
}

function fillWbs(wb, data) {
    const ws = wb.getWorksheet("WBS Timeline");
    const wbs = need(data, "wbs", "data");
    const statuses = allowedValues(ws, "D");
    const sprints = needList(wbs, "sprints", "wbs", true);
    const names = sprints.map((sprint, i) => needStr(sprint, "name", `wbs.sprints[${i}]`));
    names.forEach((name, i) => {
        if (names.slice(0, i).includes(name)) {
            throw new DataError(`wbs.sprints[${i}].name: duplicate sprint ${pyRepr(name)}`);
        }
    });

    // ExcelJS keeps one Column object per column (openpyxl needs the grouped E:J dimensions split first).
    if (sprints.length > TEMPLATE_SPRINT_SLOTS) addSprintColumns(ws, sprints.length - TEMPLATE_SPRINT_SLOTS);
    const slots = Math.max(sprints.length, TEMPLATE_SPRINT_SLOTS);
    const firstCol = 5;
    const lastCol = 4 + slots;
    const durationCol = lastCol + 1;
    const dur = columnLetter(durationCol);
    const lastLetter = columnLetter(lastCol);

    const starts = [];
    const ends = [];
    for (let i = 0; i < slots; i += 1) {
        const letter = columnLetter(firstCol + i);
        if (i >= sprints.length) {
            ws.getCell(`${letter}4`).value = null;
            ws.getColumn(letter).hidden = true;
            continue;
        }
        const where = `wbs.sprints[${i}]`;
        const start = iso(need(sprints[i], "from", where), where);
        const end = iso(need(sprints[i], "to", where), where);
        starts.push(start);
        ends.push(end);
        literal(ws.getCell(`${letter}4`), `${names[i]}\n${plain(start)} ~ ${plain(end)}`);
    }
    const weeks = Object.prototype.hasOwnProperty.call(wbs, "sprintWeeks") ? wbs.sprintWeeks : 2;
    const caveat = wbs.caveat ? ` · ${optStr(wbs, "caveat", "wbs")}` : "";
    ws.getCell("A2").value = `WBS timeline · ${sprints.length} sprints × ${weeks} weeks`
        + ` · ${dotted(starts.reduce((a, b) => (compareDays(a, b) <= 0 ? a : b)))}`
        + ` → ${dotted(ends.reduce((a, b) => (compareDays(a, b) >= 0 ? a : b)))}${caveat}`;

    const milestones = needList(wbs, "milestones", "wbs");
    const scope = [[4, durationCol]];
    resizeTable(ws, MILESTONES, MILESTONE_ROWS, milestones.length, durationCol, scope);
    milestones.forEach((item, i) => {
        const where = `wbs.milestones[${i}]`;
        const row = MILESTONES + i;
        put(ws, row, [i + 1, needStr(item, "name", where), dotted(iso(need(item, "endDate", where), where)),
            needStr(item, "scope", where)]);
        fitDataRow(ws, row, durationCol, 15.0, scope);
    });

    const rows = needList(wbs, "rows", "wbs", true);
    const last = resizeTable(ws, WBS, WBS_ROWS, rows.length, durationCol);
    rows.forEach((item, i) => {
        const where = `wbs.rows[${i}]`;
        const row = WBS + i;
        put(ws, row, [i + 1, needStr(item, "phase", where), optStr(item, "owner", where),
            check(need(item, "status", where), statuses, `${where}.status`)]);
        const mdBySprint = item.md === undefined ? {} : item.md;
        if (!mdBySprint || typeof mdBySprint !== "object" || Array.isArray(mdBySprint)) {
            throw new DataError(`${where}.md: expected an object of man-days by sprint name, got ${pyRepr(mdBySprint)}`);
        }
        for (const [name, md] of Object.entries(mdBySprint)) {
            if (!names.includes(name)) {
                throw new DataError(`${where}.md names sprint ${pyRepr(name)}, which is not in wbs.sprints`);
            }
            ws.getCell(row, firstCol + names.indexOf(name)).value = needNum(md, `${where}.md.${name}`);
        }
        setFormula(ws, `${dur}${row}`, `=IF(COUNTA(B${row}:${lastLetter}${row})=0,"",SUM(E${row}:${lastLetter}${row}))`);
        fitDataRow(ws, row, 4, 15.0);
    });
    const total = last + 1;
    for (let col = firstCol; col <= durationCol; col += 1) {
        const letter = columnLetter(col);
        setFormula(ws, `${letter}${total}`, `=SUM(${letter}${WBS}:${letter}${last})`);
    }

    const bars = `E${WBS}:${lastLetter}${last}`;
    const rules = [];
    for (const [status, [fill, font]] of WBS_BAR_COLOURS) {
        rules.push({
            type: "expression",
            formulae: [`AND(ISNUMBER(E${WBS}),E${WBS}>0,$D${WBS}="${status}")`],
            style: {
                fill: {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: `00${fill}` },
                    bgColor: { argb: `00${fill}` },
                },
                font: { bold: true, color: { argb: `00${font}` } },
            },
        });
    }
    ws.addConditionalFormatting({ ref: bars, rules });
}

function fillQuality(wb, data) {
    const ws = wb.getWorksheet("Quality Metrics");
    const allowed = allowedValues(ws, "E");
    const meta = data.meta;
    const measured = dotted(iso(need(meta, "measuredOn", "meta"), "meta.measuredOn"));
    ws.getCell("A2").value = `Quality metrics · measured ${measured} against ${needStr(meta, "measuredAgainst", "meta")}`;
    const metrics = needList(data, "metrics", "data");
    const last = resizeTable(ws, METRICS, METRICS_ROWS, metrics.length, 6);
    metrics.forEach((metric, i) => {
        const where = `metrics[${i}]`;
        const row = METRICS + i;
        put(ws, row, [i + 1, needStr(metric, "metric", where), needStr(metric, "result", where),
            optStr(metric, "target", where),
            check(need(metric, "status", where), allowed, `${where}.status`), optStr(metric, "notes", where)]);
        fitDataRow(ws, row, 6, 15.0);
    });
    const total = last + 1;
    const range = `$E$${METRICS}:$E$${last}`;
    setFormula(ws, `E${total}`, `=IF(COUNTA(${range})=0,"—",COUNTIF(${range},"Pass")&"/"&COUNTA(${range}))`);
    setFormula(ws, `F${total}`, breakdown(range, allowed, "", "   ·   "));
    band(ws, `A${total + METRICS_NOTE_OFFSET}`, `Management note — ${needStr(data, "qualityNote", "data")}`);
}

function fillRisks(wb, data) {
    const ws = wb.getWorksheet("Risks & Open Questions");
    const allowed = allowedValues(ws, "H");
    const risks = needList(data, "risks", "data");
    const last = resizeTable(ws, RISKS, RISKS_ROWS, risks.length, 8);
    risks.forEach((risk, i) => {
        const where = `risks[${i}]`;
        const row = RISKS + i;
        put(ws, row, [i + 1, needStr(risk, "ref", where), needStr(risk, "item", where),
            needStr(risk, "impact", where),
            optStr(risk, "raised", where), optStr(risk, "due", where), optStr(risk, "owner", where),
            check(need(risk, "severity", where), allowed, `${where}.severity`)]);
        fitDataRow(ws, row, 8, 15.0);
    });
    const total = last + 1;
    const range = `$H$${RISKS}:$H$${last}`;
    const openLevels = allowed.filter((level) => level !== "Resolved");
    setFormula(ws, `F${total}`, breakdown(range, openLevels, "—", "  ·  "));
    setFormula(ws, `H${total}`, `=IF(COUNTA(${range})=0,"","✓ "&COUNTIF(${range},"Resolved"))`);
    ws.autoFilter = `A4:H${last}`;
    band(ws, `A${total + RISKS_NOTE_OFFSET}`, `ACTION REQUIRED — ${needStr(data, "actionRequired", "data")}`);
}

function fillWeekly(wb, data, anchors) {
    const ws = wb.getWorksheet("Weekly Report");
    const meta = data.meta;
    const current = span(meta.period, "meta.period");
    const following = span(meta.nextPeriod, "meta.nextPeriod");
    ws.getCell("A2").value = `Weekly Report · ${current} · ${needStr(meta.period, "label", "meta.period")}`;
    ws.getCell("C4").value = current;
    literal(ws.getCell("C5"), needStr(meta, "sprint", "meta"));
    literal(ws.getCell("C6"), needStr(meta, "overallStatus", "meta"));
    literal(ws.getCell("C9"), needStr(meta, "preparedBy", "meta"));
    ws.getCell("C10").value = dotted(iso(need(meta, "issued", "meta"), "meta.issued"));
    fitRows(ws, 6, 6, 3, 5, 15.0);
    ws.getCell("D13").value = `Current week · ${current}`;
    ws.getCell("E13").value = `Plan for next week · ${following}`;
    const tasksTotal = anchors.tasks_total;
    setFormula(ws, "C7", `=IF('Task Detail'!${tasksTotal}="","—",'Task Detail'!${tasksTotal})`);
    const nextAvailable = anchors.next_available;
    const nextCapacity = anchors.next_capacity;
    setFormula(ws, "C8", `=IF('Leave Plan'!${nextCapacity}=0,"—",'Leave Plan'!${nextAvailable}&" of "&'Leave Plan'!${nextCapacity}&" man-days next week")`);

    // Lower table first, so the upper table's template row numbers are still valid when it is resized.
    const people = needList(data, "people", "data");
    let last = resizeTable(ws, WR_PEOPLE, WR_PEOPLE_ROWS, people.length, 5);
    let shift = last - (WR_PEOPLE + WR_PEOPLE_ROWS - 1);
    people.forEach((person, i) => {
        const where = `people[${i}]`;
        put(ws, WR_PEOPLE + i, [i + 1, needStr(person, "role", where), needStr(person, "name", where),
            needStr(person, "contribution", where), needStr(person, "plan", where)]);
        fitDataRow(ws, WR_PEOPLE + i, 5, 25.5);
    });

    const progress = needList(data, "progress", "data");
    last = resizeTable(ws, WR_PROGRESS, WR_PROGRESS_ROWS, progress.length, 5);
    shift += last - (WR_PROGRESS + WR_PROGRESS_ROWS - 1);
    progress.forEach((item, i) => {
        const where = `progress[${i}]`;
        put(ws, WR_PROGRESS + i, [i + 1, needStr(item, "phase", where), needStr(item, "task", where),
            needStr(item, "current", where), needStr(item, "next", where)]);
        fitDataRow(ws, WR_PROGRESS + i, 5, 15.0);
    });
    band(ws, `A${WR_NOTE + shift}`, `Capacity note — ${needStr(data, "capacityNote", "data")}`);
}

// ----------------------------------------------------------------------------------------------------- main

async function loadWorkbook(file) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file);
    for (const ws of workbook.worksheets) {
        // openpyxl copies the bottom-right cell's right and bottom border onto the merge's master cell;
        // ExcelJS leaves it on the corner cell, so the outline would be lost when the block is re-styled.
        for (const rect of mergeRects(ws)) {
            const master = ws.getCell(rect.minRow, rect.minCol);
            const corner = ws.getCell(rect.maxRow, rect.maxCol).border || {};
            const border = { ...(master.border || {}) };
            for (const side of ["right", "bottom"]) {
                if (!border[side] && corner[side]) border[side] = corner[side];
            }
            master.border = border;
        }
        // ExcelJS keeps one block per <conditionalFormatting> and reads <i val="0"/> as italic on,
        // while openpyxl merges same-range blocks and writes no italic. Normalise to the Python output.
        const blocks = [];
        for (const block of ws.conditionalFormattings) {
            for (const rule of block.rules) {
                if (rule.style && rule.style.font) delete rule.style.font.italic;
            }
            const same = blocks.find((existing) => existing.ref === block.ref);
            if (same) same.rules.push(...block.rules);
            else blocks.push({ ref: block.ref, rules: [...block.rules] });
        }
        ws.conditionalFormattings = blocks;
        // openpyxl writes an unfilled pattern as <patternFill/>; keep the same serialisation.
        ws.eachRow({ includeEmpty: false }, (row) => {
            row.eachCell({ includeEmpty: false }, (cell) => {
                if (cell.fill && cell.fill.pattern === "none") delete cell.fill.pattern;
            });
        });
    }
    return workbook;
}

/** Cells still holding a placeholder the template ships, e.g. [PROJECT NAME] or [DATE RANGE]. */
async function leftoverPlaceholders(template, wb) {
    const source = await loadWorkbook(template);
    const tokens = new Set();
    for (const ws of source.worksheets) {
        ws.eachRow({ includeEmpty: false }, (row) => {
            row.eachCell({ includeEmpty: false }, (cell) => {
                if (typeof cell.value !== "string") return;
                for (const match of cell.value.matchAll(PLACEHOLDER)) tokens.add(match[0]);
            });
        });
    }
    const left = [];
    for (const ws of wb.worksheets) {
        ws.eachRow({ includeEmpty: false }, (row) => {
            row.eachCell({ includeEmpty: false }, (cell) => {
                if (typeof cell.value !== "string") return;
                if ([...tokens].some((token) => cell.value.includes(token))) left.push(`${ws.name}!${cell.address}`);
            });
        });
    }
    return left;
}

async function build(data, template, outDir) {
    scan(data, "");
    const meta = need(data, "meta", "data");
    const project = needStr(meta, "project", "meta");
    if (FORBIDDEN_IN_NAME.test(project)) {
        throw new DataError(`meta.project ${pyRepr(project)} cannot be used in a file name`);
    }
    const start = iso(need(need(meta, "period", "meta"), "from", "meta.period"), "meta.period.from");
    const end = iso(need(meta.period, "to", "meta.period"), "meta.period.to");
    if (compareDays(start, end) > 0) {
        throw new DataError(`meta.period: from ${isoString(start)} is after to ${isoString(end)}`);
    }
    need(meta, "nextPeriod", "meta");

    const wb = await loadWorkbook(template);
    for (const ws of wb.worksheets) {
        ws.getCell("A1").value = `${project} — PROJECT WEEKLY REPORT`;
    }
    const anchors = {};
    const expected = {};
    Object.assign(expected, fillTasks(wb, data, anchors));
    Object.assign(expected, fillLeave(wb, data, anchors));
    fillWbs(wb, data);
    fillQuality(wb, data);
    fillRisks(wb, data);
    fillWeekly(wb, data, anchors); // last: it points at cells the other sheets placed

    const left = await leftoverPlaceholders(template, wb);
    if (left.length) {
        throw new DataError(`template placeholders left unfilled: ${left.join(", ")}`);
    }

    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `${project}_Weekly Report_${start.year}${pad(start.month)}${pad(start.day)}`
        + `~${end.year}${pad(end.month)}${pad(end.day)}.xlsx`);
    await wb.xlsx.writeFile(file);
    return [file, expected];
}

function usage(prog) {
    return `usage: ${prog} [-h] --data DATA --out OUT [--template TEMPLATE]`;
}

function parseArgs(argv) {
    const prog = path.basename(process.argv[1] || "build_weekly_report.mjs");
    const args = { template: DEFAULT_TEMPLATE };
    const die = (message) => {
        process.stderr.write(`${usage(prog)}\n${prog}: error: ${message}\n`);
        process.exit(2);
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "-h" || arg === "--help") {
            process.stdout.write(`${usage(prog)}

Fill the CPT weekly-report workbook template from a JSON data file.

options:
  -h, --help           show this help message and exit
  --data DATA          weekly data JSON (references/weekly-data-contract.md)
  --out OUT            directory to write the workbook into
  --template TEMPLATE  workbook template
`);
            process.exit(0);
        }
        const match = /^--(data|out|template)(?:=(.*))?$/.exec(arg);
        if (!match) die(`unrecognized arguments: ${arg}`);
        const [, name, inline] = match;
        let value = inline;
        if (value === undefined) {
            i += 1;
            if (i >= argv.length || argv[i].startsWith("-")) die(`argument --${name}: expected one argument`);
            value = argv[i];
        }
        args[name] = value;
    }
    const missing = ["data", "out"].filter((name) => args[name] === undefined);
    if (missing.length) {
        die(`the following arguments are required: ${missing.map((name) => `--${name}`).join(", ")}`);
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!fs.existsSync(args.template) || !fs.statSync(args.template).isFile()) {
        process.stderr.write(`template not found: ${args.template}\n`);
        return 2;
    }
    try {
        let text;
        try {
            text = fs.readFileSync(args.data, "utf8");
        } catch (error) {
            if (error.code === "ENOENT") throw new DataError(`[Errno 2] No such file or directory: '${args.data}'`);
            throw error;
        }
        const data = parseJson(text);
        const [file, expected] = await build(data, args.template, args.out);
        process.stdout.write(`written: ${file}\n`);
        for (const [label, value] of Object.entries(expected)) {
            if (Array.isArray(value)) {
                process.stdout.write(`expected ${label}: [${value.map(pyFloat).join(", ")}]\n`);
            } else {
                process.stdout.write(`expected ${label}: ${value}\n`);
            }
        }
        return 0;
    } catch (error) {
        process.stderr.write(`error: ${error.message}\n`);
        return 1;
    }
}

main().then((code) => {
    process.exitCode = code;
});
