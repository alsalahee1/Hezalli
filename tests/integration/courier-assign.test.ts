// Exercises courier auto-assignment (least-loaded balancing) against Postgres.
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
  const uniq = Date.now().toString(36);
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
  it("assigns a least-loaded courier, never a busier one", async () => {
    // A carries an active parcel; B carries none, so A must not be chosen.
    await shippedParcel(courierA);
    const p = await shippedParcel();

    const chosen = await autoAssignShipment(p);
    expect(chosen).toBeTruthy();
    expect(chosen).not.toBe(courierA);

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
