// Shared "mark delivered" transition, used by both the seller action
// (markDelivered) and the courier app (courierMarkDelivered) so the
// money-sensitive delivery logic — COD cash capture, the auto-complete
// countdown, and buyer notification — lives in exactly one place.
//
// Callers are responsible for authorization + ownership BEFORE calling this.
import { revalidatePath } from "next/cache";

import { aggregateOrderStatus } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";

type Result = { ok?: boolean; error?: string };

export async function autoCompleteDays(): Promise<number> {
  const row = await prisma.platformSetting.findUnique({
    where: { key: "auto_complete_days" },
    select: { value: true },
  });
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 0 ? n : 7;
}

// Transition a SHIPPED sub-order to DELIVERED. `actor` is recorded in the order
// history ("seller" | "courier"). Idempotent guard: only acts while SHIPPED.
export async function markSubOrderDelivered(
  subOrderId: string,
  actor: string,
  locale: string,
): Promise<Result> {
  const sub = await prisma.subOrder.findUnique({
    where: { id: subOrderId },
    select: {
      id: true,
      orderId: true,
      status: true,
      store: { select: { name: true } },
      shipment: { select: { id: true } },
      order: {
        select: {
          id: true,
          buyerId: true,
          paymentMethod: true,
          buyer: { select: { locale: true } },
          payment: { select: { id: true, status: true } },
        },
      },
    },
  });
  if (!sub) return { error: "notFound" };
  if (sub.status !== "SHIPPED") return { error: "badState" };

  const days = await autoCompleteDays();
  const autoCompleteAt = new Date(Date.now() + days * 86_400_000);
  const ar = sub.order.buyer.locale === "ar";
  const isCod = sub.order.paymentMethod === "COD";

  await prisma.$transaction(async (tx) => {
    if (sub.shipment) {
      await tx.shipment.update({
        where: { id: sub.shipment.id },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      });
      await tx.shipmentEvent.create({
        data: { shipmentId: sub.shipment.id, status: "DELIVERED" },
      });
    }

    await tx.subOrder.update({
      where: { id: subOrderId },
      data: { status: "DELIVERED", autoCompleteAt },
    });

    // COD: cash collected on delivery.
    if (
      isCod &&
      sub.order.payment &&
      sub.order.payment.status !== "CONFIRMED"
    ) {
      await tx.payment.update({
        where: { id: sub.order.payment.id },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
      });
    }

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
        status: "DELIVERED",
        actor,
        note: `${sub.store.name}: delivered`,
      },
    });

    await tx.notification.create({
      data: {
        userId: sub.order.buyerId,
        type: "SHIPMENT",
        title: ar ? "تم توصيل طلبك" : "Your order was delivered",
        body: ar
          ? `وصل طلبك من ${sub.store.name}. أكِّد الاستلام لإتمام الطلب.`
          : `Your order from ${sub.store.name} arrived. Confirm receipt to complete it.`,
        data: { orderId: sub.orderId },
      },
    });
  });

  revalidatePath(`/${locale}/seller/orders`);
  revalidatePath(`/${locale}/seller/orders/${subOrderId}`);
  revalidatePath(`/${locale}/account/orders`);
  revalidatePath(`/${locale}/account/orders/${sub.orderId}`);
  return { ok: true };
}
