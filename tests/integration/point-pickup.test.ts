// Buyer pickup from point (PUDO — docs/DELIVERY-POINTS.md §6) against local
// Postgres: checkout choice, forced routing, ready-notification without a
// courier, code-gated counter handover with COD cash on the point's ledger.
// Boundaries mocked: auth() (impersonation), revalidatePath, getLocale.
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

import { placeOrder } from "@/lib/actions/order";
import {
  pointBuyerPickup,
  pointHandoverParcel,
  pointReceiveParcel,
  pointReturnToSeller,
} from "@/lib/actions/point";
import { shipSubOrder } from "@/lib/actions/shipment";
import { pointLedgerSummary } from "@/lib/point-ledger";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let pointOwnerId: string;
let pointId: string;
let carrierId: string;
const extraUserIds: string[] = [];
let trackingSeq = 0;

beforeAll(async () => {
  fx = await makeFixture();
  const uniq = Date.now().toString(36);

  const owner = await prisma.user.create({
    data: {
      email: `pu-own-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: "Pickup Point",
      phone: "770000003",
      governorate: "Aden",
      city: "Aden",
      addressLine: "Corner street 2",
    },
  });
  const carrier = await prisma.carrier.create({
    data: { name: `Hezalli Express P-${uniq}`, platformManaged: true },
  });
  pointOwnerId = owner.id;
  pointId = point.id;
  carrierId = carrier.id;
  extraUserIds.push(owner.id);
});

afterAll(async () => {
  await prisma.notification
    .deleteMany({ where: { userId: { in: extraUserIds } } })
    .catch(() => {});
  await fx.cleanup();
  await prisma.user
    .deleteMany({ where: { id: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.carrier.delete({ where: { id: carrierId } }).catch(() => {});
});

// A PROCESSING PICKUP sub-order routed to our point, shipped by the seller.
async function shipPickupParcel() {
  const { subOrderId, orderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "PROCESSING",
  });
  await prisma.subOrder.update({
    where: { id: subOrderId },
    data: { shippingMethod: "PICKUP", pickupPointId: pointId },
  });
  const trackingNumber =
    `PU${Date.now().toString(36)}${(trackingSeq++).toString(36)}`.toUpperCase();
  as(fx.sellerUserId);
  // No deliveryPointId passed — the route must be forced from the sub-order.
  expect(await shipSubOrder(subOrderId, { carrierId, trackingNumber })).toEqual(
    { ok: true },
  );
  const shipment = await prisma.shipment.findUnique({
    where: { subOrderId },
    select: {
      id: true,
      status: true,
      deliveryPointId: true,
      deliveryCode: true,
      driverId: true,
    },
  });
  return { subOrderId, orderId, trackingNumber, shipment: shipment! };
}

describe("checkout with pickup", () => {
  it("requires a point and stores the choice on the sub-order", async () => {
    as(fx.buyerId);
    const base = {
      addressId: fx.addressId,
      items: [{ variantId: fx.variantId, quantity: 1 }],
      paymentMethod: "COD" as const,
      shippingMethods: { [fx.storeId]: "PICKUP" as const },
    };
    expect(await placeOrder(base)).toEqual({ error: "pickupPointRequired" });
    expect(await placeOrder({ ...base, pickupPointId: "nope" })).toEqual({
      error: "pickupPointRequired",
    });

    const res = await placeOrder({ ...base, pickupPointId: pointId });
    expect(res.orderId).toBeTruthy();
    const sub = await prisma.subOrder.findFirst({
      where: { orderId: res.orderId },
      select: {
        shippingMethod: true,
        pickupPointId: true,
        shippingTotal: true,
      },
    });
    expect(sub).toMatchObject({
      shippingMethod: "PICKUP",
      pickupPointId: pointId,
    });
    // Pickup is free by default (pickup_fee = 0).
    expect(Number(sub?.shippingTotal)).toBe(0);
  });
});

describe("pickup custody chain", () => {
  it("forces the route, readies without a courier, and releases on the code", async () => {
    const { subOrderId, trackingNumber, shipment } = await shipPickupParcel();
    expect(shipment.status).toBe("LABEL_CREATED");
    expect(shipment.deliveryPointId).toBe(pointId);

    // Non-platform carriers can't serve a pickup order at all.
    const { subOrderId: other } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "PROCESSING",
    });
    await prisma.subOrder.update({
      where: { id: other },
      data: { shippingMethod: "PICKUP", pickupPointId: pointId },
    });
    const thirdParty = await prisma.carrier.create({
      data: { name: `3PP-${Date.now().toString(36)}`, platformManaged: false },
    });
    as(fx.sellerUserId);
    expect(
      await shipSubOrder(other, {
        carrierId: thirdParty.id,
        trackingNumber: "Y123456",
      }),
    ).toEqual({ error: "pointNotAllowed" });
    await prisma.carrier.delete({ where: { id: thirdParty.id } });

    // Receive: ready for the buyer, and NO courier gets assigned.
    as(pointOwnerId);
    expect(await pointReceiveParcel(trackingNumber)).toEqual({ ok: true });
    const atPoint = await prisma.shipment.findUnique({
      where: { id: shipment.id },
      select: { status: true, driverId: true },
    });
    expect(atPoint).toMatchObject({ status: "AT_POINT", driverId: null });
    const readyNote = await prisma.notification.findFirst({
      where: { userId: fx.buyerId, title: { contains: "ready for pickup" } },
    });
    expect(readyNote).toBeTruthy();

    // Drivers can never take a pickup parcel from the counter.
    expect(await pointHandoverParcel(trackingNumber, pointOwnerId)).toEqual({
      error: "pickupOnly",
    });

    // The buyer's code is the key: wrong code opens nothing.
    expect(await pointBuyerPickup("WRONGCODE1")).toEqual({ error: "notFound" });
    const res = await pointBuyerPickup(shipment.deliveryCode!);
    // COD due = items total (shipping is free for pickup in this fixture).
    expect(res).toMatchObject({ ok: true, codDue: fx.price });

    const done = await prisma.subOrder.findUnique({
      where: { id: subOrderId },
      select: {
        status: true,
        shipment: { select: { status: true, attempts: true } },
        order: { select: { payment: { select: { status: true } } } },
      },
    });
    expect(done?.status).toBe("DELIVERED");
    expect(done?.shipment?.status).toBe("DELIVERED");
    expect(done?.shipment?.attempts[0]).toMatchObject({
      outcome: "DELIVERED",
      codeVerified: true,
      courierId: null,
    });
    // COD captured at the counter.
    expect(done?.order.payment?.status).toBe("CONFIRMED");

    // Money: handling fee on the earnings side, COD on the cash side, and no
    // courier ledger rows at all.
    const summary = await pointLedgerSummary(pointId);
    expect(summary.totalFees).toBeCloseTo(0.5);
    expect(summary.cashOnHand).toBeCloseTo(fx.price);
    expect(
      await prisma.courierLedgerEntry.count({ where: { subOrderId } }),
    ).toBe(0);

    // A delivered code can't be replayed.
    expect(await pointBuyerPickup(shipment.deliveryCode!)).toEqual({
      error: "notFound",
    });
  });

  it("lets the point RTS an uncollected pickup parcel straight from AT_POINT", async () => {
    const { trackingNumber, shipment } = await shipPickupParcel();
    as(pointOwnerId);
    expect(await pointReceiveParcel(trackingNumber)).toEqual({ ok: true });
    expect(
      await pointReturnToSeller(trackingNumber, "never collected"),
    ).toEqual({ ok: true });
    expect(
      (await prisma.shipment.findUnique({ where: { id: shipment.id } }))
        ?.status,
    ).toBe("RETURNED");
  });
});
