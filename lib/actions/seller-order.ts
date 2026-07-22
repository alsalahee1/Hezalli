"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { releaseFlashClaims } from "@/lib/flash";
import { aggregateOrderStatus } from "@/lib/order-status";
import { paymentCapturedInSystem } from "@/lib/payment-state";
import { prisma } from "@/lib/prisma";
import { applyRefund } from "@/lib/refunds";

type Result = { ok?: boolean; error?: string };
type SubTarget = "PROCESSING" | "SHIPPED" | "CANCELLED";
type OrderStatusValue =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED";

function statusWord(to: SubTarget, ar: boolean): string {
  if (to === "PROCESSING") return ar ? "قيد التجهيز" : "being prepared";
  if (to === "SHIPPED") return ar ? "تم شحنه" : "shipped";
  return ar ? "ملغى" : "cancelled";
}

async function transition(
  subOrderId: string,
  allowedFrom: string[],
  to: SubTarget,
  opts: { restoreStock?: boolean; reason?: string } = {},
): Promise<Result> {
  const gate = await requireSellerStore();
  if (!gate) return { error: "forbidden" };
  const locale = await getLocale();

  const sub = await prisma.subOrder.findFirst({
    where: { id: subOrderId, storeId: gate.storeId },
    select: {
      id: true,
      orderId: true,
      status: true,
      store: { select: { name: true } },
      items: {
        select: { variantId: true, quantity: true, flashItemId: true },
      },
      order: { select: { buyerId: true, buyer: { select: { locale: true } } } },
    },
  });
  if (!sub) return { error: "notFound" };
  if (!allowedFrom.includes(sub.status)) return { error: "badState" };

  await prisma.$transaction(async (tx) => {
    await tx.subOrder.update({ where: { id: sub.id }, data: { status: to } });

    if (opts.restoreStock) {
      for (const it of sub.items) {
        await tx.productVariant.updateMany({
          where: { id: it.variantId },
          data: { stock: { increment: it.quantity } },
        });
      }
      await releaseFlashClaims(tx, sub.items);
    }

    const subs = await tx.subOrder.findMany({
      where: { orderId: sub.orderId },
      select: { status: true },
    });
    const orderStatus = aggregateOrderStatus(
      subs.map((s) => s.status),
    ) as OrderStatusValue;
    await tx.order.update({
      where: { id: sub.orderId },
      data: { status: orderStatus },
    });

    await tx.orderStatusHistory.create({
      data: {
        orderId: sub.orderId,
        status: to,
        actor: "seller",
        note: opts.reason
          ? `${sub.store.name}: ${to} — ${opts.reason}`
          : `${sub.store.name}: ${to}`,
      },
    });

    const ar = sub.order.buyer.locale === "ar";
    await tx.notification.create({
      data: {
        userId: sub.order.buyerId,
        type: "ORDER",
        title: ar ? "تحديث الطلب" : "Order update",
        body: ar
          ? `طلبك من ${sub.store.name} ${statusWord(to, true)}.`
          : `Your order from ${sub.store.name} is ${statusWord(to, false)}.`,
        data: { orderId: sub.orderId },
      },
    });
  });

  revalidatePath(`/${locale}/seller/orders`);
  revalidatePath(`/${locale}/seller/orders/${subOrderId}`);
  revalidatePath(`/${locale}/account/orders`);
  return { ok: true };
}

export async function acceptSubOrder(subOrderId: string): Promise<Result> {
  return transition(subOrderId, ["CONFIRMED"], "PROCESSING");
}

export async function cancelSubOrder(
  subOrderId: string,
  reason: string,
): Promise<Result> {
  const r = (reason ?? "").trim();
  if (r.length < 3) return { error: "reasonRequired" };

  const gate = await requireSellerStore();
  if (!gate) return { error: "forbidden" };
  // A suspended/closed store keeps read access but can't move money: cancelling
  // issues a buyer refund. Ops handle a suspended store's in-flight orders.
  if (!gate.active) return { error: "storeSuspended" };
  const locale = await getLocale();

  const sub = await prisma.subOrder.findFirst({
    where: { id: subOrderId, storeId: gate.storeId },
    select: {
      id: true,
      status: true,
      items: {
        select: { variantId: true, quantity: true, flashItemId: true },
      },
      order: {
        select: {
          paymentMethod: true,
          payment: { select: { status: true, confirmedBy: true } },
        },
      },
    },
  });
  if (!sub) return { error: "notFound" };
  if (sub.status !== "CONFIRMED" && sub.status !== "PROCESSING") {
    return { error: "badState" };
  }

  // Has the buyer's money been taken in-system? Prepaid orders whose payment is
  // CONFIRMED (wallet at placement, bank/USDT after admin confirmation) — and
  // COD orders the buyer settled digitally from their wallet (docs §39) — MUST
  // be refunded when the seller cancels, otherwise the buyer silently loses the
  // money and the amount is stranded off the ledger. Cash-basis COD and
  // not-yet-paid orders have nothing to return, so a plain cancel is correct.
  const paid = paymentCapturedInSystem(sub.order);

  if (!paid) {
    return transition(subOrderId, ["CONFIRMED", "PROCESSING"], "CANCELLED", {
      restoreStock: true,
      reason: r,
    });
  }

  // Refund the buyer to their HezalliPay wallet and mark the sub-order REFUNDED.
  // applyRefund records the Refund, reverses any seller ledger credit (a no-op
  // here — a CONFIRMED/PROCESSING sub-order is not yet settled), updates the order
  // status, restores redeemed loyalty points, and notifies the buyer. Money moves
  // first so a failure can never leave the buyer un-refunded; stock is restored
  // afterwards.
  const res = await applyRefund(subOrderId, {
    reason: `Seller cancelled: ${r}`,
    actor: "seller",
    toWallet: true,
  });
  if (!res.ok) return { error: res.error ?? "refundFailed" };

  await prisma.$transaction(async (tx) => {
    for (const it of sub.items) {
      await tx.productVariant.updateMany({
        where: { id: it.variantId },
        data: { stock: { increment: it.quantity } },
      });
    }
    await releaseFlashClaims(tx, sub.items);
  });

  revalidatePath(`/${locale}/seller/orders`);
  revalidatePath(`/${locale}/seller/orders/${subOrderId}`);
  revalidatePath(`/${locale}/account/orders`);
  return { ok: true };
}
