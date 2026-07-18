import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

// Mirrors the atomic guard placeOrder uses:
//   updateMany({ where: { id, stock: { gte: qty } }, data: { decrement } })
// Concurrent claims must never oversell the last units.
describe("atomic stock decrement under concurrency", () => {
  it("only one of many concurrent claims wins the last unit", async () => {
    const fx = await makeFixture({ stock: 1 });
    try {
      const claim = () =>
        prisma.productVariant.updateMany({
          where: { id: fx.variantId, stock: { gte: 1 } },
          data: { stock: { decrement: 1 } },
        });
      const results = await Promise.all(
        Array.from({ length: 12 }, () => claim()),
      );
      const wins = results.filter((r) => r.count === 1).length;
      expect(wins).toBe(1);

      const v = await prisma.productVariant.findUnique({
        where: { id: fx.variantId },
      });
      expect(v!.stock).toBe(0);
    } finally {
      await fx.cleanup();
    }
  });

  it("never oversells when claims exceed available stock", async () => {
    const fx = await makeFixture({ stock: 5 });
    try {
      const claim = () =>
        prisma.productVariant.updateMany({
          where: { id: fx.variantId, stock: { gte: 2 } },
          data: { stock: { decrement: 2 } },
        });
      // five concurrent 2-unit claims against stock 5 → at most two can fit.
      const results = await Promise.all(
        Array.from({ length: 5 }, () => claim()),
      );
      const wins = results.filter((r) => r.count === 1).length;
      expect(wins).toBe(2);

      const v = await prisma.productVariant.findUnique({
        where: { id: fx.variantId },
      });
      expect(v!.stock).toBe(1); // 5 − 2×2
      expect(v!.stock).toBeGreaterThanOrEqual(0);
    } finally {
      await fx.cleanup();
    }
  });
});
