// Shared tracking read model behind the JSON endpoint + the SSE stream. Local
// Postgres. Focus: privacy (courier point only while out for delivery) and the
// terminal-state signal the stream uses to close.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getTrackingSnapshot, isTerminalTracking } from "@/lib/track";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

let fx: Awaited<ReturnType<typeof makeFixture>>;
let courierId: string;
let subOrderId: string;
let orderId: string;
const tracking = `TRK-${Date.now().toString(36)}`;

beforeAll(async () => {
  fx = await makeFixture();
  const c = await prisma.user.create({
    data: {
      email: `trk-${Date.now().toString(36)}@t.local`,
      roles: ["COURIER"],
      name: "Track Driver",
    },
  });
  courierId = c.id;
  await prisma.courierLocation.create({
    data: { userId: courierId, lat: 15.35, lng: 44.2, governorate: "Sanaa" },
  });

  const made = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "SHIPPED",
  });
  subOrderId = made.subOrderId;
  const sub = await prisma.subOrder.findUnique({
    where: { id: subOrderId },
    select: { orderId: true },
  });
  orderId = sub!.orderId;
  // Geocode the destination so the snapshot exposes a dest pin.
  await prisma.order.update({
    where: { id: orderId },
    data: { address: { update: { lat: 15.4, lng: 44.25 } } },
  });
  await prisma.shipment.create({
    data: {
      subOrderId,
      trackingNumber: tracking,
      status: "OUT_FOR_DELIVERY",
      platformManaged: true,
      driverId: courierId,
    },
  });
});

afterAll(async () => {
  await prisma.shipment
    .deleteMany({ where: { trackingNumber: tracking } })
    .catch(() => {});
  await prisma.courierLocation
    .deleteMany({ where: { userId: courierId } })
    .catch(() => {});
  await prisma.user.deleteMany({ where: { id: courierId } }).catch(() => {});
  await fx.cleanup();
});

describe("getTrackingSnapshot", () => {
  it("exposes the courier point + destination while out for delivery", async () => {
    const snap = await getTrackingSnapshot(tracking);
    expect(snap.status).toBe("OUT_FOR_DELIVERY");
    expect(snap.driver).not.toBeNull();
    expect(snap.driver!.lat).toBeCloseTo(15.35);
    expect(snap.dest).toEqual({ lat: 15.4, lng: 44.25 });
    expect(isTerminalTracking(snap.status)).toBe(false);
  });

  it("hides the courier point once the parcel is delivered (privacy + terminal)", async () => {
    await prisma.shipment.updateMany({
      where: { trackingNumber: tracking },
      data: { status: "DELIVERED" },
    });
    const snap = await getTrackingSnapshot(tracking);
    expect(snap.status).toBe("DELIVERED");
    expect(snap.driver).toBeNull(); // no live position after the run
    expect(snap.dest).toEqual({ lat: 15.4, lng: 44.25 });
    expect(isTerminalTracking(snap.status)).toBe(true);
  });

  it("returns an empty snapshot for an unknown tracking number", async () => {
    const snap = await getTrackingSnapshot("does-not-exist");
    expect(snap).toEqual({ status: null, driver: null, dest: null });
    expect(isTerminalTracking(snap.status)).toBe(false);
  });
});
