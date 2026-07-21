// Shared "settle a returned parcel" money-path. When a shipped parcel comes
// back to the seller — a delivery point RTS, or a direct parcel that exhausted
// its delivery attempts — the order must be resolved exactly once, the same
// way: refund the buyer if we already captured their money, otherwise cancel;
// then return the goods to sellable stock. Kept in one place so both callers
// (lib/point-core.ts returnParcelToSeller and lib/actions/courier.ts
// courierFailDelivery) share identical, money-safe behavior.
import { aggregateOrderStatus } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";
import { applyRefund } from "@/lib/refunds";

// Resolve a SHIPPED sub-order that is being returned to the seller. No-op if the
// sub-order isn't SHIPPED (already resolved). `actor` is recorded in history.
export async function settleReturnedSubOrder(
  subOrderId: string,
  actor = "system",
): Promise<void> {
  const sub = await prisma.subOrder.findUnique({
    where: { id: subOrderId },
    select: {
      id: true,
      status: true,
      orderId: true,
      store: { select: { name: true } },
      items: { select: { variantId: true, quantity: true } },
      order: {
        select: {
          buyerId: true,
          paymentMethod: true,
          buyer: { select: { locale: true } },
          payment: { select: { status: true } },
        },
      },
    },
  });
  if (!sub || sub.status !== "SHIPPED") return;

  const storeName = sub.store.name;
  const captured =
    sub.order.paymentMethod !== "COD" &&
    sub.order.payment?.status === "CONFIRMED";

  if (captured) {
    // Money came in and we failed to deliver → full refund to the buyer's
    // wallet. applyRefund flips the sub-order to REFUNDED, reverses the seller
    // ledger, aggregates the order, and notifies the buyer.
    await applyRefund(sub.id, {
      reason: "Returned to seller — delivery failed",
      actor,
      toWallet: true,
    });
  } else {
    // Nothing captured → plain cancellation.
    const ar = sub.order.buyer.locale === "ar";
    await prisma.$transaction(async (tx) => {
      const claimedSub = await tx.subOrder.updateMany({
        where: { id: sub.id, status: "SHIPPED" },
        data: { status: "CANCELLED" },
      });
      if (claimedSub.count !== 1) return;
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
          actor,
          note: `${storeName}: returned to seller after failed delivery`,
        },
      });
      await tx.notification.create({
        data: {
          userId: sub.order.buyerId,
          type: "SHIPMENT",
          title: ar
            ? "أُلغي طلبك بعد تعذّر التوصيل"
            : "Order cancelled — delivery failed",
          body: ar
            ? `تعذّر توصيل طلبك من ${storeName} وأُعيد إلى البائع، وقد أُلغي الطلب. لم يُحصَّل منك أي مبلغ.`
            : `We couldn't deliver your order from ${storeName}; it was returned to the seller and the order is cancelled. Nothing was charged.`,
          data: { orderId: sub.orderId },
        },
      });
    });
  }

  // The goods are back with the seller — return them to sellable stock (same as
  // the cancel and accepted-return flows).
  await prisma.$transaction(
    sub.items.map((it) =>
      prisma.productVariant.update({
        where: { id: it.variantId },
        data: { stock: { increment: it.quantity } },
      }),
    ),
  );
}
