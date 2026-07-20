// Shared "mark delivered" transition, used by both the seller action
// (markDelivered) and the courier app (courierMarkDelivered) so the
// money-sensitive delivery logic — COD cash capture, the auto-complete
// countdown, and buyer notification — lives in exactly one place.
//
// Callers are responsible for authorization + ownership BEFORE calling this.
import { revalidatePath } from "next/cache";

import { aggregateOrderStatus } from "@/lib/order-status";
import { recordDeliveryLedger } from "@/lib/courier-ledger";
import { recordPointHandlingFee } from "@/lib/point-ledger";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

type Result = { ok?: boolean; error?: string };

export async function autoCompleteDays(): Promise<number> {
  const row = await prisma.platformSetting.findUnique({
    where: { key: "auto_complete_days" },
    select: { value: true },
  });
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 0 ? n : 7;
}

// The flat delivery fee a courier earns per completed drop (Admin → Settings).
async function courierDeliveryFee(): Promise<number> {
  const row = await prisma.platformSetting.findUnique({
    where: { key: "courier_delivery_fee" },
    select: { value: true },
  });
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 0 ? n : 1.5;
}

// Proof captured by a courier at the doorstep (optional; the seller path has
// none). Recorded as a DELIVERED DeliveryAttempt for tracking + COD evidence.
export type DeliveryProof = {
  courierId?: string;
  recipientName?: string;
  photoKey?: string;
  note?: string;
  // The buyer's delivery code / QR was checked at the doorstep (optional,
  // strongest proof — see docs/DELIVERY-POINTS.md §3).
  codeVerified?: boolean;
};

// Transition a SHIPPED sub-order to DELIVERED. `actor` is recorded in the order
// history ("seller" | "courier"). Idempotent guard: only acts while SHIPPED.
export async function markSubOrderDelivered(
  subOrderId: string,
  actor: string,
  locale: string,
  proof?: DeliveryProof,
): Promise<Result> {
  const sub = await prisma.subOrder.findUnique({
    where: { id: subOrderId },
    select: {
      id: true,
      orderId: true,
      status: true,
      itemsTotal: true,
      shippingTotal: true,
      discountTotal: true,
      store: { select: { name: true } },
      shipment: { select: { id: true, deliveryPointId: true } },
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

  // A Hezalli courier completing the drop accrues a delivery fee (earning) and,
  // for COD, becomes accountable for the cash they collected.
  const fee = proof?.courierId ? await courierDeliveryFee() : 0;
  // A parcel routed through a Hezalli Point earns the point its handling fee
  // once it is actually delivered (docs/DELIVERY-POINTS.md §4).
  const pointFee = sub.shipment?.deliveryPointId
    ? await getSetting("point_handling_fee")
    : 0;
  const codAmount = isCod
    ? Number(sub.itemsTotal) +
      Number(sub.shippingTotal) -
      Number(sub.discountTotal)
    : 0;

  await prisma.$transaction(async (tx) => {
    if (sub.shipment) {
      const recipientName = proof?.recipientName?.trim() || null;
      await tx.shipment.update({
        where: { id: sub.shipment.id },
        data: {
          status: "DELIVERED",
          deliveredAt: new Date(),
          attemptCount: { increment: 1 },
        },
      });
      await tx.shipmentEvent.create({
        data: {
          shipmentId: sub.shipment.id,
          status: "DELIVERED",
          note: recipientName ? `Received by ${recipientName}` : undefined,
        },
      });
      // Record the successful attempt (proof of delivery).
      await tx.deliveryAttempt.create({
        data: {
          shipmentId: sub.shipment.id,
          courierId: proof?.courierId ?? null,
          outcome: "DELIVERED",
          recipientName,
          proofPhotoKey: proof?.photoKey || null,
          note: proof?.note?.trim() || null,
          codeVerified: proof?.codeVerified === true,
        },
      });

      // Courier cash + earnings ledger (COD held by the driver + delivery fee).
      if (proof?.courierId) {
        await recordDeliveryLedger(tx, {
          courierId: proof.courierId,
          subOrderId,
          shipmentId: sub.shipment.id,
          codAmount,
          fee,
        });
      }

      // The routing point's handling fee, earned on delivery.
      if (sub.shipment.deliveryPointId) {
        await recordPointHandlingFee(tx, {
          pointId: sub.shipment.deliveryPointId,
          subOrderId,
          shipmentId: sub.shipment.id,
          fee: pointFee,
        });
      }
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
