// Freight rules at checkout (xlarge/oversized size classes): point pickup is
// refused, a delivery window is required while scheduling is on, the class is
// snapshotted onto the order line, and category default classes count too.
// Local Postgres.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
import { subOrderMetrics } from "@/lib/courier-capacity";
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

let fx: Awaited<ReturnType<typeof makeFixture>>;
let pointOwnerId: string;
let pointId: string;
const settingKeys = ["cod_enabled", "delivery_window_days"];

beforeAll(async () => {
  fx = await makeFixture({ stock: 20 });
  // An ACTIVE point so the PICKUP tier is actually quoted at checkout.
  const owner = await prisma.user.create({
    data: {
      email: `frt-po-${Date.now().toString(36)}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: "Freight Test Point",
      phone: "770000002",
      governorate: "Aden",
      city: "Aden",
      addressLine: "Street 3",
    },
  });
  pointOwnerId = owner.id;
  pointId = point.id;
  for (const [key, value] of [
    ["cod_enabled", true],
    ["delivery_window_days", 7],
  ] as const) {
    await prisma.platformSetting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
  }
  // The fixture product is a fridge-class item.
  await prisma.product.update({
    where: { id: fx.productId },
    data: { sizeClass: "xlarge" },
  });
});

afterAll(async () => {
  await prisma.platformSetting
    .deleteMany({ where: { key: { in: settingKeys } } })
    .catch(() => {});
  await prisma.deliveryPoint.delete({ where: { id: pointId } }).catch(() => {});
  await prisma.user.delete({ where: { id: pointOwnerId } }).catch(() => {});
  await fx.cleanup();
});

describe("freight rules at checkout", () => {
  it("requires a delivery window for a freight order", async () => {
    as(fx.buyerId);
    const res = await placeOrder({
      addressId: fx.addressId,
      items: [{ variantId: fx.variantId, quantity: 1 }],
      paymentMethod: "COD",
    });
    expect(res.error).toBe("deliveryWindowRequiredFreight");
  });

  it("accepts the order with a window and snapshots the class", async () => {
    as(fx.buyerId);
    const res = await placeOrder({
      addressId: fx.addressId,
      items: [{ variantId: fx.variantId, quantity: 1 }],
      paymentMethod: "COD",
      deliveryDate: daysAhead(3),
      deliverySlot: "MORNING",
    });
    expect(res.orderId).toBeTruthy();

    const sub = await prisma.subOrder.findFirstOrThrow({
      where: { orderId: res.orderId! },
      select: { id: true, items: true },
    });
    expect(sub.items[0].sizeClassSnapshot).toBe("xlarge");

    // The parcel is freight to the capacity engine — and stays freight even
    // if the seller reclassifies the product afterwards.
    await prisma.product.update({
      where: { id: fx.productId },
      data: { sizeClass: "small" },
    });
    const m = (await subOrderMetrics([sub.id])).get(sub.id)!;
    expect(m.freight).toBe(true);
    await prisma.product.update({
      where: { id: fx.productId },
      data: { sizeClass: "xlarge" },
    });
  });

  it("refuses point pickup for a freight group", async () => {
    as(fx.buyerId);
    const res = await placeOrder({
      addressId: fx.addressId,
      items: [{ variantId: fx.variantId, quantity: 1 }],
      paymentMethod: "COD",
      shippingMethods: { [fx.storeId]: "PICKUP" },
      pickupPointId: pointId,
      deliveryDate: daysAhead(3),
      deliverySlot: "MORNING",
    });
    expect(res.error).toBe("pickupNotForFreight");
  });

  it("treats a category default class as freight too", async () => {
    // Product has no class of its own; its category says "oversized".
    await prisma.product.update({
      where: { id: fx.productId },
      data: { sizeClass: null },
    });
    await prisma.category.update({
      where: { id: fx.categoryId },
      data: { defaultSizeClass: "oversized" },
    });

    as(fx.buyerId);
    const res = await placeOrder({
      addressId: fx.addressId,
      items: [{ variantId: fx.variantId, quantity: 1 }],
      paymentMethod: "COD",
    });
    expect(res.error).toBe("deliveryWindowRequiredFreight");

    await prisma.category.update({
      where: { id: fx.categoryId },
      data: { defaultSizeClass: null },
    });
  });
});
