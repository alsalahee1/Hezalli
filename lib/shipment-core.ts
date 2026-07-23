// Shared "mark delivered" transition, used by both the seller action
// (markDelivered) and the courier app (courierMarkDelivered) so the
// money-sensitive delivery logic — COD cash capture, the auto-complete
// countdown, and buyer notification — lives in exactly one place.
//
// Callers are responsible for authorization + ownership BEFORE calling this.
import { revalidatePath } from "next/cache";

import { aggregateOrderStatus } from "@/lib/order-status";
import {
  COD_DELIVERY_CONFIRMED_BY,
  codSettledDigitally,
} from "@/lib/payment-state";
import { recordDeliveryLedger } from "@/lib/courier-ledger";
import {
  recordPointCounterCod,
  recordPointHandlingFee,
} from "@/lib/point-ledger";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { notifyBot } from "@/lib/integrations/bot-notify";

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
  // Counter pickup: the point that handed the parcel to the buyer. For COD,
  // the cash lands on this point's cash ledger instead of a courier's.
  pickupPointId?: string;
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
      shipment: {
        select: {
          id: true,
          platformManaged: true,
          deliveryPointId: true,
          originPointId: true,
        },
      },
      order: {
        select: {
          id: true,
          buyerId: true,
          paymentMethod: true,
          buyer: { select: { locale: true } },
          payment: { select: { id: true, status: true, confirmedBy: true } },
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
  // Two-hop parcels also pay the ORIGIN hub its transfer fee (docs §16).
  const isTwoHop = Boolean(
    sub.shipment?.originPointId &&
    sub.shipment.originPointId !== sub.shipment.deliveryPointId,
  );
  const transferFee = isTwoHop ? await getSetting("point_transfer_fee") : 0;
  // Cash is due unless the buyer settled the COD order digitally (docs §39) —
  // then it delivers like a prepaid one: the courier/counter collects nothing.
  // A payment CONFIRMED by a sibling sub-order's cash capture does NOT count
  // as paid: on a multi-seller COD order every sub still collects its own cash.
  const codPaid = codSettledDigitally(sub.order);
  const codAmount =
    isCod && !codPaid
      ? Number(sub.itemsTotal) +
        Number(sub.shippingTotal) -
        Number(sub.discountTotal)
      : 0;

  // Money safety net: for a Hezalli Express (platform-managed) parcel with COD
  // cash still to collect, the caller MUST name who took the cash — a courier
  // (recordDeliveryLedger) or a pickup point (recordPointCounterCod). Without
  // one, the cash would be captured onto no ledger and no one would be
  // accountable to remit it (the class of bug behind the seller/staff/buyer
  // "mark delivered" custody bypasses). Third-party carriers are exempt: their
  // COD is the seller's own cash (settled as COD_COMMISSION_DUE), off-platform.
  if (
    codAmount > 0 &&
    sub.shipment?.platformManaged &&
    !proof?.courierId &&
    !proof?.pickupPointId
  ) {
    return { error: "noCashHandler" };
  }

  let alreadyDelivered = false;
  await prisma.$transaction(async (tx) => {
    // Atomically claim the SHIPPED→DELIVERED transition. updateMany with a
    // status guard makes the transition itself the lock: a concurrent
    // double-submit (two tabs / double-tap / retry) that already flipped the
    // row sees count 0 here and bails, so one delivery can never mint duplicate
    // courier/point earnings or COD ledger rows. (The pre-transaction status
    // check above is only a fast path; this is the authoritative guard.)
    const claimed = await tx.subOrder.updateMany({
      where: { id: subOrderId, status: "SHIPPED" },
      data: { status: "DELIVERED", autoCompleteAt },
    });
    if (claimed.count !== 1) {
      alreadyDelivered = true;
      return;
    }

    if (sub.shipment) {
      const recipientName = proof?.recipientName?.trim() || null;
      await tx.shipment.update({
        where: { id: sub.shipment.id },
        data: {
          status: "DELIVERED",
          deliveredAt: new Date(),
          attemptCount: { increment: 1 },
          atPointId: null,
          shelfCode: null,
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

      // The origin hub's transfer-leg fee for two-hop parcels.
      if (isTwoHop && sub.shipment.originPointId) {
        await recordPointHandlingFee(tx, {
          pointId: sub.shipment.originPointId,
          subOrderId,
          shipmentId: sub.shipment.id,
          fee: transferFee,
        });
      }

      // Counter pickup: the point collected the buyer's COD cash.
      if (proof?.pickupPointId && codAmount > 0) {
        await recordPointCounterCod(tx, {
          pointId: proof.pickupPointId,
          subOrderId,
          shipmentId: sub.shipment.id,
          amount: codAmount,
        });
      }
    }

    // (Sub-order status was already flipped by the atomic claim above.)
    const subs = await tx.subOrder.findMany({
      where: { orderId: sub.orderId },
      select: { status: true },
    });

    // COD: cash is captured sub-order by sub-order, but the Payment row is
    // order-level. Flip it to CONFIRMED only once NO sub-order can still
    // collect cash — flipping on the first delivery of a multi-seller order
    // would tell the remaining drivers/counters the order is already paid.
    // Conditional update so concurrent sibling deliveries can't race, and the
    // stamp records that this confirmation is a cash capture (not digital).
    const stillCollectible = subs.some((s) =>
      ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED"].includes(s.status),
    );
    if (isCod && sub.order.payment && !codPaid && !stillCollectible) {
      await tx.payment.updateMany({
        where: { id: sub.order.payment.id, status: { not: "CONFIRMED" } },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          confirmedBy: COD_DELIVERY_CONFIRMED_BY,
        },
      });
    }
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

    // No "confirm receipt" prompt when the buyer's own confirmation is what
    // triggered the delivery (confirmReceived) — they already did.
    if (actor !== "buyer") {
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
    }
  });

  // A concurrent request won the transition — treat this one as a no-op.
  if (alreadyDelivered) return { error: "badState" };

  revalidatePath(`/${locale}/seller/orders`);
  revalidatePath(`/${locale}/seller/orders/${subOrderId}`);
  revalidatePath(`/${locale}/account/orders`);
  revalidatePath(`/${locale}/account/orders/${sub.orderId}`);

  // Courtesy ping over the buyer's linked messaging bots (Telegram/WhatsApp).
  await notifyBot(
    sub.order.buyerId,
    ar
      ? `✅ تم توصيل طلبك من ${sub.store.name}. أكِّد الاستلام لإتمام الطلب.`
      : `✅ Your order from ${sub.store.name} was delivered. Confirm receipt to complete it.`,
  );
  return { ok: true };
}
