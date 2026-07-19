// Verifies "nearest" auto-assignment ranks by true distance when the parcel's
// address has pinned coordinates and couriers have shared theirs.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { autoAssignShipment } from "@/lib/courier-assign";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

let fx: Awaited<ReturnType<typeof makeFixture>>;
let savedStrategy: unknown;
const userIds: string[] = [];
let closeId: string;

// Destination (buyer address) — central Aden.
const DEST = { lat: 12.79, lng: 45.03 };

beforeAll(async () => {
  fx = await makeFixture();
  await prisma.address.update({
    where: { id: fx.addressId },
    data: { lat: DEST.lat, lng: DEST.lng },
  });

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

  const uniq = Date.now().toString(36);
  const near = await prisma.user.create({
    data: { email: `near-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  const far = await prisma.user.create({
    data: { email: `far-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  closeId = near.id;
  userIds.push(near.id, far.id);
  // Near driver ~1 km from the destination; far driver ~300 km away (Sana'a).
  await prisma.courierLocation.create({
    data: { userId: near.id, lat: 12.8, lng: 45.04, governorate: "Aden" },
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

describe("distance-based nearest assignment", () => {
  it("assigns the courier closest to the pinned destination", async () => {
    const p = await shippedParcel();
    const chosen = await autoAssignShipment(p);
    expect(chosen).toBe(closeId);
  });
});
