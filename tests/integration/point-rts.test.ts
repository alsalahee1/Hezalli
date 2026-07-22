// Automatic resolution & refunds on RTS (docs/DELIVERY-POINTS.md §10): the
// return-to-seller scan cancels uncaptured orders, refunds captured prepaid
// ones to the buyer's wallet, and restocks the returned items in both cases.
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

import { pointReceiveParcel, pointReturnToSeller } from "@/lib/actions/point";
import { shipSubOrder } from "@/lib/actions/shipment";
import { prisma } from "@/lib/prisma";
import { makeFixture, type PaymentChoice } from "./factory";

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
      email: `rts-own-${uniq}@t.local`,
      roles: ["DELIVERY_POINT"],
      locale: "en",
    },
  });
  const point = await prisma.deliveryPoint.create({
    data: {
      ownerId: owner.id,
      name: "RTS Point",
      phone: "770000006",
      governorate: "Aden",
      city: "Aden",
      addressLine: "Street 3",
    },
  });
  const carrier = await prisma.carrier.create({
    data: { name: `Hezalli Express R-${uniq}`, platformManaged: true },
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

// A pickup parcel held AT_POINT (RTS-able immediately for uncollected pickups).
async function heldParcel(paymentMethod: PaymentChoice) {
  const { subOrderId, orderId } = await fx.createSubOrder({
    paymentMethod,
    status: "PROCESSING",
  });
  await prisma.subOrder.update({
    where: { id: subOrderId },
    data: { shippingMethod: "PICKUP", pickupPointId: pointId },
  });
  const trackingNumber =
    `RT${Date.now().toString(36)}${(trackingSeq++).toString(36)}`.toUpperCase();
  as(fx.sellerUserId);
  expect(await shipSubOrder(subOrderId, { carrierId, trackingNumber })).toEqual(
    { ok: true },
  );
  as(ownerId);
  expect(await pointReceiveParcel(trackingNumber)).toEqual({ ok: true });
  return { subOrderId, orderId, trackingNumber };
}

const stockNow = async () =>
  (await prisma.productVariant.findUnique({ where: { id: fx.variantId } }))!
    .stock;

describe("RTS resolution", () => {
  it("cancels an uncaptured COD order and restocks the items", async () => {
    const { subOrderId, orderId, trackingNumber } = await heldParcel("COD");
    const before = await stockNow();

    as(ownerId);
    expect(
      await pointReturnToSeller(trackingNumber, "never collected"),
    ).toEqual({ ok: true });

    const sub = await prisma.subOrder.findUnique({
      where: { id: subOrderId },
      select: { status: true, shipment: { select: { status: true } } },
    });
    expect(sub?.status).toBe("CANCELLED");
    expect(sub?.shipment?.status).toBe("RETURNED");
    expect(await stockNow()).toBe(before + 1);
    // No refund row — nothing was ever captured.
    expect(await prisma.refund.count({ where: { subOrderId } })).toBe(0);
    // Order history + buyer notice recorded.
    expect(
      await prisma.orderStatusHistory.findFirst({
        where: { orderId, status: "CANCELLED", actor: "system" },
      }),
    ).toBeTruthy();
    expect(
      await prisma.notification.findFirst({
        where: { userId: fx.buyerId, title: { contains: "cancelled" } },
      }),
    ).toBeTruthy();
  });

  it("refunds a captured wallet-paid order to the buyer's wallet and restocks", async () => {
    const { subOrderId, trackingNumber } = await heldParcel("HEZALLI_BALANCE");
    const before = await stockNow();

    as(ownerId);
    expect(await pointReturnToSeller(trackingNumber)).toEqual({ ok: true });

    const sub = await prisma.subOrder.findUnique({
      where: { id: subOrderId },
      select: { status: true },
    });
    expect(sub?.status).toBe("REFUNDED");
    expect(await stockNow()).toBe(before + 1);

    const refund = await prisma.refund.findFirst({ where: { subOrderId } });
    expect(Number(refund?.amountUsd)).toBeCloseTo(fx.price);
    // The money landed back in the buyer's HezalliPay wallet.
    const walletEntry = await prisma.walletEntry.findFirst({
      where: { subOrderId, type: "REFUND" },
    });
    expect(Number(walletEntry?.amountUsd)).toBeCloseTo(fx.price);
  });

  it("refuses RTS while the buyer has a redelivery booked, allows it once cleared", async () => {
    // A failed EXPRESS parcel sitting RETURNED_TO_POINT with a redelivery the
    // buyer just booked — RTS would cancel/refund a live order out from under
    // them, so it must be blocked until the redelivery is honored/cleared.
    const { subOrderId, orderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "SHIPPED",
    });
    const trackingNumber =
      `RB${Date.now().toString(36)}${(trackingSeq++).toString(36)}`.toUpperCase();
    await prisma.shipment.create({
      data: {
        subOrderId,
        trackingNumber,
        status: "RETURNED_TO_POINT",
        platformManaged: true,
        deliveryPointId: pointId,
        atPointId: pointId,
        attemptCount: 1,
        redeliverAt: new Date(Date.now() + 2 * 86_400_000),
        shippedAt: new Date(),
      },
    });
    void orderId;

    as(ownerId);
    expect(await pointReturnToSeller(trackingNumber, "give up")).toEqual({
      error: "redeliveryPending",
    });
    expect(
      (
        await prisma.subOrder.findUniqueOrThrow({
          where: { id: subOrderId },
          select: { status: true },
        })
      ).status,
    ).toBe("SHIPPED"); // untouched — order still live

    // Once the redelivery is cleared (parcel not rebooked anymore), RTS works.
    await prisma.shipment.updateMany({
      where: { subOrderId },
      data: { redeliverAt: null },
    });
    expect(await pointReturnToSeller(trackingNumber, "give up")).toEqual({
      ok: true,
    });
    expect(
      (
        await prisma.subOrder.findUniqueOrThrow({
          where: { id: subOrderId },
          select: { status: true },
        })
      ).status,
    ).toBe("CANCELLED"); // uncaptured COD → cancelled on RTS
  });
});
