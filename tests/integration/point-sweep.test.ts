// Stale-parcel sweep (docs/DELIVERY-POINTS.md §20): buyer reminders, pickup
// window expiry, and stuck-parcel flags — each exactly once per parcel.
// Sweep counters are global (other suites share the database), so assertions
// check OUR parcels' notifications and guard timestamps, not exact totals.
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

import { pointReceiveParcel } from "@/lib/actions/point";
import { shipSubOrder } from "@/lib/actions/shipment";
import { sweepPointParcels } from "@/lib/point-sweep";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let ownerId: string;
let pointId: string;
let carrierId: string;
let trackingSeq = 0;

beforeAll(async () => {
  fx = await makeFixture();
  const uniq = Date.now().toString(36);
  const owner = await prisma.user.create({
    data: {
      email: `sw-own-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: `Sweep Point ${uniq}`,
      phone: "770000013",
      governorate: "Aden",
      city: "Aden",
      addressLine: "Sweep st",
    },
  });
  const carrier = await prisma.carrier.create({
    data: { name: `Hezalli Express W-${uniq}`, platformManaged: true },
  });
  ownerId = owner.id;
  pointId = point.id;
  carrierId = carrier.id;
});

afterAll(async () => {
  await prisma.notification
    .deleteMany({ where: { userId: ownerId } })
    .catch(() => {});
  await fx.cleanup();
  await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
  await prisma.carrier.delete({ where: { id: carrierId } }).catch(() => {});
});

// A parcel received at the point: PICKUP (buyer collects) or courier-routed.
async function heldParcel(shippingMethod: "PICKUP" | "STANDARD") {
  const { subOrderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "PROCESSING",
  });
  if (shippingMethod === "PICKUP") {
    await prisma.subOrder.update({
      where: { id: subOrderId },
      data: { shippingMethod: "PICKUP", pickupPointId: pointId },
    });
  }
  const trackingNumber =
    `SW${Date.now().toString(36)}${(trackingSeq++).toString(36)}`.toUpperCase();
  as(fx.sellerUserId);
  expect(
    await shipSubOrder(subOrderId, {
      carrierId,
      trackingNumber,
      ...(shippingMethod === "PICKUP" ? {} : { deliveryPointId: pointId }),
    }),
  ).toEqual({ ok: true });
  as(ownerId);
  expect(await pointReceiveParcel(trackingNumber)).toMatchObject({ ok: true });
  const ship = await prisma.shipment.findUniqueOrThrow({
    where: { subOrderId },
    select: { id: true },
  });
  return { shipmentId: ship.id, trackingNumber };
}

// Age a parcel without touching anything else (raw SQL skips @updatedAt).
async function backdate(shipmentId: string, days: number) {
  await prisma.$executeRaw`UPDATE "Shipment" SET "updatedAt" = NOW() - make_interval(days => ${days}) WHERE "id" = ${shipmentId}`;
}

const notifCount = (userId: string, title: string) =>
  prisma.notification.count({ where: { userId, title } });

describe("sweepPointParcels", () => {
  it("reminds, expires, and flags exactly once per parcel", async () => {
    // Fresh parcels — the sweep must leave them alone.
    const freshPickup = await heldParcel("PICKUP");
    const freshCourier = await heldParcel("STANDARD");
    // Past the stale threshold (3d default) but inside the 7d pickup window.
    const stalePickup = await heldParcel("PICKUP");
    await backdate(stalePickup.shipmentId, 4);
    // Past the pickup window entirely.
    const lapsedPickup = await heldParcel("PICKUP");
    await backdate(lapsedPickup.shipmentId, 8);
    // A courier-routed parcel stuck at the hub.
    const stuck = await heldParcel("STANDARD");
    await backdate(stuck.shipmentId, 4);

    const first = await sweepPointParcels();
    expect(first.reminded).toBeGreaterThanOrEqual(1);
    expect(first.expired).toBeGreaterThanOrEqual(1);
    expect(first.flagged).toBeGreaterThanOrEqual(1);

    // Guards stamped on the right parcels, fresh ones untouched.
    const guards = await prisma.shipment.findMany({
      where: {
        id: {
          in: [
            freshPickup.shipmentId,
            freshCourier.shipmentId,
            stalePickup.shipmentId,
            lapsedPickup.shipmentId,
            stuck.shipmentId,
          ],
        },
      },
      select: { id: true, pickupRemindedAt: true, staleFlaggedAt: true },
    });
    const g = new Map(guards.map((s) => [s.id, s]));
    expect(g.get(stalePickup.shipmentId)?.pickupRemindedAt).not.toBeNull();
    expect(g.get(stalePickup.shipmentId)?.staleFlaggedAt).toBeNull();
    expect(g.get(lapsedPickup.shipmentId)?.staleFlaggedAt).not.toBeNull();
    expect(g.get(stuck.shipmentId)?.staleFlaggedAt).not.toBeNull();
    expect(g.get(freshPickup.shipmentId)?.pickupRemindedAt).toBeNull();
    expect(g.get(freshCourier.shipmentId)?.staleFlaggedAt).toBeNull();

    // The right people were told.
    expect(
      await notifCount(fx.buyerId, "Your parcel is waiting"),
    ).toBeGreaterThanOrEqual(1);
    expect(
      await notifCount(fx.buyerId, "Pickup window expired"),
    ).toBeGreaterThanOrEqual(1);
    expect(
      await notifCount(ownerId, "Pickup window expired"),
    ).toBeGreaterThanOrEqual(1);
    expect(
      await notifCount(fx.sellerUserId, "Parcel not collected"),
    ).toBeGreaterThanOrEqual(1);
    expect(
      await notifCount(ownerId, "Parcel stuck at your hub"),
    ).toBeGreaterThanOrEqual(1);

    // Second run: one-shot guards make it a no-op for OUR parcels.
    const buyerBefore = await prisma.notification.count({
      where: { userId: fx.buyerId },
    });
    const ownerBefore = await prisma.notification.count({
      where: { userId: ownerId },
    });
    await sweepPointParcels();
    expect(
      await prisma.notification.count({ where: { userId: fx.buyerId } }),
    ).toBe(buyerBefore);
    expect(
      await prisma.notification.count({ where: { userId: ownerId } }),
    ).toBe(ownerBefore);
  });
});
