// The public live-location endpoint must only expose the courier's position
// while the parcel is actively OUT_FOR_DELIVERY. Against local Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "@/app/api/track/[tracking]/location/route";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const call = async (tracking: string) => {
  const res = await GET(new Request("http://test/loc"), {
    params: Promise.resolve({ tracking }),
  });
  return res.json() as Promise<{
    driver: { lat: number; lng: number } | null;
    dest: { lat: number; lng: number } | null;
  }>;
};

let fx: Awaited<ReturnType<typeof makeFixture>>;
let courierId: string;
let subOrderId: string;
const tracking = `TRK-${Date.now().toString(36)}`;

beforeAll(async () => {
  fx = await makeFixture();
  const courier = await prisma.user.create({
    data: {
      email: `crr-${Date.now().toString(36)}@t.local`,
      roles: ["COURIER"],
      locale: "en",
    },
  });
  courierId = courier.id;
  await prisma.courierLocation.create({
    data: { userId: courierId, lat: 15.35, lng: 44.2, governorate: "Sana'a" },
  });

  const made = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "SHIPPED",
  });
  subOrderId = made.subOrderId;
  // Give the destination coordinates.
  const sub = await prisma.subOrder.findUniqueOrThrow({
    where: { id: subOrderId },
    select: { order: { select: { addressId: true } } },
  });
  await prisma.address.update({
    where: { id: sub.order.addressId! },
    data: { lat: 15.36, lng: 44.19 },
  });
  await prisma.shipment.create({
    data: {
      subOrderId,
      trackingNumber: tracking,
      status: "IN_TRANSIT",
      platformManaged: true,
      driverId: courierId,
      shippedAt: new Date(),
    },
  });
});

afterAll(async () => {
  await prisma.courierLocation
    .deleteMany({ where: { userId: courierId } })
    .catch(() => {});
  await prisma.user.delete({ where: { id: courierId } }).catch(() => {});
  await fx.cleanup();
});

describe("GET /api/track/[tracking]/location", () => {
  it("hides the driver until the parcel is out for delivery (but shows dest)", async () => {
    const data = await call(tracking);
    expect(data.driver).toBeNull();
    expect(data.dest).toEqual({ lat: 15.36, lng: 44.19 });
  });

  it("exposes the live driver point once out for delivery", async () => {
    await prisma.shipment.updateMany({
      where: { trackingNumber: tracking },
      data: { status: "OUT_FOR_DELIVERY" },
    });
    const data = await call(tracking);
    expect(data.driver).toMatchObject({ lat: 15.35, lng: 44.2 });
    expect(data.dest).toEqual({ lat: 15.36, lng: 44.19 });
  });

  it("returns nulls for an unknown tracking number", async () => {
    const data = await call("does-not-exist");
    expect(data).toEqual({ driver: null, dest: null });
  });
});
