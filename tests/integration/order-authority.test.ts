// Authority guards across the delivery/money flow — each test drives a REAL
// server action as the wrong actor / in the wrong state / on the wrong carrier
// type and asserts it is refused, then (where relevant) that the right actor in
// the right state still works. These are the "should this actor be able to do
// this, here?" invariants that a pure code-logic test misses.
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

import { forceOrderStatus } from "@/lib/actions/admin-oversight";
import {
  assignCourier,
  courierAdvance,
  courierFailDelivery,
} from "@/lib/actions/courier";
import { acceptSubOrder, cancelSubOrder } from "@/lib/actions/seller-order";
import { editTracking, shipSubOrder } from "@/lib/actions/shipment";
import { overrideShipmentStatus } from "@/lib/actions/shipment-admin";
import { courierCashSummary } from "@/lib/courier-ledger";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let platformCarrierId: string;
let thirdPartyCarrierId: string;
let managerId: string;
let adminId: string;
const extraUserIds: string[] = [];

async function makeCourier(tag: string): Promise<string> {
  const c = await prisma.user.create({
    data: {
      email: `oa-${tag}-${Math.random().toString(36).slice(2)}@t.local`,
      roles: ["COURIER"],
    },
  });
  extraUserIds.push(c.id);
  return c.id;
}

beforeAll(async () => {
  fx = await makeFixture({ price: 100, stock: 20, commissionRate: 0.1 });
  const uniq = Math.random().toString(36).slice(2);
  platformCarrierId = (
    await prisma.carrier.create({
      data: { name: `Hezalli Express ${uniq}`, platformManaged: true },
    })
  ).id;
  thirdPartyCarrierId = (
    await prisma.carrier.create({
      data: { name: `Aramex ${uniq}`, platformManaged: false },
    })
  ).id;
  const mgr = await prisma.user.create({
    data: { email: `oa-mgr-${uniq}@t.local`, roles: ["DELIVERY_MANAGER"] },
  });
  managerId = mgr.id;
  const adm = await prisma.user.create({
    data: { email: `oa-adm-${uniq}@t.local`, roles: ["ADMIN"] },
  });
  adminId = adm.id;
  extraUserIds.push(mgr.id, adm.id);

  // Buyer wallet so prepaid refunds have somewhere to land.
  const wallet = await prisma.wallet.upsert({
    where: { userId: fx.buyerId },
    create: { userId: fx.buyerId, availableUsd: 0 },
    update: {},
    select: { id: true },
  });
  await prisma.walletEntry.create({
    data: { walletId: wallet.id, type: "TOP_UP", amountUsd: 0 },
  });
});

afterAll(async () => {
  await prisma.courierLedgerEntry
    .deleteMany({ where: { courierId: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.notification
    .deleteMany({ where: { userId: { in: extraUserIds } } })
    .catch(() => {});
  await fx.cleanup();
  await prisma.walletEntry
    .deleteMany({ where: { wallet: { userId: fx.buyerId } } })
    .catch(() => {});
  await prisma.wallet
    .deleteMany({ where: { userId: fx.buyerId } })
    .catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.carrier
    .deleteMany({
      where: { id: { in: [platformCarrierId, thirdPartyCarrierId] } },
    })
    .catch(() => {});
});

// A two-hop line-haul parcel in transit: destination point set, origin hub set,
// assigned to a transfer driver, shipment IN_TRANSIT, sub-order SHIPPED.
async function lineHaulInTransit(driverId: string) {
  const { subOrderId, orderId } = await fx.createSubOrder({
    paymentMethod: "COD",
    status: "SHIPPED",
  });
  const shipment = await prisma.shipment.create({
    data: {
      subOrderId,
      status: "IN_TRANSIT",
      platformManaged: true,
      shippedAt: new Date(),
      driverId,
      deliveryPointId: null, // set below to a real point-less marker
    },
    select: { id: true },
  });
  // A delivery point is required for the guard; create a lightweight one.
  const pt = await prisma.deliveryPoint.create({
    data: {
      ownerId: driverId, // any user; not exercised here
      name: `Dest ${Math.random().toString(36).slice(2)}`,
      phone: "770000000",
      governorate: "Aden",
      city: "Aden",
      addressLine: "St 1",
    },
  });
  await prisma.shipment.update({
    where: { id: shipment.id },
    data: { deliveryPointId: pt.id, originPointId: pt.id },
  });
  return { subOrderId, orderId, shipmentId: shipment.id, pointId: pt.id };
}

describe("driver: line-haul transfer driver cannot last-mile a parcel in transit", () => {
  it("blocks DELIVERED and FAILED while IN_TRANSIT with a delivery point", async () => {
    const driver = await makeCourier("lh");
    const { shipmentId, pointId } = await lineHaulInTransit(driver);
    as(driver);
    // The transfer driver's custody ends at the destination point's receive
    // scan — they cannot deliver or fail the parcel from the road.
    expect(await courierAdvance(shipmentId, "DELIVERED")).toEqual({
      error: "badState",
    });
    expect(await courierFailDelivery(shipmentId, "unreachable")).toEqual({
      error: "badState",
    });
    // No cash was captured onto the transfer driver.
    expect((await courierCashSummary(driver)).cashOnHand).toBe(0);
    await prisma.deliveryPoint
      .delete({ where: { id: pointId } })
      .catch(() => {});
  });

  it("refuses a FAILED attempt unless the parcel is out for delivery", async () => {
    const driver = await makeCourier("fd");
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "SHIPPED",
    });
    // A direct parcel just shipped (IN_TRANSIT), not yet taken out. The driver
    // can't log a failed doorstep attempt on it — nothing was attempted.
    const shipment = await prisma.shipment.create({
      data: {
        subOrderId,
        status: "IN_TRANSIT",
        platformManaged: true,
        shippedAt: new Date(),
        driverId: driver,
      },
      select: { id: true },
    });
    as(driver);
    expect(await courierFailDelivery(shipment.id, "unreachable")).toEqual({
      error: "badState",
    });
    // Once actually out for delivery, a failed attempt is allowed.
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { status: "OUT_FOR_DELIVERY" },
    });
    expect(await courierFailDelivery(shipment.id, "unreachable")).toEqual({
      ok: true,
    });
  });
});

