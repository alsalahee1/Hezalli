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

// --- Optional distributed backend (Upstash Redis REST) ---------------------
// The in-memory limiter above is authoritative on a single instance (the
// default Docker deploy). On multi-instance / serverless, IP-keyed limits
// (login, register, AI, tracking) must be shared or each instance enforces its
// own quota. When UPSTASH_REDIS_REST_URL + _TOKEN are set, `rateLimitAsync`
// uses a shared fixed-window counter; otherwise it transparently falls back to
// the in-memory limiter, and it also falls back on any backend error/timeout so
// a limiter outage never takes down the request path.
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export function distributedRateLimitConfigured(): boolean {
  return Boolean(UPSTASH_URL && UPSTASH_TOKEN);
}

export async function rateLimitAsync(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateResult> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return rateLimit(key, limit, windowMs);
  const ttlSec = Math.ceil(windowMs / 1000);
  try {
    // One round-trip: INCR the window counter and set its TTL only if unset
    // (NX), so the window starts at the first hit and expires cleanly.
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${UPSTASH_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", `rl:${key}`],
        ["EXPIRE", `rl:${key}`, String(ttlSec), "NX"],
      ]),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return rateLimit(key, limit, windowMs);
    const data = (await res.json()) as { result?: unknown }[];
    const count = Number(data?.[0]?.result ?? NaN);
    if (!Number.isFinite(count) || count <= 0) {
      return rateLimit(key, limit, windowMs);
    }
    return count > limit
      ? { ok: false, retryAfterSec: ttlSec }
      : { ok: true, retryAfterSec: 0 };
  } catch {
    // Network error / timeout / bad response → fall back, never hard-fail.
    return rateLimit(key, limit, windowMs);
  }
}

/** Test helper — clears all buckets. */
export function __resetRateLimits(): void {
  buckets.clear();
}
