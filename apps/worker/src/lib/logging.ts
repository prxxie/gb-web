/**
 * One JSON line per request (`NFR-24`).
 *
 * Field names are fixed by `docs/08-ops/runbook.md`: an alert names a literal string like
 * `workers.api.5xx.rate`, so the log shape must not drift. PII never appears here — no email, no
 * display name, no token (`NFR-13`).
 */

export interface LogFields {
  readonly request_id: string;
  /** Method plus the public path, e.g. `POST /api/v1/rooms` — the SLO queries filter on this shape. */
  readonly route: string;
  readonly method: string;
  readonly cf_ray?: string;
  readonly level?: "info" | "warn" | "error";
  readonly status: number;
  readonly duration_ms: number;
  readonly room_code?: string;
  readonly player_id?: string;
  readonly account_id?: string;
  readonly code?: string;
  /** The rate-limit rule that refused, when the line is a 429 (`US-OPS-001` AC3). */
  readonly limit?: string;
  readonly error?: string;
}

export interface Logger {
  readonly requestId: string;
  line(fields: Omit<LogFields, "request_id">): void;
}

export function createLogger(requestId: string, sink: (line: string) => void): Logger {
  return {
    requestId,
    line(fields) {
      const { level = "info", ...rest } = fields;
      sink(JSON.stringify({ ...rest, request_id: requestId, level }));
    },
  };
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
