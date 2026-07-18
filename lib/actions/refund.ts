"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId } from "@/lib/authz";
import {
  commissionOf,
  getBalanceId,
  recomputeBalance,
  round2,
  sellerNetOf,
} from "@/lib/finance";
import { aggregateOrderStatus } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

// Admin refunds a sub-order (full by default, or a partial amount). Records a
// Refund, reverses any seller ledger credit, and — for a full refund — marks
// the sub-order REFUNDED. Manual methods: money is returned outside the system.
export async function refundSubOrder(
  subOrderId: string,
  reason: string,
  amountUsd?: number,
): Promise<Result> {
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const sub = await prisma.subOrder.findUnique({
    where: { id: subOrderId },
    select: {
      id: true,
      status: true,
      orderId: true,
      itemsTotal: true,
      shippingTotal: true,
      commissionRate: true,
      store: {
        select: {
          sellerId: true,
          seller: { select: { user: { select: { id: true, locale: true } } } },
        },
      },
      order: {
        select: {
          paymentMethod: true,
          buyerId: true,
          buyer: { select: { locale: true } },
          payment: { select: { id: true } },
        },
      },
    },
  });
  if (!sub) return { error: "notFound" };
  if (sub.status === "REFUNDED") return { error: "badState" };

  const itemsTotal = Number(sub.itemsTotal);
  const shipping = Number(sub.shippingTotal);
  const subTotal = round2(itemsTotal + shipping);
  const amount =
    amountUsd && amountUsd > 0 && amountUsd <= subTotal
      ? round2(amountUsd)
      : subTotal;
  const ratio = subTotal > 0 ? amount / subTotal : 1;
  const isFull = ratio >= 1;

  const settled = await prisma.ledgerEntry.findFirst({
    where: { subOrderId, type: { in: ["SALE", "COD_COMMISSION_DUE"] } },
    select: { id: true },
  });
  const balanceId = await getBalanceId(sub.store.sellerId);

  await prisma.$transaction(async (tx) => {
    await tx.refund.create({
      data: {
        subOrderId,
        paymentId: sub.order.payment?.id ?? null,
        amountUsd: amount,
        reason,
        processedBy: adminId,
        processedAt: new Date(),
      },
    });

    if (settled) {
      const commission = commissionOf(itemsTotal, Number(sub.commissionRate));
      const sellerNet = sellerNetOf(
        itemsTotal,
        shipping,
        Number(sub.commissionRate),
      );
      if (sub.order.paymentMethod === "COD") {
        // Seller owed commission; refunding the sale reverses what they owe.
        await tx.ledgerEntry.create({
          data: {
            balanceId,
            type: "REFUND",
            amountUsd: round2(commission * ratio),
            subOrderId,
            note: "COD commission reversed (refund)",
          },
        });
      } else {
        // Claw back the seller credit.
        await tx.ledgerEntry.create({
          data: {
            balanceId,
            type: "REFUND",
            amountUsd: -round2(sellerNet * ratio),
            subOrderId,
            note: "Sale reversed (refund)",
          },
        });
      }
    }

    if (isFull) {
      await tx.subOrder.update({
        where: { id: subOrderId },
        data: { status: "REFUNDED" },
      });
      const subs = await tx.subOrder.findMany({
        where: { orderId: sub.orderId },
        select: { status: true },
      });
      // All refunded/cancelled → order REFUNDED; else keep the aggregate.
      const allDone = subs.every(
        (s) => s.status === "REFUNDED" || s.status === "CANCELLED",
      );
      await tx.order.update({
        where: { id: sub.orderId },
        data: {
          status: allDone
            ? "REFUNDED"
            : (aggregateOrderStatus(subs.map((s) => s.status)) as never),
        },
      });
      if (allDone && sub.order.payment) {
        await tx.payment.update({
          where: { id: sub.order.payment.id },
          data: { status: "REFUNDED" },
        });
      }
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId: sub.orderId,
        status: "REFUNDED",
        actor: "admin",
        note: `Refund $${amount.toFixed(2)} — ${reason}`,
      },
    });

    const bAr = sub.order.buyer.locale === "ar";
    await tx.notification.create({
      data: {
        userId: sub.order.buyerId,
        type: "PAYMENT",
        title: bAr ? "تم استرداد مبلغ" : "Refund issued",
        body: bAr
          ? `تمت الموافقة على استرداد ${amount.toFixed(2)}$.`
          : `A refund of $${amount.toFixed(2)} was issued.`,
        data: { orderId: sub.orderId },
      },
    });
  });

  await recomputeBalance(sub.store.sellerId);

  revalidatePath(`/${locale}/admin/orders/${sub.orderId}`);
  revalidatePath(`/${locale}/account/orders/${sub.orderId}`);
  revalidatePath(`/${locale}/seller/finance`);
  return { ok: true };
}
