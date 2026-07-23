// Exercises courier auto-assignment (least-loaded balancing + same-destination
// batching) against Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  autoAssignShipment,
  pickLeastLoadedCourierId,
} from "@/lib/courier-assign";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

let fx: Awaited<ReturnType<typeof makeFixture>>;
let courierA: string;
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
  // A governorate only this suite delivers to, so the batching preference
  // (courier already headed there wins) is deterministic against whatever
  // else is in the shared database.
  await prisma.address.update({
    where: { id: fx.addressId },
    data: { governorate: `AssignGov-${uniq}` },
  });
  const a = await prisma.user.create({
    data: { email: `ca-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  // A second idle courier must exist so "least loaded" has a clear winner.
  const b = await prisma.user.create({
    data: { email: `cb-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  courierA = a.id;
  extraUserIds.push(a.id, b.id);
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
  return s.id;
}

// Active (SHIPPED) load for each courier, computed independently of the code
// under test — so assertions hold regardless of other couriers in the DB.
async function loadOf(id: string): Promise<number> {
  return prisma.shipment.count({
    where: { driverId: id, subOrder: { status: "SHIPPED" } },
  });
}
async function minCourierLoad(): Promise<number> {
  const couriers = await prisma.user.findMany({
    where: { roles: { has: "COURIER" }, isSuspended: false, deletedAt: null },
    select: { id: true },
  });
  const loads = await Promise.all(couriers.map((c) => loadOf(c.id)));
  return Math.min(...loads);
}

describe("courier auto-assignment", () => {
  it("batches onto the courier already delivering to the same destination", async () => {
    // A carries an active parcel to this suite's governorate; the next parcel
    // heads the same way, so it rides with A even though idle couriers exist.
    // (With different destinations, least-loaded balancing applies instead —
    // covered by the pickFrom unit tests.)
    await shippedParcel(courierA);
    const p = await shippedParcel();

    const chosen = await autoAssignShipment(p);
    expect(chosen).toBe(courierA);

    const after = await prisma.shipment.findUnique({
      where: { id: p },
      select: { driverId: true },
    });
    expect(after?.driverId).toBe(chosen);
  });

  it("picks a courier whose load equals the global minimum", async () => {
    const chosen = await pickLeastLoadedCourierId();
    expect(chosen).toBeTruthy();
    expect(await loadOf(chosen!)).toBe(await minCourierLoad());
  });

  it("won't reassign an already-assigned parcel", async () => {
    const p = await shippedParcel(courierA);
    expect(await autoAssignShipment(p)).toBeNull();
    const after = await prisma.shipment.findUnique({
      where: { id: p },
      select: { driverId: true },
    });
    expect(after?.driverId).toBe(courierA); // unchanged
  });
});
