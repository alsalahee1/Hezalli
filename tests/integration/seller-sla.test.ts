// Seller ship-SLA sweep (lib/seller-sla.ts): warn at deadline−1 day, then
// auto-cancel unshipped sub-orders — refund-if-paid via the shared money-path,
// restock, notify both sides. Runs against local Postgres.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { sweepSellerSla } from "@/lib/seller-sla";
import { makeFixture } from "./factory";

let fx: Awaited<ReturnType<typeof makeFixture>>;

const DAY_MS = 86_400_000;
const backdate = (subOrderId: string, days: number) =>
  prisma.subOrder.update({
    where: { id: subOrderId },
    data: { createdAt: new Date(Date.now() - days * DAY_MS) },
  });

beforeAll(async () => {
  fx = await makeFixture();
  await prisma.platformSetting.upsert({
    where: { key: "seller_ship_days" },
    create: { key: "seller_ship_days", value: 5 },
    update: { value: 5 },
  });
});

afterAll(async () => {
  await prisma.platformSetting
    .delete({ where: { key: "seller_ship_days" } })
    .catch(() => {});
  await fx.cleanup();
});

const stockNow = async () =>
  (
    await prisma.productVariant.findUniqueOrThrow({
      where: { id: fx.variantId },
      select: { stock: true },
    })
  ).stock;

describe("seller ship-SLA sweep", () => {
  it("warns the seller one day before the deadline, exactly once", async () => {
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "CONFIRMED",
    });
    await backdate(subOrderId, 4.5);

    const first = await sweepSellerSla();
    expect(first.reminded).toBeGreaterThanOrEqual(1);
    const sub = await prisma.subOrder.findUniqueOrThrow({
      where: { id: subOrderId },
      select: { sellerSlaRemindedAt: true, status: true },
    });
    expect(sub.sellerSlaRemindedAt).toBeTruthy();
    expect(sub.status).toBe("CONFIRMED"); // warned, not cancelled

    // One-shot: a second sweep must not re-remind this sub-order.
    await sweepSellerSla();
    const warnings = await prisma.notification.count({
      where: {
        userId: fx.sellerUserId,
        title: { contains: "auto-cancel" },
      },
    });
    expect(warnings).toBe(1);
  });

  it("auto-cancels an overdue COD sub-order and restores stock", async () => {
    const { subOrderId, orderId } = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "CONFIRMED",
    });
    await backdate(subOrderId, 6);
    const before = await stockNow();

    const res = await sweepSellerSla();
    expect(res.cancelled).toBeGreaterThanOrEqual(1);

    const sub = await prisma.subOrder.findUniqueOrThrow({
      where: { id: subOrderId },
      select: { status: true },
    });
    expect(sub.status).toBe("CANCELLED");
    expect(await stockNow()).toBe(before + 1);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true },
    });
    expect(order.status).toBe("CANCELLED");
    const buyerNote = await prisma.notification.findFirst({
      where: {
        userId: fx.buyerId,
        data: { path: ["orderId"], equals: orderId },
      },
    });
    expect(buyerNote).toBeTruthy();
  });

  it("refunds a paid buyer to their wallet when cancelling", async () => {
    const { subOrderId } = await fx.createSubOrder({
      paymentMethod: "HEZALLI_BALANCE",
      status: "PROCESSING",
    });
    await backdate(subOrderId, 6);
    const before = await stockNow();

    const res = await sweepSellerSla();
    expect(res.cancelled).toBeGreaterThanOrEqual(1);

    const sub = await prisma.subOrder.findUniqueOrThrow({
      where: { id: subOrderId },
      select: { status: true },
    });
    expect(sub.status).toBe("REFUNDED");
    // The money-path recorded a real refund for the full amount.
    const refund = await prisma.refund.findFirst({
      where: { subOrderId },
      select: { amountUsd: true },
    });
    expect(refund).toBeTruthy();
    expect(Number(refund!.amountUsd)).toBe(fx.price);
    expect(await stockNow()).toBe(before + 1);
  });

  it("never touches shipped parcels or fresh orders, and 0 turns it off", async () => {
    const shipped = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "SHIPPED",
    });
    await backdate(shipped.subOrderId, 10);
    const fresh = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "CONFIRMED",
    });

    await sweepSellerSla();
    expect(
      (
        await prisma.subOrder.findUniqueOrThrow({
          where: { id: shipped.subOrderId },
          select: { status: true },
        })
      ).status,
    ).toBe("SHIPPED");
    expect(
      (
        await prisma.subOrder.findUniqueOrThrow({
          where: { id: fresh.subOrderId },
          select: { status: true },
        })
      ).status,
    ).toBe("CONFIRMED");

    await prisma.platformSetting.update({
      where: { key: "seller_ship_days" },
      data: { value: 0 },
    });
    const overdue = await fx.createSubOrder({
      paymentMethod: "COD",
      status: "CONFIRMED",
    });
    await backdate(overdue.subOrderId, 30);
    expect(await sweepSellerSla()).toEqual({ reminded: 0, cancelled: 0 });
    await prisma.platformSetting.update({
      where: { key: "seller_ship_days" },
      data: { value: 5 },
    });
  });
});
