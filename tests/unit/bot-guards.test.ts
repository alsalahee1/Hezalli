import { describe, expect, it } from "vitest";

import { checkRate, estimateCostUsd, MAX_PER_HOUR } from "@/lib/ai/guards-core";

const HOUR = 3_600_000;

describe("checkRate", () => {
  it("allows the first request and records the timestamp", () => {
    const now = 1_000_000_000;
    const r = checkRate([], now);
    expect(r.ok).toBe(true);
    expect(r.hits).toEqual([now]);
  });

  it("blocks once the hourly cap is reached", () => {
    const now = 2_000_000_000;
    const full = Array.from({ length: MAX_PER_HOUR }, (_, i) => now - i * 1000);
    const r = checkRate(full, now);
    expect(r.ok).toBe(false);
    // No new hit is appended when blocked.
    expect(r.hits.length).toBe(MAX_PER_HOUR);
  });

  it("drops timestamps older than an hour before counting", () => {
    const now = 3_000_000_000;
    const stale = Array.from({ length: MAX_PER_HOUR }, () => now - HOUR - 1000);
    const r = checkRate(stale, now);
    expect(r.ok).toBe(true); // all stale entries expired → room again
    expect(r.hits).toEqual([now]);
  });

  it("treats a non-array (corrupt) value as empty", () => {
    const now = 4_000_000_000;
    const r = checkRate("not-an-array", now);
    expect(r.ok).toBe(true);
    expect(r.hits).toEqual([now]);
  });
});

describe("estimateCostUsd", () => {
  it("is zero for no tokens", () => {
    expect(estimateCostUsd(0, 0)).toBe(0);
  });

  it("scales with input and output tokens", () => {
    // 1M in + 1M out at default rates (0.30 + 2.50).
    expect(estimateCostUsd(1_000_000, 1_000_000)).toBeCloseTo(2.8, 5);
  });
});
