// Driver collection manifest (docs/DELIVERY-POINTS.md §26): the pickup list
// for a driver at a hub, and the one-tap batch handover.
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

import {
  pointDriverManifest,
  pointHandoverManifest,
  pointReceiveParcel,
} from "@/lib/actions/point";
import { shipSubOrder } from "@/lib/actions/shipment";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let ownerId: string;
let pointId: string;
let carrierId: string;
let driverId: string;
let otherDriverId: string;
let trackingSeq = 0;

beforeAll(async () => {
  fx = await makeFixture();
  const uniq = Date.now().toString(36);
  const owner = await prisma.user.create({
    data: {
      email: `mf-own-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const driver = await prisma.user.create({
    data: { email: `mf-drv-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  const other = await prisma.user.create({
    data: { email: `mf-oth-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: `Manifest Point ${uniq}`,
      phone: "770000017",
      governorate: "Aden",
      city: "Aden",
      addressLine: "Manifest st",
    },
  });
  const carrier = await prisma.carrier.create({
    data: { name: `Hezalli Express M-${uniq}`, platformManaged: true },
  });
  ownerId = owner.id;
  pointId = point.id;
  carrierId = carrier.id;
  driverId = driver.id;
  otherDriverId = other.id;
});

afterAll(async () => {
  await prisma.notification
    .deleteMany({ where: { userId: { in: [ownerId, driverId] } } })
    .catch(() => {});
  await fx.cleanup();
  await prisma.user
    .deleteMany({ where: { id: { in: [ownerId, driverId, otherDriverId] } } })
    .catch(() => {});
  await prisma.carrier.delete({ where: { id: carrierId } }).catch(() => {});
});

// A parcel held at the hub, assigned to `assignTo` (or a PICKUP parcel).
async function heldParcel(opts: { pickup?: boolean; assignTo?: string }) {
  const { subOrderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "PROCESSING",
  });
  if (opts.pickup) {
    await prisma.subOrder.update({
      where: { id: subOrderId },
      data: { shippingMethod: "PICKUP", pickupPointId: pointId },
    });
  }
  const trackingNumber =
    `MF${Date.now().toString(36)}${(trackingSeq++).toString(36)}`.toUpperCase();
  as(fx.sellerUserId);
  expect(
    await shipSubOrder(subOrderId, {
      carrierId,
      trackingNumber,
      ...(opts.pickup ? {} : { deliveryPointId: pointId }),
    }),
  ).toEqual({ ok: true });
  as(ownerId);
  expect(await pointReceiveParcel(trackingNumber)).toMatchObject({ ok: true });
  // Pin the assignment deterministically (auto-assign may pick any driver).
  if (opts.assignTo) {
    await prisma.shipment.updateMany({
      where: { subOrderId },
      data: { driverId: opts.assignTo },
    });
  }
  const ship = await prisma.shipment.findUniqueOrThrow({
    where: { subOrderId },
    select: { id: true },
  });
  return { shipmentId: ship.id, trackingNumber };
}

describe("driver manifest", () => {
  it("lists only this hub's parcels assigned to the driver, then hands all", async () => {
    const a = await heldParcel({ assignTo: driverId });
    const b = await heldParcel({ assignTo: driverId });
    const otherParcel = await heldParcel({ assignTo: otherDriverId });
    const pickupParcel = await heldParcel({ pickup: true });

    as(ownerId);
    const res = await pointDriverManifest(driverId);
    expect(res.ok).toBe(true);
    const trackings = res.rows!.map((r) => r.trackingNumber);
    expect(trackings).toContain(a.trackingNumber);
    expect(trackings).toContain(b.trackingNumber);
    expect(trackings).not.toContain(otherParcel.trackingNumber);
    expect(trackings).not.toContain(pickupParcel.trackingNumber);
    expect(res.rows!.every((r) => r.isCod)).toBe(true);

    // One tap hands the whole list; parcels leave the hub's custody.
    const batch = await pointHandoverManifest(driverId);
    expect(batch.ok).toBe(true);
    expect(batch.handed).toBe(2);
    expect(batch.failed).toBe(0);
    const after = await prisma.shipment.findMany({
      where: { id: { in: [a.shipmentId, b.shipmentId] } },
      select: { status: true, driverId: true, atPointId: true },
    });
    for (const s of after) {
      expect(s.status).toBe("OUT_FOR_DELIVERY");
      expect(s.driverId).toBe(driverId);
      expect(s.atPointId).toBeNull();
    }

    // The manifest is now empty; a second batch is a clean no-op.
    expect((await pointDriverManifest(driverId)).rows).toHaveLength(0);
    const again = await pointHandoverManifest(driverId);
    expect(again).toMatchObject({ ok: true, handed: 0, failed: 0 });

    // The other driver's parcel was untouched.
    const untouched = await prisma.shipment.findUniqueOrThrow({
      where: { id: otherParcel.shipmentId },
      select: { status: true, atPointId: true },
    });
    expect(untouched.status).toBe("AT_POINT");
    expect(untouched.atPointId).toBe(pointId);
  });

  it("non-operators are refused", async () => {
    as(fx.buyerId);
    expect((await pointDriverManifest(driverId)).error).toBe("forbidden");
    expect((await pointHandoverManifest(driverId)).error).toBe("forbidden");
  });
});
