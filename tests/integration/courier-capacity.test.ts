// Capacity-aware auto-assignment against Postgres: heavy parcels skip small
// vehicles, and parcels heading the same way batch onto the courier already
// making the trip. Assertions are written to hold regardless of unrelated
// couriers left in the shared test database (unique governorate + negative
// checks), mirroring courier-assign.test.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { autoAssignShipment } from "@/lib/courier-assign";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

let fx: Awaited<ReturnType<typeof makeFixture>>;
let bikeCourier: string;
let carCourier: string;
let gov: string; // unique destination governorate → batching is deterministic
const extraUserIds: string[] = [];

beforeAll(async () => {
  fx = await makeFixture();
  const uniq = Date.now().toString(36);
  gov = `CapGov-${uniq}`;
  // All parcels in this suite deliver into a governorate only this suite uses.
  await prisma.address.update({
    where: { id: fx.addressId },
    data: { governorate: gov },
  });

  const bike = await prisma.user.create({
    data: {
      email: `bike-${uniq}@t.local`,
      roles: ["COURIER"],
      locale: "en",
      courierVehicleType: "motorbike",
    },
  });
  const car = await prisma.user.create({
    data: {
      email: `car-${uniq}@t.local`,
      roles: ["COURIER"],
      locale: "en",
      courierVehicleType: "car",
    },
  });
  bikeCourier = bike.id;
  carCourier = car.id;
  extraUserIds.push(bike.id, car.id);
});

afterAll(async () => {
  await prisma.notification
    .deleteMany({ where: { userId: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: extraUserIds } } })
    .catch(() => {});
  await fx.cleanup();
});

// A platform parcel ready for assignment; weight comes from the fixture
// product's weightGrams at assignment time.
async function shippedParcel(driverId?: string) {
  const { subOrderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "SHIPPED",
  });
  const s = await prisma.shipment.create({
    data: {
      subOrderId,
      status: "IN_TRANSIT",
      platformManaged: true,
      shippedAt: new Date(),
      driverId: driverId ?? null,
    },
    select: { id: true },
  });
  return { shipmentId: s.id, subOrderId };
}

async function setProductWeight(weightGrams: number) {
  await prisma.product.update({
    where: { id: fx.productId },
    data: { weightGrams },
  });
}

// Take a parcel out of the active-load window so it can't skew later cases.
async function retire(subOrderId: string) {
  await prisma.subOrder.update({
    where: { id: subOrderId },
    data: { status: "COMPLETED" },
  });
}

describe("capacity-aware courier assignment", () => {
  it("never hands a parcel heavier than the vehicle to a motorbike", async () => {
    await setProductWeight(40_000); // 40 kg — over the 30 kg motorbike limit
    const p = await shippedParcel();

    const chosen = await autoAssignShipment(p.shipmentId);
    expect(chosen).toBeTruthy();
    expect(chosen).not.toBe(bikeCourier);

    const after = await prisma.shipment.findUnique({
      where: { id: p.shipmentId },
      select: { driverId: true },
    });
    expect(after?.driverId).toBe(chosen);
    await retire(p.subOrderId);
  });

  it("batches a parcel onto the courier already delivering to that governorate", async () => {
    await setProductWeight(500);
    // The car courier is mid-trip to our unique governorate…
    const seed = await shippedParcel(carCourier);
    // …so the next parcel there rides along, even though other couriers
    // carry fewer jobs.
    const p = await shippedParcel();
    const chosen = await autoAssignShipment(p.shipmentId);
    expect(chosen).toBe(carCourier);

    await retire(seed.subOrderId);
    await retire(p.subOrderId);
  });

  it("stops batching when the trip courier has no capacity left", async () => {
    // The bike courier is mid-trip to our governorate but nearly full:
    // 29 kg of 30. A 5 kg parcel can't ride along. The seed parcel gets its
    // own heavy product — parcel weight is read live from the catalog, so
    // mutating the shared fixture product would rewrite the seed's weight too.
    const heavy = await prisma.product.create({
      data: {
        storeId: fx.storeId,
        categoryId: fx.categoryId,
        title: { en: "Heavy", ar: "ثقيل" },
        slug: `heavy-${Date.now().toString(36)}`,
        basePrice: 10,
        status: "ACTIVE",
        weightGrams: 29_000,
        variants: { create: { sku: `heavy-${Date.now().toString(36)}`, name: "H", price: 10, stock: 5 } },
      },
      include: { variants: true },
    });
    const seed = await shippedParcel(bikeCourier);
    await prisma.orderItem.updateMany({
      where: { subOrderId: seed.subOrderId },
      data: { variantId: heavy.variants[0].id },
    });

    await setProductWeight(5_000);
    const p = await shippedParcel();
    const chosen = await autoAssignShipment(p.shipmentId);
    expect(chosen).toBeTruthy();
    expect(chosen).not.toBe(bikeCourier);

    await retire(seed.subOrderId);
    await retire(p.subOrderId);
  });
});
