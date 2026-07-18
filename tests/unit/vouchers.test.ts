import { describe, expect, it } from "vitest";

import {
  computeDiscount,
  type CouponInfo,
  type CartGroup,
} from "@/lib/vouchers";

const coupon = (over: Partial<CouponInfo>): CouponInfo => ({
  id: "c1",
  code: "TEST",
  scope: "PLATFORM",
  storeId: null,
  discountType: "PERCENT",
  value: 10,
  maxDiscountUsd: null,
  minSpendUsd: null,
  maxUses: null,
  ...over,
});

const g = (storeId: string, itemsTotal: number, shipping = 0): CartGroup => ({
  storeId,
  itemsTotal,
  shipping,
});

describe("computeDiscount — percent", () => {
  it("applies a percentage to the items subtotal", () => {
    const d = computeDiscount(coupon({ value: 10 }), [g("s1", 100)]);
    expect(d.total).toBe(10);
    expect(d.perStore.s1).toBe(10);
    expect(d.freeShipping).toBe(false);
  });

  it("splits a platform percent across sellers proportionally by items", () => {
    // items 100 + 300 = 400; 10% = 40 → 10 to s1, 30 to s2
    const d = computeDiscount(coupon({ value: 10 }), [
      g("s1", 100),
      g("s2", 300),
    ]);
    expect(d.total).toBe(40);
    expect(d.perStore.s1).toBe(10);
    expect(d.perStore.s2).toBe(30);
  });

  it("last group absorbs rounding so the split always sums to the total", () => {
    // three thirds of a 10% on 100 → 3.33 + 3.33 + 3.34 = 10.00
    const d = computeDiscount(coupon({ value: 30 }), [
      g("a", 33.33),
      g("b", 33.33),
      g("c", 33.34),
    ]);
    const sum = Object.values(d.perStore).reduce((s, v) => s + v, 0);
    expect(Math.round(sum * 100) / 100).toBe(d.total);
  });
});

describe("computeDiscount — fixed", () => {
  it("subtracts a fixed amount", () => {
    const d = computeDiscount(coupon({ discountType: "FIXED", value: 25 }), [
      g("s1", 100),
    ]);
    expect(d.total).toBe(25);
  });

  it("never discounts more than the items subtotal", () => {
    const d = computeDiscount(coupon({ discountType: "FIXED", value: 200 }), [
      g("s1", 100),
    ]);
    expect(d.total).toBe(100);
  });
});

describe("computeDiscount — free shipping", () => {
  it("waives shipping for the applicable groups", () => {
    const d = computeDiscount(coupon({ discountType: "FREE_SHIPPING" }), [
      g("s1", 100, 5),
      g("s2", 50, 8),
    ]);
    expect(d.freeShipping).toBe(true);
    expect(d.total).toBe(13);
    expect(d.perStore.s1).toBe(5);
    expect(d.perStore.s2).toBe(8);
  });
});

describe("computeDiscount — caps and scope", () => {
  it("respects maxDiscountUsd", () => {
    // 50% of 100 = 50, capped at 20
    const d = computeDiscount(coupon({ value: 50, maxDiscountUsd: 20 }), [
      g("s1", 100),
    ]);
    expect(d.total).toBe(20);
  });

  it("a seller-scoped coupon only touches its own store", () => {
    const d = computeDiscount(
      coupon({ scope: "SELLER", storeId: "s1", value: 10 }),
      [g("s1", 100), g("s2", 100)],
    );
    expect(d.perStore.s1).toBe(10);
    expect(d.perStore.s2).toBeUndefined();
    expect(d.total).toBe(10);
  });

  it("is a no-op when the seller coupon's store isn't in the cart", () => {
    const d = computeDiscount(
      coupon({ scope: "SELLER", storeId: "sX", value: 10 }),
      [g("s1", 100)],
    );
    expect(d.total).toBe(0);
  });
});
