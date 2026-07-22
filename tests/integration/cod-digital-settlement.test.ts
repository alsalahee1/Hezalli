// Digital COD settlement vs cash capture (docs §39) against local Postgres.
// A COD order the buyer settles from their wallet BEFORE handover holds the
// money in-system, so every reversal path must refund it: buyer cancel,
// seller cancel, and a failed-delivery return. Cash-basis COD stays cash:
// each sub-order of a multi-seller order collects its own share, and the
// order-level payment confirms only after the last one. Completion via
// confirmReceived must route still-SHIPPED parcels through the delivery core
// (COD capture + courier ledger), and a digitally-paid COD sub-order settles
// as a SALE, not COD_COMMISSION_DUE.
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

import { confirmReceived } from "@/lib/actions/completion";
import { cancelOrder } from "@/lib/actions/order";
import { payCodWithWallet } from "@/lib/actions/pay-cod";
import { cancelSubOrder } from "@/lib/actions/seller-order";
import { courierCashSummary } from "@/lib/courier-ledger";
import { settleSubOrder } from "@/lib/finance";
import {
  COD_DELIVERY_CONFIRMED_BY,
  COD_WALLET_CONFIRMED_BY,
} from "@/lib/payment-state";
import { prisma } from "@/lib/prisma";
import { settleReturnedSubOrder } from "@/lib/return-core";
import { markSubOrderDelivered } from "@/lib/shipment-core";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
const extraUserIds: string[] = [];
let store2Id: string;

async function makeCourier(tag: string): Promise<string> {
  const c = await prisma.user.create({
    data: {
      email: `cds-${tag}-${Math.random().toString(36).slice(2)}@t.local`,
      roles: ["COURIER"],
      locale: "en",
    },
  });
  extraUserIds.push(c.id);
  return c.id;
}

beforeAll(async () => {
  fx = await makeFixture({ price: 100, commissionRate: 0.1 });

  // Buyer wallet holding $150, backed by a real ledger entry (recomputes must
  // agree with the balance).
  const wallet = await prisma.wallet.upsert({
    where: { userId: fx.buyerId },
    create: { userId: fx.buyerId, availableUsd: 150 },
    update: { availableUsd: 150 },
    select: { id: true },
  });
  await prisma.walletEntry.create({
    data: { walletId: wallet.id, type: "TOP_UP", amountUsd: 150 },
  });

  // A second seller + store for the multi-seller COD order.
  const seller2 = await prisma.user.create({
    data: {
      email: `cds-seller2-${Math.random().toString(36).slice(2)}@t.local`,
      roles: ["SELLER"],
      locale: "en",
    },
  });
  extraUserIds.push(seller2.id);
  const profile2 = await prisma.sellerProfile.create({
    data: { userId: seller2.id },
  });
  const store2 = await prisma.store.create({
    data: {
      sellerId: profile2.id,
      name: "Second Store",
      slug: `cds-store2-${Math.random().toString(36).slice(2)}`,
    },
  });
  store2Id = store2.id;
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
  await prisma.store.deleteMany({ where: { id: store2Id } }).catch(() => {});
  await prisma.user
    .deleteMany({ where: { id: { in: extraUserIds } } })
    .catch(() => {});
});

const walletBalance = async () =>
  Number(
    (
      await prisma.wallet.findUniqueOrThrow({
        where: { userId: fx.buyerId },
        select: { availableUsd: true },
      })
    ).availableUsd,
  );

describe("digitally-paid COD is refunded on every reversal path", () => {
  it("buyer cancel returns the money to the wallet", async () => {
    const { orderId, subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "CONFIRMED",
    });
    as(fx.buyerId);
    expect(await payCodWithWallet(orderId)).toEqual({ ok: true });
    expect(await walletBalance()).toBe(50);

    expect(await cancelOrder(orderId)).toEqual({ ok: true });
    expect(await walletBalance()).toBe(150);
    const sub = await prisma.subOrder.findUniqueOrThrow({
      where: { id: subOrderId },
      select: { status: true },
    });
    expect(sub.status).toBe("CANCELLED");
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { orderId },
      select: { status: true },
    });
    expect(payment.status).toBe("REFUNDED");
  });

  it("seller cancel refunds instead of silently keeping the money", async () => {
    const { orderId, subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "CONFIRMED",
    });
    as(fx.buyerId);
    expect(await payCodWithWallet(orderId)).toEqual({ ok: true });
    expect(await walletBalance()).toBe(50);

    as(fx.sellerUserId);
    expect(await cancelSubOrder(subOrderId, "out of stock")).toEqual({
      ok: true,
    });
    expect(await walletBalance()).toBe(150);
    const sub = await prisma.subOrder.findUniqueOrThrow({
      where: { id: subOrderId },
      select: { status: true },
    });
    expect(sub.status).toBe("REFUNDED");
    const refund = await prisma.refund.findFirst({ where: { subOrderId } });
    expect(Number(refund?.amountUsd)).toBe(100);
  });

  it("a failed-delivery return refunds — the buyer WAS charged", async () => {
    const { orderId, subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "SHIPPED",
    });
    as(fx.buyerId);
    expect(await payCodWithWallet(orderId)).toEqual({ ok: true });
    expect(await walletBalance()).toBe(50);

    await settleReturnedSubOrder(subOrderId);
    expect(await walletBalance()).toBe(150);
    const sub = await prisma.subOrder.findUniqueOrThrow({
      where: { id: subOrderId },
      select: { status: true },
    });
    expect(sub.status).toBe("REFUNDED");
  });
});

