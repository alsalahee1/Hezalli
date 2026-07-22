"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireDeliveryManagerId, requireCourierId } from "@/lib/authz";
import { notifyBot } from "@/lib/integrations/bot-notify";
import { codSettledDigitally } from "@/lib/payment-state";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { settleReturnedSubOrder } from "@/lib/return-core";
import { getSetting } from "@/lib/settings";
import { markSubOrderDelivered } from "@/lib/shipment-core";
import { nearestGovernorate } from "@/lib/yemen-geo";

type Result = { ok?: boolean; error?: string };

// A driver shares their current location (opt-in). We store the raw point plus
// the nearest governorate, which "nearest" dispatch matches against.
export async function updateCourierLocation(
  lat: number,
  lng: number,
): Promise<{ ok?: boolean; error?: string; governorate?: string }> {
  const courierId = await requireCourierId();
  if (!courierId) return { error: "forbidden" };
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return { error: "badLocation" };
  }
  const governorate = nearestGovernorate(lat, lng);
  await prisma.courierLocation.upsert({
    where: { userId: courierId },
    create: { userId: courierId, lat, lng, governorate },
    update: { lat, lng, governorate },
  });
  const locale = await getLocale();
  revalidatePath(`/${locale}/driver`);
  return { ok: true, governorate };
}

// Ops assigns (or reassigns / unassigns) a Hezalli Express shipment to a
// courier. Pass an empty driverId to unassign.
export async function assignCourier(
  shipmentId: string,
  driverId: string,
): Promise<Result> {
  const adminId = await requireDeliveryManagerId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      platformManaged: true,
      subOrder: { select: { orderId: true } },
    },
  });
  if (!shipment) return { error: "notFound" };

  const id = driverId.trim();
  if (id) {
    // A Hezalli courier only carries Hezalli Express parcels. Attaching one to
    // an external-carrier shipment would let them "deliver" it (and capture its
    // COD onto their ledger) for a parcel Hezalli doesn't run — same guard the
    // bulk assign already enforces.
    if (!shipment.platformManaged) return { error: "notPlatformManaged" };
    const driver = await prisma.user.findUnique({
      where: { id },
      select: { roles: true, isSuspended: true, deletedAt: true },
    });
    if (
      !driver ||
      driver.isSuspended ||
      driver.deletedAt ||
      !driver.roles.includes("COURIER")
    ) {
      return { error: "invalidDriver" };
    }
  }

  await prisma.shipment.update({
    where: { id: shipmentId },
    data: { driverId: id || null },
  });

  if (id) {
    await prisma.notification.create({
      data: {
        userId: id,
        type: "SHIPMENT",
        title: "New delivery assigned",
        body: "A Hezalli Express delivery was assigned to you.",
        data: { link: "/driver" },
      },
    });
    // Ping the driver's phone (no-op unless push is configured).
    await sendPushToUser(id, {
      title: "New delivery assigned",
      body: "A Hezalli Express delivery was assigned to you.",
      url: "/driver",
      tag: "assignment",
      icon: "/driver-icon.svg",
    });
  }

  revalidatePath(`/${locale}/admin/dispatch`);
  revalidatePath(`/${locale}/driver`);
  return { ok: true };
}

