// The full buyer journey, end to end, through the REAL server actions —
// checkout to receipt on the flagship path (COD + Hezalli Express, direct):
//
//   placeOrder → seller accepts → seller ships → dispatch assigns a driver →
//   picked up → out for delivery → delivered against the buyer's QR code →
//   buyer confirms receipt → seller settled.
//
// Each step asserts the exact state the next step depends on (statuses,
// stock, payment capture, ledgers, notifications), so a regression anywhere
// along the route fails loudly at the step that broke.
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
import { assignCourier, courierAdvance } from "@/lib/actions/courier";
import { placeOrder } from "@/lib/actions/order";
import { acceptSubOrder } from "@/lib/actions/seller-order";
import { shipSubOrder } from "@/lib/actions/shipment";
import { courierCashSummary } from "@/lib/courier-ledger";
import { round2 } from "@/lib/finance";
import { COD_DELIVERY_CONFIRMED_BY } from "@/lib/payment-state";
import { prisma } from "@/lib/prisma";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

let fx: Awaited<ReturnType<typeof makeFixture>>;
let carrierId: string;
let driverId: string;
let dispatcherId: string;
const extraUserIds: string[] = [];

beforeAll(async () => {
  fx = await makeFixture({ price: 100, stock: 5, commissionRate: 0.1 });
  const uniq = Math.random().toString(36).slice(2);
  const carrier = await prisma.carrier.create({
    data: { name: `Hezalli Express J-${uniq}`, platformManaged: true },
  });
  carrierId = carrier.id;
  const driver = await prisma.user.create({
    data: { email: `oj-driver-${uniq}@t.local`, roles: ["COURIER"] },
  });
  driverId = driver.id;
  const dispatcher = await prisma.user.create({
    data: { email: `oj-dm-${uniq}@t.local`, roles: ["DELIVERY_MANAGER"] },
  });
  dispatcherId = dispatcher.id;
  extraUserIds.push(driver.id, dispatcher.id);
});

afterAll(async () => {
  await prisma.courierLedgerEntry
    .deleteMany({ where: { courierId: driverId } })
    .catch(() => {});
  await prisma.notification
    .deleteMany({ where: { userId: { in: extraUserIds } } })
    .catch(() => {});
  await fx.cleanup();
  await prisma.user
    .deleteMany({ where: { id: { in: extraUserIds } } })
    .catch(() => {});
  await prisma.carrier.delete({ where: { id: carrierId } }).catch(() => {});
});

