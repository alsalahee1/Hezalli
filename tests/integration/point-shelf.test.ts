// Shelf/bin locations inside a hub (docs/DELIVERY-POINTS.md): the receive
// scan stamps where the parcel was put, the driver manifest and buyer-pickup
// scan show it back, and every departure clears it. Boundaries mocked:
// auth() (impersonation), revalidatePath, getLocale.
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
  pointDriverManifest,
  pointHandoverParcel,
  pointReceiveParcel,
  pointReceiveReturn,
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
let trackingSeq = 0;

beforeAll(async () => {
  fx = await makeFixture();
  const uniq = Date.now().toString(36);
  const owner = await prisma.user.create({
    data: {
      email: `sh-own-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const driver = await prisma.user.create({
    data: { email: `sh-drv-${uniq}@t.local`, roles: ["COURIER"], locale: "en" },
  });
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: `Shelf Point ${uniq}`,
      phone: "770000021",
      governorate: "Aden",
      city: "Aden",
      addressLine: "Shelf st",
    },
  });
  const carrier = await prisma.carrier.create({
    data: { name: `Hezalli Express S-${uniq}`, platformManaged: true },
  });
  ownerId = owner.id;
  pointId = point.id;
  carrierId = carrier.id;
  driverId = driver.id;
});

afterAll(async () => {
  await prisma.notification
    .deleteMany({ where: { userId: { in: [ownerId, driverId] } } })
    .catch(() => {});
  await fx.cleanup();
  await prisma.user
    .deleteMany({ where: { id: { in: [ownerId, driverId] } } })
    .catch(() => {});
  await prisma.carrier.delete({ where: { id: carrierId } }).catch(() => {});
});

// A shipped parcel routed to our point (PICKUP order when opts.pickup).
async function shippedParcel(opts: { pickup?: boolean } = {}) {
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
    `SH${Date.now().toString(36)}${(trackingSeq++).toString(36)}`.toUpperCase();
  as(fx.sellerUserId);
  expect(
    await shipSubOrder(subOrderId, {
      carrierId,
      trackingNumber,
      ...(opts.pickup ? {} : { deliveryPointId: pointId }),
    }),
  ).toEqual({ ok: true });
  const ship = await prisma.shipment.findUniqueOrThrow({
    where: { subOrderId },
    select: { id: true, deliveryCode: true },
  });
  return { subOrderId, trackingNumber, ...ship };
}

const shelfOf = async (id: string) =>
  (
    await prisma.shipment.findUniqueOrThrow({
      where: { id },
      select: { shelfCode: true },
    })
  ).shelfCode;

describe("shelf locations", () => {
  it("stamps the shelf at receive, shows it on the driver manifest, clears it at handover", async () => {
    const p = await shippedParcel();
    as(ownerId);
    expect(await pointReceiveParcel(p.trackingNumber, "  A3  ")).toMatchObject({
      ok: true,
    });
    expect(await shelfOf(p.id)).toBe("A3");

    // Pin the assignment so the manifest is deterministic.
    await prisma.shipment.update({
      where: { id: p.id },
      data: { driverId },
    });
    const manifest = await pointDriverManifest(driverId);
    const row = manifest.rows!.find(
      (r) => r.trackingNumber === p.trackingNumber,
    );
    expect(row?.shelf).toBe("A3");

    // Handover: the parcel leaves the hub, the shelf frees up.
    expect(await pointHandoverParcel(p.trackingNumber, driverId)).toEqual({
      ok: true,
    });
    expect(await shelfOf(p.id)).toBeNull();
  });

  it("re-shelves a held parcel on a repeat receive scan with a shelf, without one it stays badState", async () => {
    const p = await shippedParcel();
    as(ownerId);
    expect(await pointReceiveParcel(p.trackingNumber, "B1")).toMatchObject({
      ok: true,
    });
    expect(await pointReceiveParcel(p.trackingNumber, "C2")).toMatchObject({
      ok: true,
      reshelved: true,
    });
    expect(await shelfOf(p.id)).toBe("C2");
    // A plain double receive-scan (no shelf) is still the usual bad state.
    expect(await pointReceiveParcel(p.trackingNumber)).toMatchObject({
      error: "badState",
    });
    expect(await shelfOf(p.id)).toBe("C2");
  });

  it("returns the shelf on the buyer-pickup scan and clears it on delivery", async () => {
    const p = await shippedParcel({ pickup: true });
    as(ownerId);
    expect(await pointReceiveParcel(p.trackingNumber, "D4")).toMatchObject({
      ok: true,
    });
    const res = await pointBuyerPickup(p.deliveryCode!);
    expect(res).toMatchObject({ ok: true, shelf: "D4" });
    expect(await shelfOf(p.id)).toBeNull();
  });

  it("stamps a shelf when a failed parcel is scanned back in", async () => {
    const p = await shippedParcel();
    as(ownerId);
    expect(await pointReceiveParcel(p.trackingNumber, "E5")).toMatchObject({
      ok: true,
    });
    await prisma.shipment.update({
      where: { id: p.id },
      data: { driverId },
    });
    expect(await pointHandoverParcel(p.trackingNumber, driverId)).toEqual({
      ok: true,
    });
    // Doorstep attempt fails; the driver brings it back to the returns shelf.
    await prisma.shipment.update({
      where: { id: p.id },
      data: { status: "FAILED", attemptCount: 1 },
    });
    expect(
      await pointReceiveReturn(p.trackingNumber, undefined, "R1"),
    ).toMatchObject({ ok: true });
    const back = await prisma.shipment.findUniqueOrThrow({
      where: { id: p.id },
      select: { status: true, shelfCode: true },
    });
    expect(back).toMatchObject({
      status: "RETURNED_TO_POINT",
      shelfCode: "R1",
    });
  });
});
