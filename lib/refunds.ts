// Shared refund core used by both the admin refund action and the returns
// flow. Records a Refund, reverses any seller ledger credit proportionally, and
// — for a full refund — marks the sub-order REFUNDED. Manual methods: the money
// itself is returned outside the system. Not auth-gated; callers must authorize.
import {
  getBalanceId,
  recomputeBalance,
  round2,
  subEconomics,
} from "@/lib/finance";
import { POINTS_PER_USD_REDEEMED } from "@/lib/loyalty";
import { aggregateOrderStatus } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";
import {
  creditWalletTx,
  getWalletId,
  recomputeWalletBalance,
} from "@/lib/wallet";

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
    // Step 19.1: credit the refunded amount to the buyer's HezalliPay wallet
    // instead of returning the money outside the system.
    toWallet?: boolean;
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
      discountTotal: true,
      commissionRate: true,
      store: { select: { sellerId: true } },
      order: {
        select: {
          paymentMethod: true,
          buyerId: true,
          buyer: { select: { locale: true } },
          payment: { select: { id: true } },
          coupon: { select: { scope: true } },
        },
      },
    },
  });
  if (!sub) return { error: "notFound" };
  if (sub.status === "REFUNDED") return { error: "badState" };

  const itemsTotal = Number(sub.itemsTotal);
  const shipping = Number(sub.shippingTotal);
  const sellerFunded = sub.order.coupon?.scope === "SELLER";
  const eco = subEconomics(
    itemsTotal,
    shipping,
    Number(sub.commissionRate),
    Number(sub.discountTotal),
    sellerFunded,
  );
  // Refund the amount actually paid (after any voucher discount).
  const paid = eco.paid;
  const amount =
    opts.amountUsd && opts.amountUsd > 0 && opts.amountUsd <= paid
      ? round2(opts.amountUsd)
      : paid;
  const ratio = paid > 0 ? amount / paid : 1;
  const isFull = ratio >= 1;

  const settled = await prisma.ledgerEntry.findFirst({
    where: { subOrderId, type: { in: ["SALE", "COD_COMMISSION_DUE"] } },
    select: { id: true },
  });
  const balanceId = await getBalanceId(sub.store.sellerId);
  // Ensure the buyer's wallet exists before the transaction so we can write an
  // entry into it atomically with the refund.
  const walletId = opts.toWallet ? await getWalletId(sub.order.buyerId) : null;

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

    // Step 19.1: credit the buyer's HezalliPay wallet with the refunded amount.
    if (walletId) {
      await creditWalletTx(tx, walletId, {
        type: "REFUND",
        amountUsd: amount,
        orderId: sub.orderId,
        subOrderId,
        note: `Refund credited to wallet — ${opts.reason}`,
      });
    }

    if (settled) {
      if (sub.order.paymentMethod === "COD") {
        // Reverse the COD ledger credit (commission owed, less platform funding).
        await tx.ledgerEntry.create({
          data: {
            balanceId,
            type: "REFUND",
            amountUsd: -round2(eco.codLedger * ratio),
            subOrderId,
            note: "COD commission reversed (refund)",
          },
        });
      } else {
        // Claw back the seller's SALE credit.
        await tx.ledgerEntry.create({
          data: {
            balanceId,
            type: "REFUND",
            amountUsd: -round2(eco.sellerNet * ratio),
            subOrderId,
            note: "Sale reversed (refund)",
          },
        });
      }
    }

    // Restore loyalty points redeemed on this order. A points redemption is a
    // platform-funded discount with no coupon, so a discount + no coupon means
    // the buyer paid partly with points — give the proportional share back.
    if (!sub.order.coupon && Number(sub.discountTotal) > 0) {
      const restore = Math.round(
        Number(sub.discountTotal) * ratio * POINTS_PER_USD_REDEEMED,
      );
      if (restore > 0) {
        await tx.loyaltyTransaction.create({
          data: {
            userId: sub.order.buyerId,
            points: restore,
            type: "REFUND",
            orderId: sub.orderId,
            subOrderId,
            note: "Points restored on refund",
          },
        });
        await tx.user.update({
          where: { id: sub.order.buyerId },
          data: { loyaltyPoints: { increment: restore } },
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
        body: opts.toWallet
          ? bAr
            ? `تمت إضافة ${amount.toFixed(2)}$ إلى محفظتك.`
            : `$${amount.toFixed(2)} was added to your wallet.`
          : bAr
            ? `تمت الموافقة على استرداد ${amount.toFixed(2)}$.`
            : `A refund of $${amount.toFixed(2)} was issued.`,
        data: { orderId: sub.orderId },
      },
    });
  });

  await recomputeBalance(sub.store.sellerId);
  if (walletId) await recomputeWalletBalance(sub.order.buyerId);
  return { ok: true, refundId, amount };
}