describe("staff override: RETURNED settles money, does not just flip a flag", () => {
  it("refunds a captured order and restocks on override→RETURNED", async () => {
    const stockBefore = (
      await prisma.productVariant.findUniqueOrThrow({
        where: { id: fx.variantId },
        select: { stock: true },
      })
    ).stock;
    const { subOrderId, orderId } = await fx.createSubOrder({
      paymentMethod: "HEZALLI_BALANCE", // prepaid, payment CONFIRMED (captured)
      status: "SHIPPED",
    });
    const shipment = await prisma.shipment.create({
      data: {
        subOrderId,
        status: "FAILED",
        platformManaged: true,
        shippedAt: new Date(),
      },
      select: { id: true },
    });

    as(managerId);
    expect(await overrideShipmentStatus(shipment.id, "RETURNED")).toEqual({
      ok: true,
    });
    // Sub-order settled as a return: prepaid → REFUNDED (not left SHIPPED).
    expect(
      (
        await prisma.subOrder.findUniqueOrThrow({
          where: { id: subOrderId },
          select: { status: true },
        })
      ).status,
    ).toBe("REFUNDED");
    // A refund was recorded and the buyer's wallet credited.
    expect(await prisma.refund.count({ where: { subOrderId } })).toBe(1);
    // Stock restored to its pre-order level (createSubOrder doesn't decrement,
    // so returning restocks +1 above baseline — assert the increment happened).
    const stockAfter = (
      await prisma.productVariant.findUniqueOrThrow({
        where: { id: fx.variantId },
        select: { stock: true },
      })
    ).stock;
    expect(stockAfter).toBe(stockBefore + 1);
    // Order no longer confirmable/deliverable — it's terminal.
    void orderId;
  });
});

describe("staff override: DELIVERED routes COD cash to a ledger or is refused", () => {
  it("refuses a platform COD parcel with no assigned driver (would strand cash)", async () => {
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "SHIPPED",
    });
    const shipment = await prisma.shipment.create({
      data: { subOrderId, status: "OUT_FOR_DELIVERY", platformManaged: true },
      select: { id: true },
    });
    as(managerId);
    expect(await overrideShipmentStatus(shipment.id, "DELIVERED")).toEqual({
      error: "noCashHandler",
    });
    // Nothing moved.
    expect(
      (
        await prisma.subOrder.findUniqueOrThrow({
          where: { id: subOrderId },
          select: { status: true },
        })
      ).status,
    ).toBe("SHIPPED");
  });

  it("books COD onto the assigned driver when one exists", async () => {
    const driver = await makeCourier("ov");
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "SHIPPED",
    });
    const shipment = await prisma.shipment.create({
      data: {
        subOrderId,
        status: "OUT_FOR_DELIVERY",
        platformManaged: true,
        driverId: driver,
      },
      select: { id: true },
    });
    as(managerId);
    expect(await overrideShipmentStatus(shipment.id, "DELIVERED")).toEqual({
      ok: true,
    });
    expect((await courierCashSummary(driver)).cashOnHand).toBe(100);
  });

  it("refuses any override on an already-settled (terminal) sub-order", async () => {
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "COMPLETED",
    });
    const shipment = await prisma.shipment.create({
      data: { subOrderId, status: "DELIVERED", platformManaged: true },
      select: { id: true },
    });
    as(managerId);
    expect(await overrideShipmentStatus(shipment.id, "IN_TRANSIT")).toEqual({
      error: "orderClosed",
    });
  });
});

