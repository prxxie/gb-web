/**
 * Boundary validation (`06-security.md`).
 *
 * External input is parsed into a typed shape with a schema before any handler sees it, and every
 * rejection lists the offending field with a dot path. Hand-rolled instead of adding a dependency:
 * the shapes are small and the rule is the same one the reference layer documents
 * (`docs/02-reference/api/*.md`, `validation` problems with `errors[]`).
 */
import { ProblemError, type FieldError } from "./problem.js";

export class Field {
  private readonly errors: FieldError[];

  constructor(errors: FieldError[]) {
    this.errors = errors;
  }

  fail(path: string, detail: string): void {
    this.errors.push({ field: path, detail });
  }

  string(value: unknown, path: string, options: { min?: number; max?: number; pattern?: RegExp } = {}): string {
    if (typeof value !== "string") {
      this.fail(path, "must be a string");
      return "";
    }
    const trimmed = value.trim();
    if (options.min !== undefined && trimmed.length < options.min) this.fail(path, `must be at least ${options.min} characters`);
    if (options.max !== undefined && trimmed.length > options.max) this.fail(path, `must be at most ${options.max} characters`);
    if (options.pattern && !options.pattern.test(trimmed)) this.fail(path, "has an unexpected format");
    return trimmed;
  }

  number(value: unknown, path: string, options: { min?: number; max?: number; integer?: boolean } = {}): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
      this.fail(path, "must be a number");
      return 0;
    }
    if (options.integer && !Number.isInteger(value)) this.fail(path, "must be an integer");
    if (options.min !== undefined && value < options.min) this.fail(path, `must be at least ${options.min}`);
    if (options.max !== undefined && value > options.max) this.fail(path, `must be at most ${options.max}`);
    return value;
  }

  boolean(value: unknown, path: string): boolean {
    if (typeof value !== "boolean") {
      this.fail(path, "must be a boolean");
      return false;
    }
    return value;
  }

  oneOf<T extends string | number>(value: unknown, path: string, allowed: readonly T[]): T {
    if (!allowed.includes(value as T)) {
      this.fail(path, `must be one of ${allowed.join(", ")}`);
      return allowed[0] as T;
    }
    return value as T;
  }

  done(): void {
    if (this.errors.length > 0) {
      throw new ProblemError("validation", "One or more fields are invalid", this.errors);
    }
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ProblemError("bad-request", "Body is not valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProblemError("bad-request", "Body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export function requireIdempotencyKey(request: Request): string | null {
  const key = request.headers.get("idempotency-key");
  if (key === null) return null;
  if (key.trim().length < 8 || key.trim().length > 128) {
    throw new ProblemError("validation", "Idempotency-Key must be 8–128 characters");
  }
  return key.trim();
}

export function cursorOf(url: URL): string | null {
  const value = url.searchParams.get("cursor");
  return value && value.length > 0 ? value : null;
}

export function limitOf(url: URL, fallback = 20): number {
  const raw = url.searchParams.get("limit");
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 100);
}
