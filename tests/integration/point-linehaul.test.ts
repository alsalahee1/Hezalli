// Inter-point line-haul (docs/DELIVERY-POINTS.md §14): origin receive →
// transfer handover → destination receive, with correct custody stamps and
// hop-aware guards. Boundaries mocked: auth(), revalidatePath, getLocale.
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

import { pointHandoverParcel, pointReceiveParcel } from "@/lib/actions/point";
import { shipSubOrder } from "@/lib/actions/shipment";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let originOwnerId: string;
let destOwnerId: string;
let originPointId: string;
let destPointId: string;
let courierId: string;
let carrierId: string;
let trackingSeq = 0;
const userIds: string[] = [];

beforeAll(async () => {
  fx = await makeFixture();
  const uniq = Date.now().toString(36);
  const mkUser = (tag: string, roles: string[]) =>
    prisma.user.create({
      data: {
        email: `lh-${tag}-${uniq}@t.local`,
        roles: roles as never,
        locale: "en",
      },
    });
  const o1 = await mkUser("o1", ["DELIVERY_POINT"]);
  const o2 = await mkUser("o2", ["DELIVERY_POINT"]);
  const crr = await mkUser("crr", ["COURIER"]);
  const origin = await prisma.deliveryPoint.create({
    data: {
      ownerId: o1.id,
      name: "Sanaa Hub",
      phone: "770000008",
      governorate: "Sanaa",
      city: "Sanaa",
      addressLine: "North rd",
    },
  });
  const dest = await prisma.deliveryPoint.create({
    data: {
      ownerId: o2.id,
      name: "Aden Hub",
      phone: "770000009",
      governorate: "Aden",
      city: "Aden",
      addressLine: "South rd",
    },
  });
  const carrier = await prisma.carrier.create({
    data: { name: `Hezalli Express L-${uniq}`, platformManaged: true },
  });
  // Deterministic: no auto-assign at the destination.
  await prisma.platformSetting.upsert({
    where: { key: "express_auto_assign" },
    create: { key: "express_auto_assign", value: false },
    update: { value: false },
  });
  originOwnerId = o1.id;
  destOwnerId = o2.id;
  originPointId = origin.id;
  destPointId = dest.id;
  courierId = crr.id;
  carrierId = carrier.id;
  userIds.push(o1.id, o2.id, crr.id);
});

afterAll(async () => {
  await prisma.notification
    .deleteMany({ where: { userId: { in: userIds } } })
    .catch(() => {});
  await fx.cleanup();
  await prisma.user
    .deleteMany({ where: { id: { in: userIds } } })
    .catch(() => {});
  await prisma.carrier.delete({ where: { id: carrierId } }).catch(() => {});
});

async function shipTwoHop() {
  const { subOrderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "PROCESSING",
  });
  const trackingNumber =
    `LH${Date.now().toString(36)}${(trackingSeq++).toString(36)}`.toUpperCase();
  as(fx.sellerUserId);
  expect(
    await shipSubOrder(subOrderId, {
      carrierId,
      trackingNumber,
      deliveryPointId: destPointId,
      originPointId,
    }),
  ).toEqual({ ok: true });
  return { subOrderId, trackingNumber };
}

describe("two-hop line-haul", () => {
  it("walks origin receive → transfer → destination receive → last mile", async () => {
    const { subOrderId, trackingNumber } = await shipTwoHop();
    const ship = await prisma.shipment.findUnique({
      where: { subOrderId },
      select: { id: true, originPointId: true, deliveryPointId: true },
    });
    expect(ship?.originPointId).toBe(originPointId);
    expect(ship?.deliveryPointId).toBe(destPointId);

    // The destination can't receive it before the line-haul leg exists.
    as(destOwnerId);
    expect(await pointReceiveParcel(trackingNumber)).toMatchObject({
      error: "badState",
    });

    // Origin receives: held at origin, buyer told it's moving, no assignment.
    as(originOwnerId);
    expect(await pointReceiveParcel(trackingNumber)).toMatchObject({
      ok: true,
    });
    let s = await prisma.shipment.findUnique({
      where: { id: ship!.id },
      select: { status: true, atPointId: true, driverId: true },
    });
    expect(s).toMatchObject({
      status: "AT_POINT",
      atPointId: originPointId,
      driverId: null,
    });

    // Transfer handover at the origin → IN_TRANSIT with the transfer driver.
    expect(await pointHandoverParcel(trackingNumber, courierId)).toEqual({
      ok: true,
    });
    s = await prisma.shipment.findUnique({
      where: { id: ship!.id },
      select: { status: true, atPointId: true, driverId: true },
    });
    expect(s).toMatchObject({
      status: "IN_TRANSIT",
      atPointId: null,
      driverId: courierId,
    });

    // Destination receives the line-haul: held there, transfer driver released.
    as(destOwnerId);
    expect(await pointReceiveParcel(trackingNumber)).toMatchObject({
      ok: true,
    });
    s = await prisma.shipment.findUnique({
      where: { id: ship!.id },
      select: { status: true, atPointId: true, driverId: true },
    });
    expect(s).toMatchObject({
      status: "AT_POINT",
      atPointId: destPointId,
      driverId: null,
    });

    // Last mile proceeds exactly as single-hop.
    expect(await pointHandoverParcel(trackingNumber, courierId)).toEqual({
      ok: true,
    });
    expect(
      (
        await prisma.shipment.findUnique({
          where: { id: ship!.id },
          select: { status: true },
        })
      )?.status,
    ).toBe("OUT_FOR_DELIVERY");
  });

  it("lets PICKUP orders transfer at the origin but not hand over at the destination", async () => {
    const { subOrderId, trackingNumber } = await shipTwoHop();
    await prisma.subOrder.update({
      where: { id: subOrderId },
      data: { shippingMethod: "PICKUP", pickupPointId: destPointId },
    });

    as(originOwnerId);
    expect(await pointReceiveParcel(trackingNumber)).toMatchObject({
      ok: true,
    });
    // Transfer leg is NOT the last mile — allowed for pickup orders.
    expect(await pointHandoverParcel(trackingNumber, courierId)).toEqual({
      ok: true,
    });

    as(destOwnerId);
    expect(await pointReceiveParcel(trackingNumber)).toMatchObject({
      ok: true,
    });
    // At the destination the buyer collects with their code — never a driver.
    expect(await pointHandoverParcel(trackingNumber, courierId)).toEqual({
      error: "pickupOnly",
    });
  });
});
