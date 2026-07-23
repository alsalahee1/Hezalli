// Verifies "nearest" auto-assignment prefers a courier located in the parcel's
// destination governorate. Runs against Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { autoAssignShipment } from "@/lib/courier-assign";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

let fx: Awaited<ReturnType<typeof makeFixture>>;
let savedStrategy: unknown;
const userIds: string[] = [];
let nearId: string;

beforeAll(async () => {
  fx = await makeFixture(); // buyer address governorate is "Aden"
  const prev = await prisma.platformSetting.findUnique({
    where: { key: "courier_assign_strategy" },
    select: { value: true },
  });
  savedStrategy = prev?.value;
  await prisma.platformSetting.upsert({
    where: { key: "courier_assign_strategy" },
    create: { key: "courier_assign_strategy", value: "nearest" },
    update: { value: "nearest" },
  });
  // Pin dispatch to 24/7 so assignment runs at any wall-clock time.
  for (const key of ["dispatch_hours_start", "dispatch_hours_end"]) {
    await prisma.platformSetting.upsert({
      where: { key },
      create: { key, value: 0 },
      update: { value: 0 },
    });
  }

  const uniq = Date.now().toString(36);
  const near = await prisma.user.create({
    data: { email: `near-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  const far = await prisma.user.create({
    data: { email: `far-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  nearId = near.id;
  userIds.push(near.id, far.id);
  await prisma.courierLocation.create({
    data: { userId: near.id, lat: 12.79, lng: 45.03, governorate: "Aden" },
  });
  await prisma.courierLocation.create({
    data: { userId: far.id, lat: 15.35, lng: 44.21, governorate: "Sana'a" },
  });
});

afterAll(async () => {
  if (savedStrategy === undefined) {
    await prisma.platformSetting
      .delete({ where: { key: "courier_assign_strategy" } })
      .catch(() => {});
  } else {
    await prisma.platformSetting.update({
      where: { key: "courier_assign_strategy" },
      data: { value: savedStrategy as never },
    });
  }
  await prisma.platformSetting
    .deleteMany({
      where: { key: { in: ["dispatch_hours_start", "dispatch_hours_end"] } },
    })
    .catch(() => {});
  await prisma.courierLocation
    .deleteMany({ where: { userId: { in: userIds } } })
    .catch(() => {});
  await prisma.notification
    .deleteMany({ where: { userId: { in: userIds } } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: userIds } } })
    .catch(() => {});
  await fx.cleanup();
});

async function shippedParcel() {
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
    },
    select: { id: true },
  });
  return s.id;
}

describe("nearest auto-assignment", () => {
  it("assigns a courier located in the destination governorate", async () => {
    const p = await shippedParcel(); // destination: Aden
    const chosen = await autoAssignShipment(p);
    expect(chosen).toBeTruthy();
    const loc = await prisma.courierLocation.findUnique({
      where: { userId: chosen! },
      select: { governorate: true },
    });
    expect(loc?.governorate).toBe("Aden");
    expect(chosen).toBe(nearId);
  });
});
