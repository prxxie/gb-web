/**
 * One JSON line per request (`NFR-24`).
 *
 * Field names are fixed by `docs/08-ops/runbook.md`: an alert names a literal string like
 * `workers.api.5xx.rate`, so the log shape must not drift. PII never appears here — no email, no
 * display name, no token (`NFR-13`).
 */

export interface LogFields {
  readonly request_id: string;
  readonly route: string;
  readonly method: string;
  readonly status: number;
  readonly duration_ms: number;
  readonly room_code?: string;
  readonly player_id?: string;
  readonly account_id?: string;
  readonly code?: string;
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
      sink(JSON.stringify({ level: "info", ...fields, request_id: requestId }));
    },
  };
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
