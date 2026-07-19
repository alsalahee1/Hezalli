import { describe, expect, it } from "vitest";

import { capRedemption, pointsToUsd } from "@/lib/loyalty";

describe("pointsToUsd", () => {
  it("converts at 100 points per dollar", () => {
    expect(pointsToUsd(250)).toBe(2.5);
    expect(pointsToUsd(100)).toBe(1);
  });
});

describe("capRedemption", () => {
  it("redeems the full request when within balance and the cap", () => {
    // items 100 → 50% cap = $50; 500 pts = $5
    expect(capRedemption(500, 1000, 100)).toEqual({
      pointsUsed: 500,
      discountUsd: 5,
    });
  });

  it("caps to the available balance", () => {
    expect(capRedemption(500, 300, 100)).toEqual({
      pointsUsed: 300,
      discountUsd: 3,
    });
  });

  it("caps to 50% of the items subtotal", () => {
    // items 20 → max discount $10 → 1000 pts, even though 100000 requested
    expect(capRedemption(100000, 100000, 20)).toEqual({
      pointsUsed: 1000,
      discountUsd: 10,
    });
  });

  it("is a no-op for zero / negative requests", () => {
    expect(capRedemption(0, 1000, 100)).toEqual({
      pointsUsed: 0,
      discountUsd: 0,
    });
    expect(capRedemption(-50, 1000, 100)).toEqual({
      pointsUsed: 0,
      discountUsd: 0,
    });
  });
});
