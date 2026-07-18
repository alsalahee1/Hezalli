"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { localizedName } from "@/lib/categories";
import { getCommissionRate } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { standardShipping } from "@/lib/shipping";

export type PaymentMethodChoice = "COD" | "BANK_TRANSFER" | "USDT" | "WALLET";
export type PlaceOrderInput = {
  addressId: string;
  items: { variantId: string; quantity: number }[];
  paymentMethod: PaymentMethodChoice;
};
export type PlaceOrderResult = { orderId?: string; error?: string };

class StockError extends Error {}

export async function placeOrder(
  input: PlaceOrderInput,
): Promise<PlaceOrderResult> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };
  const userId = session.user.id;

  const items = input.items.filter((i) => i.quantity > 0);
  if (items.length === 0) return { error: "emptyOrder" };

  // Prepaid methods (bank / USDT / wallet) start unpaid: the order waits at
  // PENDING until the buyer submits proof and an admin confirms it. COD is
  // confirmed immediately (cash collected on delivery).
  const prepaid = input.paymentMethod !== "COD";

  const address = await prisma.address.findFirst({
    where: { id: input.addressId, userId },
    select: { id: true },
  });
  if (!address) return { error: "addressRequired" };

  const variantIds = [...new Set(items.map((i) => i.variantId))];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true,
      sku: true,
      price: true,
      stock: true,
      isActive: true,
      product: {
        select: { id: true, storeId: true, status: true, title: true },
      },
    },
  });
  const vById = new Map(variants.map((v) => [v.id, v]));

  // Re-validate availability + build per-seller groups with price snapshots.
  type Line = {
    variantId: string;
    sku: string;
    title: string;
    price: number;
    qty: number;
  };
  const byStore = new Map<string, Line[]>();
  for (const it of items) {
    const v = vById.get(it.variantId);
    if (!v || !v.isActive || v.product.status !== "ACTIVE") {
      return { error: "unavailable" };
    }
    if (v.stock < it.quantity) return { error: "outOfStock" };
    const line: Line = {
      variantId: v.id,
      sku: v.sku,
      title: localizedName(v.product.title, locale),
      price: Number(v.price),
      qty: it.quantity,
    };
    const arr = byStore.get(v.product.storeId) ?? [];
    arr.push(line);
    byStore.set(v.product.storeId, arr);
  }

  const groups = [...byStore.entries()].map(([storeId, lines]) => {
    const itemsTotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
    return {
      storeId,
      lines,
      itemsTotal,
      shipping: standardShipping(itemsTotal),
    };
  });
  const itemsTotal = groups.reduce((s, g) => s + g.itemsTotal, 0);
  const shippingTotal = groups.reduce((s, g) => s + g.shipping, 0);
  const grandTotal = Number((itemsTotal + shippingTotal).toFixed(2));
  const commissionRate = await getCommissionRate();

  // Seller users (for notifications), by store.
  const stores = await prisma.store.findMany({
    where: { id: { in: groups.map((g) => g.storeId) } },
    select: {
      id: true,
      seller: { select: { user: { select: { id: true, locale: true } } } },
    },
  });
  const sellerByStore = new Map(stores.map((s) => [s.id, s.seller.user]));

  try {
    const orderId = await prisma.$transaction(async (tx) => {
      // Atomic stock decrement — guards against overselling.
      for (const it of items) {
        const upd = await tx.productVariant.updateMany({
          where: { id: it.variantId, stock: { gte: it.quantity } },
          data: { stock: { decrement: it.quantity } },
        });
        if (upd.count !== 1) throw new StockError(it.variantId);
      }

      const orderStatus = prepaid ? "PENDING" : "CONFIRMED";
      const order = await tx.order.create({
        data: {
          buyer: { connect: { id: userId } },
          address: { connect: { id: input.addressId } },
          status: orderStatus,
          paymentMethod: input.paymentMethod,
          itemsTotal,
          shippingTotal,
          grandTotal,
          displayCurrency: "USD",
          exchangeRate: 1,
          displayTotal: grandTotal,
          subOrders: {
            create: groups.map((g) => ({
              store: { connect: { id: g.storeId } },
              status: orderStatus,
              itemsTotal: g.itemsTotal,
              shippingTotal: g.shipping,
              commissionRate,
              commissionAmt: 0,
              sellerNet: 0,
              items: {
                create: g.lines.map((l) => ({
                  variantId: l.variantId,
                  titleSnapshot: l.title,
                  skuSnapshot: l.sku,
                  unitPrice: l.price,
                  quantity: l.qty,
                  lineTotal: Number((l.price * l.qty).toFixed(2)),
                })),
              },
            })),
          },
          payment: {
            create: {
              method: input.paymentMethod,
              status: "PENDING",
              amountUsd: grandTotal,
            },
          },
          history: {
            create: [
              {
                status: orderStatus,
                actor: "buyer",
                note: prepaid
                  ? "Order placed (awaiting payment)"
                  : "Order placed (COD)",
              },
            ],
          },
        },
        select: { id: true },
      });

      // COD orders notify sellers immediately; prepaid orders notify sellers
      // only once payment is confirmed (see confirmPayment).
      if (!prepaid) {
        for (const g of groups) {
          const seller = sellerByStore.get(g.storeId);
          if (!seller) continue;
          const ar = seller.locale === "ar";
          await tx.notification.create({
            data: {
              userId: seller.id,
              type: "ORDER",
              title: ar ? "طلب جديد" : "New order",
              body: ar
                ? `لديك طلب جديد بقيمة ${g.itemsTotal.toFixed(2)}$.`
                : `You have a new order worth $${g.itemsTotal.toFixed(2)}.`,
              data: { orderId: order.id },
            },
          });
        }
      }
      await tx.notification.create({
        data: {
          userId,
          type: prepaid ? "PAYMENT" : "ORDER",
          title:
            locale === "ar"
              ? prepaid
                ? "طلبك بانتظار الدفع"
                : "تم استلام طلبك"
              : prepaid
                ? "Complete your payment"
                : "Order placed",
          body:
            locale === "ar"
              ? prepaid
                ? `أكمل دفع ${grandTotal.toFixed(2)}$ وأرسل إثبات الدفع.`
                : `تم تأكيد طلبك بقيمة ${grandTotal.toFixed(2)}$ (الدفع عند الاستلام).`
              : prepaid
                ? `Complete your $${grandTotal.toFixed(2)} payment and submit proof.`
                : `Your order for $${grandTotal.toFixed(2)} is confirmed (cash on delivery).`,
          data: { orderId: order.id },
        },
      });

      // Clear the purchased items from the cart.
      await tx.cartItem.deleteMany({
        where: { cart: { userId }, variantId: { in: variantIds } },
      });

      return order.id;
    });

    revalidatePath(`/${locale}/account/orders`);
    revalidatePath(`/${locale}/seller/orders`);
    return { orderId };
  } catch (e) {
    if (e instanceof StockError) return { error: "outOfStock" };
    throw e;
  }
}

