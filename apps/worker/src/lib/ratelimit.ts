/**
 * In-isolate rate limiting (`US-OPS-001`).
 *
 * Deliberately simple and deliberately documented as approximate: an isolate counter resets when the
 * isolate recycles, so the limit is a cheap abuse brake, not a contract. It **fails open** — a
 * limiter problem must never lock players out of a match (`conventions.md#10`).
 */

export interface LimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

export interface LimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export function checkLimit(key: string, rule: LimitRule, now: number = Date.now()): LimitResult {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };
  }
  existing.count += 1;
  if (existing.count > rule.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, remaining: rule.limit - existing.count, retryAfterSeconds: 0 };
}

export const RULES = {
  roomsPerIp: { limit: 10, windowMs: 60_000 },
  sessionsPerIp: { limit: 30, windowMs: 60_000 },
  matchesPerAccount: { limit: 30, windowMs: 3_600_000 },
  matchesPerMatch: { limit: 1, windowMs: 86_400_000 },
} as const satisfies Record<string, LimitRule>;

/** Test hook: the counters are module state, so a test resets them between cases. */
export function resetLimits(): void {
  buckets.clear();
}
