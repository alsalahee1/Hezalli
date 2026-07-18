// In-memory fixed-window rate limiter.
//
// NOTE: state lives in the process, so in a multi-instance / serverless
// deployment this must be backed by a shared store (Redis / Upstash) to be
// authoritative. On a single instance it meaningfully throttles brute-force
// against login/register and abuse of write endpoints. The `now` parameter
// keeps it deterministic for tests.
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateResult = { ok: boolean; retryAfterSec: number };

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateResult {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/** Evict expired buckets so the map can't grow without bound. */
export function evictExpired(now: number = Date.now()): void {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

/** Test helper — clears all buckets. */
export function __resetRateLimits(): void {
  buckets.clear();
}
