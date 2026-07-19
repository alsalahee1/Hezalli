"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdminId, requireCourierId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
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
  }

  revalidatePath(`/${locale}/admin/dispatch`);
  revalidatePath(`/${locale}/driver`);
  return { ok: true };
}

export type CourierAction = "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED";

// Driver advances one of their assigned shipments through the delivery states.
// DELIVERED defers to the shared core (COD capture, auto-complete, buyer notice).
export async function courierAdvance(
  shipmentId: string,
  action: CourierAction,
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
    const res = await markSubOrderDelivered(sub.id, "courier", locale);
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
