import { beforeEach, describe, expect, it } from "vitest";

import { __resetRateLimits, evictExpired, rateLimit } from "@/lib/rate-limit";

beforeEach(() => __resetRateLimits());

describe("rateLimit", () => {
  it("allows up to the limit, then blocks within the window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("k", 5, 60_000, t0).ok).toBe(true);
    }
    const blocked = rateLimit("k", 5, 60_000, t0);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 5; i++) rateLimit("k", 5, 60_000, t0);
    expect(rateLimit("k", 5, 60_000, t0).ok).toBe(false);
    // one window later
    expect(rateLimit("k", 5, 60_000, t0 + 60_001).ok).toBe(true);
  });

  it("tracks keys independently", () => {
    const t0 = 3_000_000;
    for (let i = 0; i < 5; i++) rateLimit("a", 5, 60_000, t0);
    expect(rateLimit("a", 5, 60_000, t0).ok).toBe(false);
    expect(rateLimit("b", 5, 60_000, t0).ok).toBe(true);
  });

  it("evicts expired buckets", () => {
    const t0 = 4_000_000;
    rateLimit("gone", 1, 1_000, t0);
    expect(rateLimit("gone", 1, 1_000, t0).ok).toBe(false);
    evictExpired(t0 + 2_000);
    // bucket cleared → allowed again
    expect(rateLimit("gone", 1, 1_000, t0 + 2_000).ok).toBe(true);
  });
});