// Statuses at or past which a buyer can no longer cancel.
const UNCANCELLABLE = new Set([
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
]);

export async function cancelOrder(
  orderId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) return { error: "unauthorized" };

  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId: session.user.id },
    select: {
      id: true,
      status: true,
      subOrders: {
        select: {
          id: true,
          store: {
            select: {
              seller: {
                select: { user: { select: { id: true, locale: true } } },
              },
            },
          },
          items: { select: { variantId: true, quantity: true } },
        },
      },
    },
  });
  if (!order) return { error: "notFound" };
  if (UNCANCELLABLE.has(order.status)) return { error: "tooLate" };

  await prisma.$transaction(async (tx) => {
    // Restore stock for every line.
    for (const sub of order.subOrders) {
      for (const it of sub.items) {
        await tx.productVariant.updateMany({
          where: { id: it.variantId },
          data: { stock: { increment: it.quantity } },
        });
      }
    }
    await tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });
    await tx.subOrder.updateMany({
      where: { orderId: order.id },
      data: { status: "CANCELLED" },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        status: "CANCELLED",
        actor: "buyer",
        note: "Cancelled by buyer",
      },
    });
    for (const sub of order.subOrders) {
      const seller = sub.store.seller.user;
      const ar = seller.locale === "ar";
      await tx.notification.create({
        data: {
          userId: seller.id,
          type: "ORDER",
          title: ar ? "أُلغي طلب" : "Order cancelled",
          body: ar
            ? "ألغى المشتري طلباً كان موجهاً لمتجرك."
            : "A buyer cancelled an order for your store.",
          data: { orderId: order.id },
        },
      });
    }
  });

  revalidatePath(`/${locale}/account/orders`);
  revalidatePath(`/${locale}/account/orders/${orderId}`);
  revalidatePath(`/${locale}/seller/orders`);
  return { ok: true };
}
