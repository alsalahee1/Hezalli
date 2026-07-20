"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId, requireCourierId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
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
  const adminId = await requireAdminId();
  if (!adminId) return { error: "forbidden" };
  const locale = await getLocale();

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { id: true, subOrder: { select: { orderId: true } } },
  });
  if (!shipment) return { error: "notFound" };

  const id = driverId.trim();
  if (id) {
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
    });
  }

  revalidatePath(`/${locale}/admin/dispatch`);
  revalidatePath(`/${locale}/driver`);
  return { ok: true };
}

export type CourierAction = "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED";

// Proof captured on the "Delivered" tap (all optional).
export type DeliveryProofInput = {
  recipientName?: string;
  photoKey?: string;
  note?: string;
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
      subOrder: {
        select: {
          id: true,
          status: true,
          orderId: true,
          store: { select: { name: true } },
          order: {
            select: { buyerId: true, buyer: { select: { locale: true } } },
          },
        },
      },
    },
  });
  if (!shipment || !shipment.subOrder) return { error: "notFound" };
  const sub = shipment.subOrder;
  // Only an in-flight (SHIPPED) sub-order can be advanced by a driver.
  if (sub.status !== "SHIPPED") return { error: "badState" };

  if (action === "DELIVERED") {
    const res = await markSubOrderDelivered(sub.id, "courier", locale, {
      courierId,
      recipientName: proof?.recipientName,
      photoKey: proof?.photoKey,
      note: proof?.note,
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
      subOrder: {
        select: {
          status: true,
          orderId: true,
          store: { select: { name: true } },
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

  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({
      where: { id: shipmentId },
      data: { status: "FAILED", attemptCount: { increment: 1 } },
    });
    // The localized "FAILED" status label carries the meaning on the public
    // timeline; only the courier's free note (if any) is shown alongside it.
    // The machine-readable reason lives on the DeliveryAttempt for ops.
    await tx.shipmentEvent.create({
      data: { shipmentId, status: "FAILED", note: note?.trim() || null },
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
    // Let the buyer know an attempt was made and will be retried.
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
  });

  revalidatePath(`/${locale}/driver`);
  revalidatePath(`/${locale}/driver/job/${shipmentId}`);
  revalidatePath(`/${locale}/admin/dispatch`);
  return { ok: true };
}
