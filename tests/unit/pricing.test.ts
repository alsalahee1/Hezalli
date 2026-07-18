import { describe, expect, it } from "vitest";

import { effectivePrice, saleActive, type PricedVariant } from "@/lib/pricing";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000; // fixed reference instant

const variant = (over: Partial<PricedVariant>): PricedVariant => ({
  price: 40,
  compareAtPrice: null,
  saleStartsAt: null,
  saleEndsAt: null,
  ...over,
});

describe("effectivePrice", () => {
  it("no compareAt → just the price, nothing struck", () => {
    expect(effectivePrice(variant({ price: 50 }), NOW)).toEqual({
      price: 50,
      compareAt: null,
    });
  });

  it("always-on discount (compareAt, no window) → sale price + strike", () => {
    expect(
      effectivePrice(variant({ price: 40, compareAtPrice: 50 }), NOW),
    ).toEqual({ price: 40, compareAt: 50 });
  });

  it("inside a scheduled window → sale price is live", () => {
    const v = variant({
      price: 40,
      compareAtPrice: 50,
      saleStartsAt: new Date(NOW - DAY),
      saleEndsAt: new Date(NOW + DAY),
    });
    expect(effectivePrice(v, NOW)).toEqual({ price: 40, compareAt: 50 });
  });

  it("before the window starts → reverts to the original price", () => {
    const v = variant({
      price: 40,
      compareAtPrice: 50,
      saleStartsAt: new Date(NOW + DAY),
      saleEndsAt: new Date(NOW + 2 * DAY),
    });
    expect(effectivePrice(v, NOW)).toEqual({ price: 50, compareAt: null });
  });

  it("after the window ends → reverts to the original price", () => {
    const v = variant({
      price: 40,
      compareAtPrice: 50,
      saleStartsAt: new Date(NOW - 2 * DAY),
      saleEndsAt: new Date(NOW - DAY),
    });
    expect(effectivePrice(v, NOW)).toEqual({ price: 50, compareAt: null });
  });
});

describe("saleActive", () => {
  it("is false without a compareAt", () => {
    expect(saleActive(variant({ compareAtPrice: null }), NOW)).toBe(false);
  });
  it("respects an open-ended start", () => {
    const v = variant({
      compareAtPrice: 50,
      saleStartsAt: new Date(NOW - DAY),
    });
    expect(saleActive(v, NOW)).toBe(true);
  });
  it("is false once ended", () => {
    const v = variant({ compareAtPrice: 50, saleEndsAt: new Date(NOW - 1) });
    expect(saleActive(v, NOW)).toBe(false);
  });
});