// Ops assigns several unassigned parcels to one courier in a single action
// (e.g. "give this driver everything in Sana'a"). Race-guarded: only parcels
// that are still platform-managed AND unassigned are claimed, so it never
// steals a parcel another dispatcher just assigned. Notifies + pushes once.
export async function assignManyCouriers(
  shipmentIds: string[],
  driverId: string,
): Promise<Result & { count?: number }> {
  const adminId = await requireDeliveryManagerId();
  if (!adminId) return { error: "forbidden" };
  const id = driverId.trim();
  if (!id) return { error: "invalidDriver" };
  const ids = Array.from(new Set(shipmentIds.filter(Boolean)));
  if (ids.length === 0) return { error: "noParcels" };

  const driver = await prisma.user.findUnique({
    where: { id },
    select: { roles: true, isSuspended: true, deletedAt: true },
  });
  if (
    !driver ||
    driver.isSuspended ||
    driver.deletedAt ||
    !driver.roles.includes("COURIER")
  ) {
    return { error: "invalidDriver" };
  }

  const claimed = await prisma.shipment.updateMany({
    where: { id: { in: ids }, driverId: null, platformManaged: true },
    data: { driverId: id },
  });
  const count = claimed.count;

  if (count > 0) {
    await prisma.notification.create({
      data: {
        userId: id,
        type: "SHIPMENT",
        title: "New deliveries assigned",
        body: `${count} Hezalli Express deliveries were assigned to you.`,
        data: { link: "/driver" },
      },
    });
    await sendPushToUser(id, {
      title: "New deliveries assigned",
      body: `${count} Hezalli Express deliveries were assigned to you.`,
      url: "/driver",
      tag: "assignment",
      icon: "/driver-icon.svg",
    }).catch(() => {});
  }

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin/dispatch`);
  revalidatePath(`/${locale}/driver`);
  return { ok: true, count };
}

export type CourierAction = "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED";

// Proof captured on the "Delivered" tap (all optional).
export type DeliveryProofInput = {
  recipientName?: string;
  photoKey?: string;
  note?: string;
  // The buyer's delivery code (typed or scanned from their QR). When present
  // it must match the shipment's code; a match is recorded as verified proof.
  deliveryCode?: string;
};

// Reasons a doorstep delivery can fail. Kept in sync with the driver reason
// picker and the `Driver.failReason_*` i18n keys.
const FAIL_REASONS = new Set([
  "unreachable",
  "refused",
  "wrong_address",
  "rescheduled",
  "other",
]);

// Driver advances one of their assigned shipments through the delivery states.
// DELIVERED defers to the shared core (COD capture, auto-complete, buyer notice).
export async function courierAdvance(
  shipmentId: string,
  action: CourierAction,
  proof?: DeliveryProofInput,
): Promise<Result> {
  const courierId = await requireCourierId();
  if (!courierId) return { error: "forbidden" };
  const locale = await getLocale();

  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, driverId: courierId },
    select: {
      id: true,
      status: true,
      deliveryPointId: true,
      deliveryCode: true,
      subOrder: {
        select: {
          id: true,
          status: true,
          orderId: true,
          store: { select: { name: true } },
          order: {
            select: {
              buyerId: true,
              paymentMethod: true,
              payment: { select: { status: true, confirmedBy: true } },
              buyer: { select: { locale: true } },
            },
          },
        },
      },
    },
  });
  if (!shipment || !shipment.subOrder) return { error: "notFound" };
  const sub = shipment.subOrder;
  // Only an in-flight (SHIPPED) sub-order can be advanced by a driver.
  if (sub.status !== "SHIPPED") return { error: "badState" };
  // A point-routed parcel moves through its hub, never the driver's phone,
  // while the point holds it (LABEL_CREATED/AT_POINT/RETURNED_TO_POINT) OR
  // while it is IN_TRANSIT on the line-haul leg — there the assigned driver is
  // the TRANSFER driver carrying it between hubs, whose custody ends at the
  // destination point's receive scan. Only the last-mile driver, after that
  // scan (status OUT_FOR_DELIVERY), delivers. Direct parcels have no delivery
  // point, so this never blocks them.
  if (
    shipment.deliveryPointId &&
    ["LABEL_CREATED", "AT_POINT", "RETURNED_TO_POINT", "IN_TRANSIT"].includes(
      shipment.status,
    )
  ) {
    return { error: "badState" };
  }

  if (action === "DELIVERED") {
    // Optional strongest proof: the buyer's delivery code (typed or scanned
    // from their QR). Wrong code = hard error; empty = ordinary proof.
    const typed = proof?.deliveryCode?.trim().toUpperCase();
    if (typed && typed !== shipment.deliveryCode?.toUpperCase()) {
      return { error: "badCode" };
    }
    // A COD drop must carry SOME proof of handover — the buyer's code, a
    // doorstep photo, or a recipient name. The driver becomes accountable for
    // the cash either way, but without evidence an "I never received it"
    // dispute has nothing to weigh. Prepaid drops stay frictionless, and a COD
    // order already settled digitally (no cash due) is treated as prepaid.
    const recipient = proof?.recipientName?.trim();
    const codCashDue =
      sub.order.paymentMethod === "COD" && !codSettledDigitally(sub.order);
    if (codCashDue && !typed && !proof?.photoKey && !recipient) {
      return { error: "proofRequired" };
    }
    const res = await markSubOrderDelivered(sub.id, "courier", locale, {
      courierId,
      recipientName: proof?.recipientName,
      photoKey: proof?.photoKey,
      note: proof?.note,
      codeVerified: Boolean(typed),
    });
    revalidatePath(`/${locale}/driver`);
    revalidatePath(`/${locale}/driver/job/${shipmentId}`);
    return res;
  }

  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({
      where: { id: shipmentId },
      data: { status: action },
    });
    await tx.shipmentEvent.create({
      data: { shipmentId, status: action },
    });
    // Tell the buyer when their parcel is out for delivery.
    if (action === "OUT_FOR_DELIVERY") {
      const ar = sub.order.buyer.locale === "ar";
      await tx.notification.create({
        data: {
          userId: sub.order.buyerId,
          type: "SHIPMENT",
          title: ar ? "طلبك في الطريق إليك" : "Your order is out for delivery",
          body: ar
            ? `خرج طلبك من ${sub.store.name} للتوصيل وسيصلك قريبًا.`
            : `Your order from ${sub.store.name} is out for delivery.`,
          data: { orderId: sub.orderId },
        },
      });
    }
  });

  if (action === "OUT_FOR_DELIVERY") {
    const ar = sub.order.buyer.locale === "ar";
    await notifyBot(
      sub.order.buyerId,
      ar
        ? `🛵 طلبك من ${sub.store.name} في الطريق إليك الآن.`
        : `🛵 Your order from ${sub.store.name} is out for delivery now.`,
    );
  }

  revalidatePath(`/${locale}/driver`);
  revalidatePath(`/${locale}/driver/job/${shipmentId}`);
  return { ok: true };
}

// Driver logs a FAILED doorstep attempt (customer unreachable, refused, wrong
// address, asked to reschedule…). The parcel stays with the courier (sub-order
// remains SHIPPED) so it can be re-attempted or reassigned from dispatch; the
// Shipment flips to FAILED and the reason is recorded as a DeliveryAttempt.
export async function courierFailDelivery(
  shipmentId: string,
  reason: string,
  note?: string,
): Promise<Result> {
  const courierId = await requireCourierId();
  if (!courierId) return { error: "forbidden" };
  if (!FAIL_REASONS.has(reason)) return { error: "badReason" };
  const locale = await getLocale();

  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, driverId: courierId },
    select: {
      id: true,
      status: true,
      deliveryPointId: true,
      attemptCount: true,
      subOrder: {
        select: {
          id: true,
          status: true,
          orderId: true,
          store: {
            select: {
              name: true,
              seller: {
                select: {
                  userId: true,
                  user: { select: { locale: true } },
                },
              },
            },
          },
          order: {
            select: { buyerId: true, buyer: { select: { locale: true } } },
          },
        },
      },
    },
  });
  if (!shipment || !shipment.subOrder) return { error: "notFound" };
  const sub = shipment.subOrder;
  if (sub.status !== "SHIPPED") return { error: "badState" };
  // A FAILED attempt means a doorstep delivery was actually tried, so the
  // parcel must be OUT_FOR_DELIVERY — the driver has taken it out. This blocks
  // failing a parcel still at a point, in line-haul, or merely picked up, so a
  // driver can't rack up attempts toward a forced RETURN without a real try.
  if (shipment.status !== "OUT_FOR_DELIVERY") return { error: "badState" };

  // A DIRECT parcel (no delivery point) that has now exhausted its allowed
  // attempts is returned to the seller instead of sitting FAILED-and-retriable
  // forever. Point-routed parcels keep flowing back through the point.
  const maxAttempts = await getSetting("max_delivery_attempts");
  const willReturn =
    !shipment.deliveryPointId && shipment.attemptCount + 1 >= maxAttempts;

  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({
      where: { id: shipmentId },
      data: {
        status: willReturn ? "RETURNED" : "FAILED",
        attemptCount: { increment: 1 },
      },
    });
    // The localized status label carries the meaning on the public timeline;
    // only the courier's free note (if any) is shown alongside it. The
    // machine-readable reason lives on the DeliveryAttempt for ops.
    await tx.shipmentEvent.create({
      data: {
        shipmentId,
        status: willReturn ? "RETURNED" : "FAILED",
        note: note?.trim() || null,
      },
    });
    await tx.deliveryAttempt.create({
      data: {
        shipmentId,
        courierId,
        outcome: "FAILED",
        reason,
        note: note?.trim() || null,
      },
    });
    // While still retriable, tell the buyer we'll try again. When the parcel is
    // being returned, settleReturnedSubOrder sends the final (refund/cancel)
    // notice instead, so we don't double-notify here.
    if (!willReturn) {
      const ar = sub.order.buyer.locale === "ar";
      await tx.notification.create({
        data: {
          userId: sub.order.buyerId,
          type: "SHIPMENT",
          title: ar ? "تعذّر توصيل طلبك" : "Delivery attempt unsuccessful",
          body: ar
            ? `حاول مندوبنا توصيل طلبك من ${sub.store.name} ولم يتمكّن. سنعيد المحاولة قريبًا.`
            : `Our courier tried to deliver your order from ${sub.store.name} but couldn't. We'll try again soon.`,
          data: { orderId: sub.orderId },
        },
      });
    }
  });

  if (willReturn) {
    // Resolve the order (refund-if-paid / cancel + restock) via the shared
    // money-path, then tell the seller their parcel is coming back.
    await settleReturnedSubOrder(sub.id);
    const sellerUserId = sub.store.seller?.userId;
    if (sellerUserId) {
      const sellerAr = sub.store.seller?.user?.locale === "ar";
      await prisma.notification.create({
        data: {
          userId: sellerUserId,
          type: "SHIPMENT",
          title: sellerAr
            ? "طرد مرتجع بعد تعذّر التوصيل"
            : "A parcel is being returned to you",
          body: sellerAr
            ? `تعذّر توصيل أحد طلباتك بعد ${maxAttempts} محاولات وسيُعاد إليك.`
            : `A parcel couldn't be delivered after ${maxAttempts} attempts and is being returned to you.`,
          data: { subOrderId: sub.id },
        },
      });
    }
  }

  revalidatePath(`/${locale}/driver`);
  revalidatePath(`/${locale}/driver/job/${shipmentId}`);
  revalidatePath(`/${locale}/admin/dispatch`);
  return { ok: true };
}