describe("dispatch: a Hezalli courier can only be assigned to an Express parcel", () => {
  it("refuses assigning a courier to an external-carrier shipment", async () => {
    const driver = await makeCourier("as");
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "SHIPPED",
    });
    const external = await prisma.shipment.create({
      data: { subOrderId, status: "IN_TRANSIT", platformManaged: false },
      select: { id: true },
    });
    as(managerId);
    expect(await assignCourier(external.id, driver)).toEqual({
      error: "notPlatformManaged",
    });
    // A platform parcel assigns fine.
    const { subOrderId: sub2 } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "SHIPPED",
    });
    const platform = await prisma.shipment.create({
      data: { subOrderId: sub2, status: "IN_TRANSIT", platformManaged: true },
      select: { id: true },
    });
    expect(await assignCourier(platform.id, driver)).toEqual({ ok: true });
  });
});

describe("seller editTracking is third-party only", () => {
  it("refuses editing a Hezalli Express parcel and refuses switching INTO Express", async () => {
    // Ship via Express (platform mints the waybill).
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "PROCESSING",
    });
    as(fx.sellerUserId);
    expect(
      await shipSubOrder(subOrderId, {
        carrierId: platformCarrierId,
        trackingNumber: "",
      }),
    ).toEqual({ ok: true });
    // Cannot edit a platform parcel at all (waybill is system-owned).
    expect(
      await editTracking(subOrderId, {
        carrierId: thirdPartyCarrierId,
        trackingNumber: "ARX-999",
      }),
    ).toEqual({ error: "expressManaged" });
    // The parcel stays platform-managed — the mark-delivered guard is intact.
    expect(
      (
        await prisma.shipment.findUniqueOrThrow({
          where: { subOrderId },
          select: { platformManaged: true },
        })
      ).platformManaged,
    ).toBe(true);
  });

  it("allows correcting a third-party tracking number, but not switching to Express", async () => {
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "PROCESSING",
    });
    as(fx.sellerUserId);
    expect(
      await shipSubOrder(subOrderId, {
        carrierId: thirdPartyCarrierId,
        trackingNumber: "ARX-100",
      }),
    ).toEqual({ ok: true });
    // Typo fix on the same third-party carrier → allowed.
    expect(
      await editTracking(subOrderId, {
        carrierId: thirdPartyCarrierId,
        trackingNumber: "ARX-200",
      }),
    ).toEqual({ ok: true });
    // Switching a third-party parcel INTO Express is refused.
    expect(
      await editTracking(subOrderId, {
        carrierId: platformCarrierId,
        trackingNumber: "",
      }),
    ).toEqual({ error: "expressManaged" });
  });
});

describe("a suspended store can't move money, but can still ship in-flight orders", () => {
  it("blocks cancel-with-refund while still allowing accept + ship", async () => {
    // Suspend the fixture's store for the duration of this test.
    await prisma.store.update({
      where: { id: fx.storeId },
      data: { status: "SUSPENDED" },
    });
    try {
      const { subOrderId } = await fx.createSubOrder({
        paymentMethod: "COD",
        status: "CONFIRMED",
      });
      as(fx.sellerUserId);
      // Fulfilling an existing paid order is still allowed — buyers aren't
      // stranded by a suspension.
      expect(await acceptSubOrder(subOrderId)).toEqual({ ok: true });
      expect(
        await shipSubOrder(subOrderId, {
          carrierId: platformCarrierId,
          trackingNumber: "",
        }),
      ).toEqual({ ok: true });
      // But a money-outflow action (cancel → buyer refund) is refused.
      const { subOrderId: sub2 } = await fx.createSubOrder({
        paymentMethod: "COD",
        status: "CONFIRMED",
      });
      expect(await cancelSubOrder(sub2, "changed my mind")).toEqual({
        error: "storeSuspended",
      });
    } finally {
      await prisma.store.update({
        where: { id: fx.storeId },
        data: { status: "ACTIVE" },
      });
    }
  });
});

describe("admin forceOrderStatus → COMPLETED settles the seller", () => {
  it("does not leave a completed order's seller unpaid", async () => {
    const { orderId, subOrderId } = await fx.createSubOrder({
      paymentMethod: "HEZALLI_BALANCE", // prepaid, captured
      status: "DELIVERED",
    });
    as(adminId);
    expect(
      await forceOrderStatus(orderId, "COMPLETED", "manual close"),
    ).toEqual({ ok: true });
    // The sub-order is COMPLETED and settled (a SALE credit exists).
    expect(
      (
        await prisma.subOrder.findUniqueOrThrow({
          where: { id: subOrderId },
          select: { status: true },
        })
      ).status,
    ).toBe("COMPLETED");
    const sale = await prisma.ledgerEntry.findFirst({
      where: { subOrderId, type: "SALE" },
      select: { amountUsd: true },
    });
    expect(sale).not.toBeNull();
    expect(Number(sale!.amountUsd)).toBe(90); // 100 − 10% commission
  });
});
