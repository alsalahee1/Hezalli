// Shared refund core used by both the admin refund action and the returns
// flow. Records a Refund, reverses any seller ledger credit proportionally, and
// — for a full refund — marks the sub-order REFUNDED. Manual methods: the money
// itself is returned outside the system. Not auth-gated; callers must authorize.
import {
  commissionOf,
  getBalanceId,
  recomputeBalance,
  round2,
  sellerNetOf,
} from "@/lib/finance";
import { aggregateOrderStatus } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";

export type ApplyRefundResult = {
  ok?: boolean;
  error?: string;
  refundId?: string;
  amount?: number;
};

export async function applyRefund(
  subOrderId: string,
  opts: {
    reason: string;
    amountUsd?: number;
    actor: string;
    processedBy?: string | null;
  },
): Promise<ApplyRefundResult> {
  const sub = await prisma.subOrder.findUnique({
    where: { id: subOrderId },
    select: {
      id: true,
      status: true,
      orderId: true,
      itemsTotal: true,
      shippingTotal: true,
      commissionRate: true,
      store: { select: { sellerId: true } },
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
    opts.amountUsd && opts.amountUsd > 0 && opts.amountUsd <= subTotal
      ? round2(opts.amountUsd)
      : subTotal;
  const ratio = subTotal > 0 ? amount / subTotal : 1;
  const isFull = ratio >= 1;

  const settled = await prisma.ledgerEntry.findFirst({
    where: { subOrderId, type: { in: ["SALE", "COD_COMMISSION_DUE"] } },
    select: { id: true },
  });
  const balanceId = await getBalanceId(sub.store.sellerId);

  let refundId = "";
  await prisma.$transaction(async (tx) => {
    const refund = await tx.refund.create({
      data: {
        subOrderId,
        paymentId: sub.order.payment?.id ?? null,
        amountUsd: amount,
        reason: opts.reason,
        processedBy: opts.processedBy ?? null,
        processedAt: new Date(),
      },
      select: { id: true },
    });
    refundId = refund.id;

    if (settled) {
      const commission = commissionOf(itemsTotal, Number(sub.commissionRate));
      const sellerNet = sellerNetOf(
        itemsTotal,
        shipping,
        Number(sub.commissionRate),
      );
      if (sub.order.paymentMethod === "COD") {
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
        actor: opts.actor,
        note: `Refund $${amount.toFixed(2)} — ${opts.reason}`,
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
  return { ok: true, refundId, amount };
}
