// Buyer rates the courier who delivered their Express parcel. Against Postgres.
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

import { rateDelivery } from "@/lib/actions/delivery-rating";
import { courierRating } from "@/lib/courier-ratings";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let courierId: string;
const extraUserIds: string[] = [];

beforeAll(async () => {
  fx = await makeFixture();
  const courier = await prisma.user.create({
    data: {
      email: `crr-${Date.now().toString(36)}@t.local`,
      roles: ["COURIER"],
      locale: "en",
    },
  });
  courierId = courier.id;
  extraUserIds.push(courier.id);
});

afterAll(async () => {
  await prisma.user
    .deleteMany({ where: { id: { in: extraUserIds } } })
    .catch(() => {});
  await fx.cleanup();
});

// A delivered Express parcel handled by our courier.
async function deliveredParcel(method = "EXPRESS", status = "DELIVERED") {
  const { subOrderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: status as never,
  });
  await prisma.subOrder.update({
    where: { id: subOrderId },
    data: { shippingMethod: method as never },
  });
  const shipment = await prisma.shipment.create({
    data: {
      subOrderId,
      status: "DELIVERED",
      platformManaged: true,
      driverId: courierId,
      shippedAt: new Date(),
      deliveredAt: new Date(),
    },
    select: { id: true },
  });
  return shipment.id;
}

describe("rateDelivery", () => {
  it("lets the buyer rate, then update, and aggregates per courier", async () => {
    const shipmentId = await deliveredParcel();

    as(fx.buyerId);
    expect(await rateDelivery(shipmentId, 5, "Fast!")).toEqual({ ok: true });
    let row = await prisma.deliveryRating.findUniqueOrThrow({
      where: { shipmentId },
    });
    expect(row).toMatchObject({ stars: 5, comment: "Fast!", courierId });

    // Upsert — same buyer changes their mind.
    expect(await rateDelivery(shipmentId, 3)).toEqual({ ok: true });
    row = await prisma.deliveryRating.findUniqueOrThrow({
      where: { shipmentId },
    });
    expect(row.stars).toBe(3);
    expect(await prisma.deliveryRating.count({ where: { shipmentId } })).toBe(
      1,
    );

    const agg = await courierRating(courierId);
    expect(agg).toEqual({ avg: 3, count: 1 });
  });

  it("rejects out-of-range stars and non-buyers", async () => {
    const shipmentId = await deliveredParcel();
    as(fx.buyerId);
    expect(await rateDelivery(shipmentId, 0)).toEqual({ error: "badStars" });
    expect(await rateDelivery(shipmentId, 6)).toEqual({ error: "badStars" });

    as(courierId); // not the buyer
    expect(await rateDelivery(shipmentId, 4)).toEqual({ error: "forbidden" });
  });

  it("only allows delivered Express parcels", async () => {
    // Standard shipping is not eligible.
    const std = await deliveredParcel("STANDARD");
    as(fx.buyerId);
    expect(await rateDelivery(std, 5)).toEqual({ error: "notEligible" });

    // Express but not yet delivered.
    const pending = await deliveredParcel("EXPRESS", "SHIPPED");
    await prisma.shipment.update({
      where: { id: pending },
      data: { status: "OUT_FOR_DELIVERY" },
    });
    expect(await rateDelivery(pending, 5)).toEqual({ error: "notEligible" });
  });
});
