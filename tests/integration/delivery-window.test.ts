// placeOrder captures the buyer's scheduled Express delivery window (day + slot)
// and validates it. Local Postgres.
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
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

// A YYYY-MM-DD string `days` from today, in UTC.
function daysAhead(days: number): string {
  const now = new Date();
  const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

async function enableExpress() {
  for (const [key, value] of [
    ["cod_enabled", true],
    ["express_enabled", true],
    ["delivery_window_days", 7],
  ] as const) {
    await prisma.platformSetting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
  }
}

describe("placeOrder — scheduled delivery window", () => {
  it("stores the requested day + slot on an Express order", async () => {
    const fx = await makeFixture({ stock: 5 });
    try {
      await enableExpress();
      as(fx.buyerId);
      const day = daysAhead(3);
      const res = await placeOrder({
        addressId: fx.addressId,
        items: [{ variantId: fx.variantId, quantity: 1 }],
        paymentMethod: "COD",
        shippingMethods: { [fx.storeId]: "EXPRESS" },
        deliveryDate: day,
        deliverySlot: "AFTERNOON",
      });
      expect(res.orderId).toBeTruthy();
      const order = await prisma.order.findUnique({
        where: { id: res.orderId! },
        select: { deliveryDate: true, deliverySlot: true },
      });
      expect(order?.deliverySlot).toBe("AFTERNOON");
      expect(order?.deliveryDate?.toISOString()).toBe(`${day}T00:00:00.000Z`);
    } finally {
      await fx.cleanup();
    }
  });

  it("rejects a window when no group ships Express", async () => {
    const fx = await makeFixture({ stock: 5 });
    try {
      await enableExpress();
      as(fx.buyerId);
      const res = await placeOrder({
        addressId: fx.addressId,
        items: [{ variantId: fx.variantId, quantity: 1 }],
        paymentMethod: "COD",
        // STANDARD (default) — no express group.
        deliveryDate: daysAhead(2),
        deliverySlot: "MORNING",
      });
      expect(res.error).toBe("deliveryWindowNotExpress");
      expect(res.orderId).toBeUndefined();
    } finally {
      await fx.cleanup();
    }
  });

  it("rejects an out-of-range day on an Express order", async () => {
    const fx = await makeFixture({ stock: 5 });
    try {
      await enableExpress();
      as(fx.buyerId);
      const res = await placeOrder({
        addressId: fx.addressId,
        items: [{ variantId: fx.variantId, quantity: 1 }],
        paymentMethod: "COD",
        shippingMethods: { [fx.storeId]: "EXPRESS" },
        deliveryDate: daysAhead(30), // beyond the 7-day horizon
        deliverySlot: "MORNING",
      });
      expect(res.error).toBe("badDeliveryWindow");
    } finally {
      await fx.cleanup();
    }
  });

  it("places a normal Express order when no window is requested", async () => {
    const fx = await makeFixture({ stock: 5 });
    try {
      await enableExpress();
      as(fx.buyerId);
      const res = await placeOrder({
        addressId: fx.addressId,
        items: [{ variantId: fx.variantId, quantity: 1 }],
        paymentMethod: "COD",
        shippingMethods: { [fx.storeId]: "EXPRESS" },
      });
      expect(res.orderId).toBeTruthy();
      const order = await prisma.order.findUnique({
        where: { id: res.orderId! },
        select: { deliveryDate: true, deliverySlot: true },
      });
      expect(order?.deliveryDate).toBeNull();
      expect(order?.deliverySlot).toBeNull();
    } finally {
      await fx.cleanup();
    }
  });
});
