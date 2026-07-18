import { describe, expect, it } from "vitest";

import { settleSubOrder } from "@/lib/finance";
import { REFERRAL_BONUS_POINTS } from "@/lib/loyalty";
import { prisma } from "@/lib/prisma";
import { applyRefund } from "@/lib/refunds";
import { makeFixture } from "./factory";

const points = (userId: string) =>
  prisma.user
    .findUniqueOrThrow({
      where: { id: userId },
      select: { loyaltyPoints: true },
    })
    .then((u) => u.loyaltyPoints);

describe("loyalty — earning", () => {
  it("awards floor(itemsTotal) points on completion, once", async () => {
    const fx = await makeFixture({ price: 100 });
    try {
      const { subOrderId } = await fx.createSubOrder({ paymentMethod: "COD" });
      await settleSubOrder(subOrderId);
      expect(await points(fx.buyerId)).toBe(100);

      const earns = await prisma.loyaltyTransaction.count({
        where: { userId: fx.buyerId, type: "EARN" },
      });
      expect(earns).toBe(1);

      // idempotent — settling again does not double-award
      await settleSubOrder(subOrderId);
      expect(await points(fx.buyerId)).toBe(100);
    } finally {
      await fx.cleanup();
    }
  });
});

describe("loyalty — referral", () => {
  it("pays the referrer once, on the referee's first completed order", async () => {
    const fx = await makeFixture({ price: 50 });
    const referrer = await prisma.user.create({
      data: {
        email: `ref-${Date.now()}@t.local`,
        name: "Referrer",
        roles: ["BUYER"],
      },
    });
    try {
      await prisma.user.update({
        where: { id: fx.buyerId },
        data: { referredById: referrer.id },
      });

      const a = await fx.createSubOrder({ paymentMethod: "COD" });
      await settleSubOrder(a.subOrderId);
      expect(await points(referrer.id)).toBe(REFERRAL_BONUS_POINTS);

      // a second completed order must NOT pay the referral bonus again
      const b = await fx.createSubOrder({ paymentMethod: "COD" });
      await settleSubOrder(b.subOrderId);
      expect(await points(referrer.id)).toBe(REFERRAL_BONUS_POINTS);
    } finally {
      await fx.cleanup();
      await prisma.user.delete({ where: { id: referrer.id } }).catch(() => {});
    }
  });
});

describe("loyalty — refund restores redeemed points", () => {
  it("returns the proportional points when a points-discounted order is refunded", async () => {
    const fx = await makeFixture({ price: 100 });
    try {
      // $5 points discount (no coupon → treated as a points redemption)
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "BANK_TRANSFER",
        discount: 5,
      });
      await settleSubOrder(subOrderId); // buyer earns 100
      const before = await points(fx.buyerId);

      const res = await applyRefund(subOrderId, {
        reason: "test",
        actor: "admin",
      });
      expect(res.ok).toBe(true);

      // full refund → 5 * 100 = 500 points restored
      const restored = await prisma.loyaltyTransaction.findFirst({
        where: { userId: fx.buyerId, type: "REFUND" },
      });
      expect(restored?.points).toBe(500);
      expect(await points(fx.buyerId)).toBe(before + 500);
    } finally {
      await fx.cleanup();
    }
  });
});
