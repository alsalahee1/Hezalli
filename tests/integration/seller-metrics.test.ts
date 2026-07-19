// Step 17.7 — seller sales analytics aggregates over real Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { sellerAnalytics } from "@/lib/seller-metrics";
import { makeFixture } from "./factory";

let fx: Awaited<ReturnType<typeof makeFixture>>;

beforeAll(async () => {
  fx = await makeFixture({ price: 50 });
  // Two completed orders (qty 2 + qty 1) and one cancelled order that must be
  // excluded from every metric.
  await fx.createSubOrder({
    paymentMethod: "COD",
    qty: 2,
    status: "COMPLETED",
  });
  await fx.createSubOrder({
    paymentMethod: "COD",
    qty: 1,
    status: "COMPLETED",
  });
  await fx.createSubOrder({
    paymentMethod: "COD",
    qty: 5,
    status: "CANCELLED",
  });
  // Give the product a known lifetime view count for the conversion metric.
  await prisma.product.update({
    where: { id: fx.productId },
    data: { views: 20 },
  });
});

afterAll(async () => {
  await fx.cleanup();
});

describe("sellerAnalytics", () => {
  it("aggregates revenue, orders and units over the window (excludes cancelled)", async () => {
    const a = await sellerAnalytics(fx.storeId, 30);
    expect(a.revenue).toBe(150); // 50*2 + 50*1
    expect(a.orders).toBe(2); // cancelled excluded
    expect(a.units).toBe(3); // 2 + 1
    expect(a.aov).toBe(75); // 150 / 2
    expect(a.days).toBe(30);
    expect(a.salesByDay).toHaveLength(30);
    const seriesTotal = a.salesByDay.reduce((s, d) => s + d.total, 0);
    expect(seriesTotal).toBeCloseTo(150, 2);
  });

  it("ranks the product in topProducts with views and conversion", async () => {
    const a = await sellerAnalytics(fx.storeId, 30);
    const top = a.topProducts.find((p) => p.id === fx.productId);
    expect(top).toBeDefined();
    expect(top!.units).toBe(3);
    expect(top!.revenue).toBe(150);
    expect(top!.orders).toBe(2);
    expect(top!.views).toBe(20);
    expect(top!.conversion).toBe(10); // 2 orders / 20 views = 10%
  });

  it("reports null conversion when a product has no views", async () => {
    await prisma.product.update({
      where: { id: fx.productId },
      data: { views: 0 },
    });
    const a = await sellerAnalytics(fx.storeId, 30);
    const top = a.topProducts.find((p) => p.id === fx.productId);
    expect(top!.conversion).toBeNull();
  });
});