describe("full order journey: checkout → delivery → receipt (COD Express)", () => {
  it("walks every step of the route with correct state at each stop", async () => {
    // ── 1. Buyer places a COD order (2 units) ────────────────────────────
    as(fx.buyerId);
    const placed = await placeOrder({
      addressId: fx.addressId,
      items: [{ variantId: fx.variantId, quantity: 2 }],
      paymentMethod: "COD",
    });
    expect(placed.error).toBeUndefined();
    const orderId = placed.orderId!;

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        status: true,
        grandTotal: true,
        payment: { select: { status: true } },
        subOrders: {
          select: {
            id: true,
            status: true,
            itemsTotal: true,
            shippingTotal: true,
            discountTotal: true,
          },
        },
      },
    });
    // COD skips straight to CONFIRMED; payment waits for delivery capture.
    expect(order.status).toBe("CONFIRMED");
    expect(order.subOrders).toHaveLength(1);
    expect(order.subOrders[0].status).toBe("CONFIRMED");
    expect(Number(order.subOrders[0].itemsTotal)).toBe(200);
    expect(order.payment?.status).toBe("PENDING");
    const subId = order.subOrders[0].id;
    const codDue = round2(
      Number(order.subOrders[0].itemsTotal) +
        Number(order.subOrders[0].shippingTotal) -
        Number(order.subOrders[0].discountTotal),
    );

    // Stock decremented atomically (5 − 2).
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: fx.variantId },
      select: { stock: true },
    });
    expect(variant.stock).toBe(3);

    // Seller was told about the new order.
    expect(
      await prisma.notification.findFirst({
        where: { userId: fx.sellerUserId, data: { path: ["orderId"], equals: orderId } },
      }),
    ).toBeTruthy();

    // ── 2. Seller accepts (CONFIRMED → PROCESSING) ───────────────────────
    as(fx.sellerUserId);
    expect(await acceptSubOrder(subId)).toEqual({ ok: true });
    expect(
      (
        await prisma.subOrder.findUniqueOrThrow({
          where: { id: subId },
          select: { status: true },
        })
      ).status,
    ).toBe("PROCESSING");

    // ── 3. Seller ships via Hezalli Express — no tracking number typed:
    //      the platform mints the waybill itself. ─────────────────────────
    expect(
      await shipSubOrder(subId, { carrierId, trackingNumber: "" }),
    ).toEqual({ ok: true });
    const shipped = await prisma.shipment.findUniqueOrThrow({
      where: { subOrderId: subId },
      select: {
        id: true,
        status: true,
        trackingNumber: true,
        deliveryCode: true,
        shippedAt: true,
      },
    });
    expect(shipped.status).toBe("IN_TRANSIT");
    expect(shipped.trackingNumber).toMatch(/^HZE\d{10}$/); // minted waybill
    expect(shipped.deliveryCode).toBeTruthy(); // buyer's proof-of-delivery QR
    expect(shipped.shippedAt).toBeTruthy();
    expect(
      (
        await prisma.subOrder.findUniqueOrThrow({
          where: { id: subId },
          select: { status: true },
        })
      ).status,
    ).toBe("SHIPPED");

    // ── 4. Dispatch assigns the driver ───────────────────────────────────
    as(dispatcherId);
    expect(await assignCourier(shipped.id, driverId)).toEqual({ ok: true });
    expect(
      (
        await prisma.shipment.findUniqueOrThrow({
          where: { id: shipped.id },
          select: { driverId: true },
        })
      ).driverId,
    ).toBe(driverId);

    // ── 5–6. Driver: picked up → out for delivery ────────────────────────
    as(driverId);
    expect(await courierAdvance(shipped.id, "PICKED_UP")).toEqual({
      ok: true,
    });
    expect(await courierAdvance(shipped.id, "OUT_FOR_DELIVERY")).toEqual({
      ok: true,
    });
    expect(
      (
        await prisma.shipment.findUniqueOrThrow({
          where: { id: shipped.id },
          select: { status: true },
        })
      ).status,
    ).toBe("OUT_FOR_DELIVERY");

    // ── 7. Wrong delivery code is refused ────────────────────────────────
    expect(
      await courierAdvance(shipped.id, "DELIVERED", {
        deliveryCode: "WRONGCODE",
      }),
    ).toEqual({ error: "badCode" });

    // ── 8. Delivered against the buyer's QR code ─────────────────────────
    expect(
      await courierAdvance(shipped.id, "DELIVERED", {
        deliveryCode: shipped.deliveryCode!,
        recipientName: "Test Buyer",
      }),
    ).toEqual({ ok: true });

    const delivered = await prisma.subOrder.findUniqueOrThrow({
      where: { id: subId },
      select: { status: true, autoCompleteAt: true },
    });
    expect(delivered.status).toBe("DELIVERED");
    expect(delivered.autoCompleteAt!.getTime()).toBeGreaterThan(Date.now());
    const attempt = await prisma.deliveryAttempt.findFirstOrThrow({
      where: { shipmentId: shipped.id, outcome: "DELIVERED" },
      select: { codeVerified: true, courierId: true, recipientName: true },
    });
    expect(attempt.codeVerified).toBe(true);
    expect(attempt.courierId).toBe(driverId);
    // COD captured as a cash collection, onto the driver's ledger.
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { orderId },
      select: { status: true, confirmedBy: true },
    });
    expect(payment.status).toBe("CONFIRMED");
    expect(payment.confirmedBy).toBe(COD_DELIVERY_CONFIRMED_BY);
    const cash = await courierCashSummary(driverId);
    expect(cash.cashOnHand).toBe(codDue);
    expect(cash.earnings).toBeGreaterThan(0); // delivery fee earned

    // ── 9. Buyer confirms receipt → completed + seller settled ───────────
    as(fx.buyerId);
    expect(await confirmReceived(orderId)).toEqual({ ok: true });
    expect(
      (
        await prisma.order.findUniqueOrThrow({
          where: { id: orderId },
          select: { status: true },
        })
      ).status,
    ).toBe("COMPLETED");
    // Express collected the cash → seller credited a SALE of sellerNet.
    const sale = await prisma.ledgerEntry.findFirstOrThrow({
      where: { subOrderId: subId, type: "SALE" },
      select: { amountUsd: true },
    });
    const sellerNet = round2(
      Number(order.subOrders[0].itemsTotal) * 0.9 +
        Number(order.subOrders[0].shippingTotal),
    );
    expect(Number(sale.amountUsd)).toBe(sellerNet);
    const balance = await prisma.sellerBalance.findUniqueOrThrow({
      where: { id: fx.balanceId },
      select: { availableUsd: true },
    });
    expect(Number(balance.availableUsd)).toBe(sellerNet);

    // Confirming again has nothing left to do.
    expect(await confirmReceived(orderId)).toEqual({ error: "badState" });
  });
});
