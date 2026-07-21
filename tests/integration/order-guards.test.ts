// Order-cancel state-machine + coupon per-user-limit guards (audit §3.5b/d, §3.14).
import { describe, expect, it, vi } from "vitest";

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

import { cancelOrder, placeOrder } from "@/lib/actions/order";
import { prisma } from "@/lib/prisma";
import { getWalletView } from "@/lib/wallet";
import { makeFixture } from "./factory";

const as = (id: string | null) =>
  authMock.mockResolvedValue(id ? { user: { id } } : null);

describe("cancelOrder — mixed-status order (partial cancel)", () => {
  it("cancels only the still-active sub-order, keeps the shipped one, refunds just that portion", async () => {
    const fx = await makeFixture({ price: 100, commissionRate: 0.1 });
    try {
      // A wallet-paid order with two sub-orders: one already SHIPPED, one CONFIRMED.
      const order = await prisma.order.create({
        data: {
          buyer: { connect: { id: fx.buyerId } },
          address: { connect: { id: fx.addressId } },
          status: "CONFIRMED",
          paymentMethod: "HEZALLI_BALANCE",
          itemsTotal: 200,
          shippingTotal: 0,
          grandTotal: 200,
          displayCurrency: "USD",
          exchangeRate: 1,
          displayTotal: 200,
          subOrders: {
            create: [
              {
                store: { connect: { id: fx.storeId } },
                status: "SHIPPED",
                itemsTotal: 100,
                shippingTotal: 0,
                commissionRate: 0.1,
                items: {
                  create: [
                    {
                      variantId: fx.variantId,
                      titleSnapshot: "P",
                      skuSnapshot: fx.variantSku,
                      unitPrice: 100,
                      quantity: 1,
                      lineTotal: 100,
                    },
                  ],
                },
              },
              {
                store: { connect: { id: fx.storeId } },
                status: "CONFIRMED",
                itemsTotal: 100,
                shippingTotal: 0,
                commissionRate: 0.1,
                items: {
                  create: [
                    {
                      variantId: fx.variantId,
                      titleSnapshot: "P",
                      skuSnapshot: fx.variantSku,
                      unitPrice: 100,
                      quantity: 1,
                      lineTotal: 100,
                    },
                  ],
                },
              },
            ],
          },
          payment: {
            create: {
              method: "HEZALLI_BALANCE",
              status: "CONFIRMED",
              amountUsd: 200,
              confirmedAt: new Date(),
            },
          },
        },
        include: { subOrders: { orderBy: { status: "asc" } }, payment: true },
      });
      const shipped = order.subOrders.find((s) => s.status === "SHIPPED")!;
      const confirmed = order.subOrders.find((s) => s.status === "CONFIRMED")!;
      const stockBefore = (await prisma.productVariant.findUnique({
        where: { id: fx.variantId },
        select: { stock: true },
      }))!.stock;

      as(fx.buyerId);
      const res = await cancelOrder(order.id);
      expect(res.ok).toBe(true);

      // The shipped sub-order is untouched; the confirmed one is cancelled.
      expect(
        (await prisma.subOrder.findUnique({ where: { id: shipped.id } }))
          ?.status,
      ).toBe("SHIPPED");
      expect(
        (await prisma.subOrder.findUnique({ where: { id: confirmed.id } }))
          ?.status,
      ).toBe("CANCELLED");

      // Order stays at the aggregate of the still-standing sub-order (SHIPPED),
      // and the payment is NOT marked refunded (order not fully terminal).
      const after = await prisma.order.findUnique({
        where: { id: order.id },
        select: { status: true, payment: { select: { status: true } } },
      });
      expect(after?.status).toBe("SHIPPED");
      expect(after?.payment?.status).toBe("CONFIRMED");

      // Only the cancelled portion ($100) is refunded, and only its stock (1) returns.
      expect((await getWalletView(fx.buyerId)).balance).toBe(100);
      const stockAfter = (await prisma.productVariant.findUnique({
        where: { id: fx.variantId },
        select: { stock: true },
      }))!.stock;
      expect(stockAfter).toBe(stockBefore + 1);
    } finally {
      await prisma.walletEntry
        .deleteMany({ where: { wallet: { userId: fx.buyerId } } })
        .catch(() => {});
      await prisma.wallet
        .deleteMany({ where: { userId: fx.buyerId } })
        .catch(() => {});
      await fx.cleanup();
    }
  });
});

describe("coupon perUserLimit — concurrent checkouts redeem once", () => {
  it("two parallel orders with a limit-1 coupon: only one redeems it", async () => {
    const fx = await makeFixture({
      price: 100,
      commissionRate: 0.1,
      stock: 10,
    });
    const uniq = Date.now().toString(36).toUpperCase();
    const coupon = await prisma.coupon.create({
      data: {
        code: `PUL-${uniq}`,
        scope: "PLATFORM",
        discountType: "FIXED",
        value: 5,
        perUserLimit: 1,
        usedCount: 0,
      },
    });
    try {
      await prisma.platformSetting.upsert({
        where: { key: "cod_enabled" },
        create: { key: "cod_enabled", value: true },
        update: { value: true },
      });
      as(fx.buyerId);
      const place = () =>
        placeOrder({
          addressId: fx.addressId,
          items: [{ variantId: fx.variantId, quantity: 1 }],
          paymentMethod: "COD",
          couponCode: coupon.code,
        });
      const results = await Promise.all([place(), place()]);

      // At most one order redeemed the coupon.
      const redemptions = await prisma.couponRedemption.findMany({
        where: { couponId: coupon.id, userId: fx.buyerId },
      });
      expect(redemptions).toHaveLength(1);

      const fresh = await prisma.coupon.findUnique({
        where: { id: coupon.id },
        select: { usedCount: true },
      });
      expect(fresh?.usedCount).toBe(1);

      // One placement succeeded with the coupon; the other was rejected for it.
      const ok = results.filter((r) => r.orderId);
      expect(ok.length).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma.couponRedemption
        .deleteMany({ where: { couponId: coupon.id } })
        .catch(() => {});
      await prisma.loyaltyTransaction
        .deleteMany({ where: { userId: fx.buyerId } })
        .catch(() => {});
      await fx.cleanup();
      await prisma.coupon.delete({ where: { id: coupon.id } }).catch(() => {});
      await prisma.platformSetting
        .deleteMany({ where: { key: "cod_enabled" } })
        .catch(() => {});
    }
  });
});
