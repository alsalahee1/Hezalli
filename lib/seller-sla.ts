// Seller ship-SLA sweep (docs/AUDIT-LIFECYCLE-2026-07-22.md GAP-3): a
// CONFIRMED/PROCESSING sub-order the seller never ships must not wait forever
// on a buyer who already committed money (or a COD promise). One day before
// `seller_ship_days` runs out the seller is warned (one-shot); past the
// deadline the sub-order auto-cancels — refunding a paid buyer to their wallet
// via the shared money-path, restoring stock, and notifying both sides. This
// is the same standard Shopee/Lazada run as "days to ship".
import { releaseFlashClaims } from "@/lib/flash";
import { notify } from "@/lib/notify";
import { aggregateOrderStatus } from "@/lib/order-status";
import { paymentCapturedInSystem } from "@/lib/payment-state";
import { prisma } from "@/lib/prisma";
import { applyRefund } from "@/lib/refunds";
import { getSetting } from "@/lib/settings";

const BATCH = 100;
const DAY_MS = 86_400_000;

// Sub-order states where the ball is in the seller's court. PENDING is a
// payment state (manual-prepaid awaiting proof/confirmation), never counted
// against the seller; SHIPPED and beyond are the courier's clock.
const SELLER_COURT = ["CONFIRMED", "PROCESSING"] as const;

export async function sweepSellerSla(): Promise<{
  reminded: number;
  cancelled: number;
}> {
  const days = await getSetting("seller_ship_days");
  if (days <= 0) return { reminded: 0, cancelled: 0 };

  const now = Date.now();
  const cancelCutoff = new Date(now - days * DAY_MS);
  const warnCutoff = new Date(now - Math.max(days - 1, 0) * DAY_MS);

  // 1. Warn sellers whose deadline lands within a day (one-shot guard).
  const atRisk = await prisma.subOrder.findMany({
    where: {
      status: { in: [...SELLER_COURT] },
      createdAt: { lt: warnCutoff, gte: cancelCutoff },
      sellerSlaRemindedAt: null,
    },
    take: BATCH,
    select: {
      id: true,
      store: {
        select: {
          name: true,
          seller: {
            select: { userId: true, user: { select: { locale: true } } },
          },
        },
      },
    },
  });
  let reminded = 0;
  for (const sub of atRisk) {
    // Flag first so a notify failure can't re-spam on the next run.
    const flagged = await prisma.subOrder.updateMany({
      where: { id: sub.id, sellerSlaRemindedAt: null },
      data: { sellerSlaRemindedAt: new Date() },
    });
    if (flagged.count !== 1) continue;
    reminded += 1;
    const sellerUserId = sub.store.seller?.userId;
    if (!sellerUserId) continue;
    const ar = sub.store.seller?.user?.locale === "ar";
    await notify({
      userId: sellerUserId,
      type: "ORDER",
      title: ar
        ? "اشحن الطلب اليوم وإلا أُلغي تلقائيًا"
        : "Ship this order today or it will auto-cancel",
      body: ar
        ? `لديك طلب لم يُشحن منذ ${days - 1}+ أيام. المهلة ${days} أيام؛ بعدها يُلغى ويُعاد المبلغ للمشتري.`
        : `An order of yours has gone unshipped for ${days - 1}+ days. The limit is ${days} days; after that it cancels and the buyer is refunded.`,
      data: { subOrderId: sub.id },
    }).catch(() => {});
  }

  // 2. Cancel sub-orders past the deadline — refund-if-paid via the shared
  // money-path (mirrors the seller's own cancel), plain cancel otherwise.
  const overdue = await prisma.subOrder.findMany({
    where: {
      status: { in: [...SELLER_COURT] },
      createdAt: { lt: cancelCutoff },
    },
    take: BATCH,
    select: {
      id: true,
      orderId: true,
      items: { select: { variantId: true, quantity: true, flashItemId: true } },
      order: {
        select: {
          buyerId: true,
          paymentMethod: true,
          payment: { select: { status: true, confirmedBy: true } },
          buyer: { select: { locale: true } },
        },
      },
      store: {
        select: {
          name: true,
          seller: {
            select: { userId: true, user: { select: { locale: true } } },
          },
        },
      },
    },
  });

  let cancelled = 0;
  for (const sub of overdue) {
    const paid = paymentCapturedInSystem(sub.order);
    let done = false;

    if (paid) {
      // Money first: applyRefund conditionally flips the sub-order to
      // REFUNDED, credits the buyer's wallet, restores redeemed loyalty
      // points, updates the order status, and notifies the buyer. A failure
      // (e.g. a concurrent ship) just skips this parcel.
      const res = await applyRefund(sub.id, {
        reason: `Auto-cancelled: not shipped within ${days} days`,
        actor: "system",
        toWallet: true,
      });
      if (res.ok) {
        await prisma.$transaction(async (tx) => {
          for (const it of sub.items) {
            await tx.productVariant.updateMany({
              where: { id: it.variantId },
              data: { stock: { increment: it.quantity } },
            });
          }
          await releaseFlashClaims(tx, sub.items);
        });
        done = true;
      }
    } else {
      done = await prisma.$transaction(async (tx) => {
        // Conditional flip guards a race with a concurrent ship/cancel.
        const flip = await tx.subOrder.updateMany({
          where: { id: sub.id, status: { in: [...SELLER_COURT] } },
          data: { status: "CANCELLED" },
        });
        if (flip.count !== 1) return false;
        for (const it of sub.items) {
          await tx.productVariant.updateMany({
            where: { id: it.variantId },
            data: { stock: { increment: it.quantity } },
          });
        }
        await releaseFlashClaims(tx, sub.items);
        const subs = await tx.subOrder.findMany({
          where: { orderId: sub.orderId },
          select: { status: true },
        });
        await tx.order.update({
          where: { id: sub.orderId },
          data: {
            status: aggregateOrderStatus(subs.map((s) => s.status)) as never,
          },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: sub.orderId,
            status: "CANCELLED",
            actor: "system",
            note: `${sub.store.name}: CANCELLED — not shipped within ${days} days`,
          },
        });
        const buyerAr = sub.order.buyer.locale === "ar";
        await tx.notification.create({
          data: {
            userId: sub.order.buyerId,
            type: "ORDER",
            title: buyerAr ? "أُلغي طلبك" : "Your order was cancelled",
            body: buyerAr
              ? `لم يشحن ${sub.store.name} طلبك في المهلة المحددة فأُلغي تلقائيًا.`
              : `${sub.store.name} didn't ship your order in time, so it was cancelled automatically.`,
            data: { orderId: sub.orderId },
          },
        });
        return true;
      });
    }
    if (!done) continue;
    cancelled += 1;

    const sellerUserId = sub.store.seller?.userId;
    if (sellerUserId) {
      const ar = sub.store.seller?.user?.locale === "ar";
      await notify({
        userId: sellerUserId,
        type: "ORDER",
        title: ar
          ? "أُلغي طلب لعدم الشحن في المهلة"
          : "Order auto-cancelled — not shipped in time",
        body: ar
          ? `أُلغي طلب لم يُشحن خلال ${days} أيام${paid ? " وأُعيد المبلغ للمشتري" : ""}. الشحن في الوقت يحمي تقييم متجرك.`
          : `An order went unshipped for ${days} days and was cancelled${paid ? " (the buyer was refunded)" : ""}. Shipping on time protects your store's standing.`,
        data: { subOrderId: sub.id },
      }).catch(() => {});
    }
  }

  return { reminded, cancelled };
}
