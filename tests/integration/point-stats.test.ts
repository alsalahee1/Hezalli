// Delivery network analytics (docs/DELIVERY-POINTS.md §18). Other suites run
// against the same database concurrently, so assertions are deltas/lower
// bounds rather than exact global counts.
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
  pointBuyerPickup,
  pointReceiveParcel,
  pointReturnToSeller,
} from "@/lib/actions/point";
import { shipSubOrder } from "@/lib/actions/shipment";
import { hubDaySummary, hubSummary, networkSummary } from "@/lib/point-stats";
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
      email: `st-own-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: `Stats Point ${uniq}`,
      phone: "770000012",
      governorate: "Aden",
      city: "Aden",
      addressLine: "Stat st",
    },
  });
  const carrier = await prisma.carrier.create({
    data: { name: `Hezalli Express S-${uniq}`, platformManaged: true },
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

// A pickup parcel received at the point; returns its tracking + delivery code.
async function receivedPickupParcel() {
  const { subOrderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "PROCESSING",
  });
  await prisma.subOrder.update({
    where: { id: subOrderId },
    data: { shippingMethod: "PICKUP", pickupPointId: pointId },
  });
  const trackingNumber =
    `ST${Date.now().toString(36)}${(trackingSeq++).toString(36)}`.toUpperCase();
  as(fx.sellerUserId);
  expect(await shipSubOrder(subOrderId, { carrierId, trackingNumber })).toEqual(
    { ok: true },
  );
  as(ownerId);
  expect(await pointReceiveParcel(trackingNumber)).toEqual({ ok: true });
  const ship = await prisma.shipment.findUnique({
    where: { subOrderId },
    select: { deliveryCode: true },
  });
  return { trackingNumber, deliveryCode: ship!.deliveryCode! };
}

describe("networkSummary", () => {
  it("counts shipped / delivered / RTS and per-hub volume + fees", async () => {
    const from = new Date(Date.now() - 60_000);
    const before = await networkSummary(from, new Date(Date.now() + 3_600_000));

    // One parcel delivered at the counter, one returned to the seller.
    const a = await receivedPickupParcel();
    as(ownerId);
    expect((await pointBuyerPickup(a.deliveryCode)).ok).toBe(true);
    const b = await receivedPickupParcel();
    expect(await pointReturnToSeller(b.trackingNumber)).toEqual({ ok: true });

    const to = new Date(Date.now() + 3_600_000);
    const after = await networkSummary(from, to);

    expect(after.shipped).toBeGreaterThanOrEqual(before.shipped + 2);
    expect(after.delivered).toBeGreaterThanOrEqual(before.delivered + 1);
    expect(after.rts).toBeGreaterThanOrEqual(before.rts + 1);
    expect(after.successRatePct).not.toBeNull();
    expect(after.avgDeliveryHours).not.toBeNull();
    // Our hub shows up with its delivered parcel and the handling fee.
    const row = after.perPoint.find((p) => p.pointId === pointId);
    expect(row?.delivered).toBeGreaterThanOrEqual(1);
    expect(row?.feesUsd).toBeGreaterThanOrEqual(0.5);

    // The operator-facing slice (docs §42) agrees with the network view:
    // this hub is scoped, so the counts are exact, not lower bounds.
    const hub = await hubSummary(pointId, from, to);
    expect(hub.delivered).toBe(1);
    expect(hub.pickups).toBe(1);
    expect(hub.rts).toBe(1);
    expect(hub.feesUsd).toBeGreaterThanOrEqual(0.5);
    expect(hub.successRatePct).toBe(50);
    expect(hub.pickupSharePct).toBe(100);
    // Out of range → empty.
    const past = await hubSummary(
      pointId,
      new Date(Date.now() - 7_200_000),
      from,
    );
    expect(past.delivered).toBe(0);
    expect(past.rts).toBe(0);
    expect(past.feesUsd).toBe(0);
    expect(past.successRatePct).toBeNull();

    // The end-of-day card: both receive scans landed as events at this hub,
    // the counter pickup took COD cash and booked the handling fee.
    const day = await hubDaySummary(pointId, from);
    expect(day.received).toBe(2);
    expect(day.handedOver).toBe(0);
    expect(day.cashTakenUsd).toBeGreaterThan(0);
    expect(day.feesUsd).toBeGreaterThanOrEqual(0.5);
  });
});
