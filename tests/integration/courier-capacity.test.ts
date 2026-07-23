// Capacity-aware auto-assignment against Postgres: heavy parcels skip small
// vehicles, and parcels heading the same way batch onto the courier already
// making the trip. Assertions are written to hold regardless of unrelated
// couriers left in the shared test database (unique governorate + negative
// checks), mirroring courier-assign.test.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { autoAssignShipment } from "@/lib/courier-assign";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

let fx: Awaited<ReturnType<typeof makeFixture>>;
let bikeCourier: string;
let carCourier: string;
let vanCourier: string;
let gov: string; // unique destination governorate → batching is deterministic
const extraUserIds: string[] = [];

beforeAll(async () => {
  fx = await makeFixture();
  // Pin dispatch to 24/7 so assignment is exercised at any wall-clock time
  // (the default window would queue parcels outside 8–21 Aden time).
  for (const key of ["dispatch_hours_start", "dispatch_hours_end"]) {
    await prisma.platformSetting.upsert({
      where: { key },
      create: { key, value: 0 },
      update: { value: 0 },
    });
  }
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
  const van = await prisma.user.create({
    data: {
      email: `van-${uniq}@t.local`,
      roles: ["COURIER"],
      locale: "en",
      courierVehicleType: "van",
    },
  });
  bikeCourier = bike.id;
  carCourier = car.id;
  vanCourier = van.id;
  extraUserIds.push(bike.id, car.id, van.id);
});

afterAll(async () => {
  await prisma.platformSetting
    .deleteMany({
      where: { key: { in: ["dispatch_hours_start", "dispatch_hours_end"] } },
    })
    .catch(() => {});
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
        variants: {
          create: {
            sku: `heavy-${Date.now().toString(36)}`,
            name: "H",
            price: 10,
            stock: 5,
          },
        },
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

  it("routes an item too long for bike and car past both", async () => {
    // A 2 m curtain rod: 2 kg, low volume — but longer than a motorbike
    // (60 cm) or a car (180 cm) can take. Only the van (300 cm) fits.
    await prisma.product.update({
      where: { id: fx.productId },
      data: { weightGrams: 2_000, dimensions: { l: 200, w: 10, h: 10 } },
    });
    const p = await shippedParcel();
    const chosen = await autoAssignShipment(p.shipmentId);
    expect(chosen).toBeTruthy();
    expect([bikeCourier, carCourier]).not.toContain(chosen);
    // Among this suite's couriers, only the van qualifies.
    if ([bikeCourier, carCourier, vanCourier].includes(chosen!)) {
      expect(chosen).toBe(vanCourier);
    }

    await retire(p.subOrderId);
    await prisma.product.update({
      where: { id: fx.productId },
      data: { weightGrams: 500, dimensions: Prisma.DbNull },
    });
  });

  it("falls back to the category's delivery defaults when the product has none", async () => {
    // A category whose typical item weighs 40 kg (e.g. appliances); the
    // product itself carries no weight or size. The category default must
    // keep the parcel off the motorbike.
    const uniq2 = Date.now().toString(36);
    const heavyCat = await prisma.category.create({
      data: {
        name: { en: "Appliances", ar: "أجهزة" },
        slug: `heavycat-${uniq2}`,
        defaultWeightGrams: 40_000,
      },
    });
    const unlabeled = await prisma.product.create({
      data: {
        storeId: fx.storeId,
        categoryId: heavyCat.id,
        title: { en: "Fridge", ar: "ثلاجة" },
        slug: `fridge-${uniq2}`,
        basePrice: 100,
        status: "ACTIVE",
        weightGrams: null,
        variants: {
          create: { sku: `fridge-${uniq2}`, name: "F", price: 100, stock: 5 },
        },
      },
      include: { variants: true },
    });

    const p = await shippedParcel();
    await prisma.orderItem.updateMany({
      where: { subOrderId: p.subOrderId },
      data: { variantId: unlabeled.variants[0].id },
    });
    const chosen = await autoAssignShipment(p.shipmentId);
    expect(chosen).toBeTruthy();
    expect(chosen).not.toBe(bikeCourier);

    await retire(p.subOrderId);
    await prisma.product.delete({ where: { id: unlabeled.id } });
    await prisma.category.delete({ where: { id: heavyCat.id } });
  });
});