describe("multi-seller COD collects cash per sub-order", () => {
  it("payment confirms only after the LAST sub-order delivers", async () => {
    const d1 = await makeCourier("m1");
    const d2 = await makeCourier("m2");
    const order = await prisma.order.create({
      data: {
        buyer: { connect: { id: fx.buyerId } },
        address: { connect: { id: fx.addressId } },
        status: "SHIPPED",
        paymentMethod: "COD",
        itemsTotal: 200,
        shippingTotal: 0,
        discountTotal: 0,
        grandTotal: 200,
        displayCurrency: "USD",
        exchangeRate: 1,
        displayTotal: 200,
        subOrders: {
          create: [fx.storeId, store2Id].map((storeId) => ({
            store: { connect: { id: storeId } },
            status: "SHIPPED",
            itemsTotal: 100,
            shippingTotal: 0,
            discountTotal: 0,
            commissionRate: 0.1,
            commissionAmt: 0,
            sellerNet: 0,
          })),
        },
        payment: {
          create: { method: "COD", status: "PENDING", amountUsd: 200 },
        },
      },
      include: { subOrders: true },
    });
    const [sub1, sub2] = order.subOrders;
    for (const [subId, driverId] of [
      [sub1.id, d1],
      [sub2.id, d2],
    ] as const) {
      await prisma.shipment.create({
        data: {
          subOrderId: subId,
          status: "OUT_FOR_DELIVERY",
          platformManaged: true,
          shippedAt: new Date(),
          driverId,
        },
      });
    }

    // First delivery: driver 1 collects THIS sub-order's $100, and the
    // order-level payment must stay unconfirmed — driver 2 still has cash to
    // collect.
    expect(
      await markSubOrderDelivered(sub1.id, "courier", "en", { courierId: d1 }),
    ).toEqual({ ok: true });
    expect((await courierCashSummary(d1)).cashOnHand).toBe(100);
    let payment = await prisma.payment.findUniqueOrThrow({
      where: { orderId: order.id },
      select: { status: true, confirmedBy: true },
    });
    expect(payment.status).toBe("PENDING");

    // Second delivery: driver 2 collects their $100 too, then the payment
    // confirms as a cash capture.
    expect(
      await markSubOrderDelivered(sub2.id, "courier", "en", { courierId: d2 }),
    ).toEqual({ ok: true });
    expect((await courierCashSummary(d2)).cashOnHand).toBe(100);
    payment = await prisma.payment.findUniqueOrThrow({
      where: { orderId: order.id },
      select: { status: true, confirmedBy: true },
    });
    expect(payment.status).toBe("CONFIRMED");
    expect(payment.confirmedBy).toBe(COD_DELIVERY_CONFIRMED_BY);
  });
});

describe("confirmReceived routes still-SHIPPED parcels through delivery", () => {
  it("captures COD, credits the courier, then completes", async () => {
    const driver = await makeCourier("cr");
    const { orderId, subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "SHIPPED",
    });
    const shipment = await prisma.shipment.create({
      data: {
        subOrderId,
        status: "OUT_FOR_DELIVERY",
        platformManaged: true,
        shippedAt: new Date(),
        driverId: driver,
      },
      select: { id: true },
    });

    as(fx.buyerId);
    expect(await confirmReceived(orderId)).toEqual({ ok: true });

    const sub = await prisma.subOrder.findUniqueOrThrow({
      where: { id: subOrderId },
      select: { status: true },
    });
    expect(sub.status).toBe("COMPLETED");
    const ship = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipment.id },
      select: { status: true },
    });
    expect(ship.status).toBe("DELIVERED");
    // The COD cash was captured and lands on the delivering courier's ledger.
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { orderId },
      select: { status: true, confirmedBy: true },
    });
    expect(payment.status).toBe("CONFIRMED");
    expect(payment.confirmedBy).toBe(COD_DELIVERY_CONFIRMED_BY);
    expect((await courierCashSummary(driver)).cashOnHand).toBe(100);
    // Hezalli Express collected the cash, so the platform holds it and the
    // seller is credited a SALE like a prepaid order.
    const entries = await prisma.ledgerEntry.findMany({
      where: { subOrderId },
      select: { type: true, amountUsd: true },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("SALE");
    expect(Number(entries[0].amountUsd)).toBe(90);

    // Nothing left to confirm.
    expect(await confirmReceived(orderId)).toEqual({ error: "badState" });
  });
});

describe("settlement of cash COD collected by Hezalli Express", () => {
  it("credits the seller a SALE — the platform holds the cash", async () => {
    const driver = await makeCourier("st");
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "DELIVERED",
    });
    // The delivery recorded the driver's cash accountability.
    await prisma.courierLedgerEntry.create({
      data: {
        courierId: driver,
        type: "COD_COLLECTED",
        amountUsd: 100,
        subOrderId,
      },
    });

    await settleSubOrder(subOrderId);
    const entries = await prisma.ledgerEntry.findMany({
      where: { subOrderId },
      select: { type: true, amountUsd: true },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("SALE");
    expect(Number(entries[0].amountUsd)).toBe(90); // 100 − 10% commission
  });
});

describe("settlement of digitally-paid COD", () => {
  it("credits the seller a SALE like a prepaid order", async () => {
    const { orderId, subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "DELIVERED",
    });
    await prisma.payment.update({
      where: { orderId },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        confirmedBy: COD_WALLET_CONFIRMED_BY,
      },
    });

    await settleSubOrder(subOrderId);
    const entries = await prisma.ledgerEntry.findMany({
      where: { subOrderId },
      select: { type: true, amountUsd: true },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("SALE");
    expect(Number(entries[0].amountUsd)).toBe(90); // 100 − 10% commission
  });
});
