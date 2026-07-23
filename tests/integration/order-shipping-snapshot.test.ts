// placeOrder freezes each line's product weight/dimensions at checkout (like
// titleSnapshot), and courier capacity math prefers that snapshot over the
// live catalog — so a seller editing a product mid-delivery can't change what
// an in-flight parcel "weighs". Local Postgres.
import { describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("next/cache", async (orig) => ({
  ...(await orig<typeof import("next/cache")>()),
  revalidatePath: vi.fn(),
}));
vi.mock("next-intl/server", async (orig) => ({
  ...(await orig<typeof import("next-intl/server")>()),
  getLocale: vi.fn().mockResolvedValue("en"),
}));

import { placeOrder } from "@/lib/actions/order";
import { PACKING_FACTOR, subOrderMetrics } from "@/lib/courier-capacity";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

async function enableCod() {
  await prisma.platformSetting.upsert({
    where: { key: "cod_enabled" },
    create: { key: "cod_enabled", value: true as never },
    update: { value: true as never },
  });
}

describe("order shipping snapshot", () => {
  it("freezes weight + size at checkout and keeps metrics stable through catalog edits", async () => {
    const fx = await makeFixture({ stock: 5 });
    try {
      await enableCod();
      await prisma.product.update({
        where: { id: fx.productId },
        data: { weightGrams: 12_345, dimensions: { l: 40, w: 30, h: 20 } },
      });

      as(fx.buyerId);
      const res = await placeOrder({
        addressId: fx.addressId,
        items: [{ variantId: fx.variantId, quantity: 2 }],
        paymentMethod: "COD",
      });
      expect(res.orderId).toBeTruthy();

      const sub = await prisma.subOrder.findFirstOrThrow({
        where: { orderId: res.orderId! },
        select: { id: true, items: true },
      });
      expect(sub.items[0].weightGramsSnapshot).toBe(12_345);
      expect(sub.items[0].dimensionsSnapshot).toEqual({ l: 40, w: 30, h: 20 });

      // The seller now "fixes" the listing to something much heavier/bigger…
      await prisma.product.update({
        where: { id: fx.productId },
        data: { weightGrams: 90_000, dimensions: { l: 300, w: 100, h: 100 } },
      });

      // …but the in-flight parcel still weighs what it weighed at checkout.
      const m = (await subOrderMetrics([sub.id])).get(sub.id)!;
      expect(m.weightGrams).toBe(2 * 12_345);
      expect(m.volumeCm3).toBe(Math.round(2 * 40 * 30 * 20 * PACKING_FACTOR));
      expect(m.longestSideCm).toBe(40);
    } finally {
      await fx.cleanup();
    }
  });

  it("falls back to the live catalog when the product had no data at checkout", async () => {
    const fx = await makeFixture({ stock: 5 });
    try {
      await enableCod();
      // Fixture product ships with weightGrams null and no dimensions.
      as(fx.buyerId);
      const res = await placeOrder({
        addressId: fx.addressId,
        items: [{ variantId: fx.variantId, quantity: 1 }],
        paymentMethod: "COD",
      });
      expect(res.orderId).toBeTruthy();

      const sub = await prisma.subOrder.findFirstOrThrow({
        where: { orderId: res.orderId! },
        select: { id: true, items: true },
      });
      expect(sub.items[0].weightGramsSnapshot).toBeNull();
      expect(sub.items[0].dimensionsSnapshot).toBeNull();

      // The seller labels the product later — the null snapshot means the
      // better data applies to the in-flight parcel too.
      await prisma.product.update({
        where: { id: fx.productId },
        data: { weightGrams: 7_000 },
      });
      const m = (await subOrderMetrics([sub.id])).get(sub.id)!;
      expect(m.weightGrams).toBe(7_000);
    } finally {
      await fx.cleanup();
    }
  });
});
