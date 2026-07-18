"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { aggregateOrderStatus } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";
import { buildTrackingUrl } from "@/lib/tracking";

type Result = { ok?: boolean; error?: string };

export type ShipInput = {
  carrierId: string;
  trackingNumber: string;
  note?: string;
};

// Seller ships a sub-order: records the carrier + tracking number, moves the
// sub-order to SHIPPED, and notifies the buyer with a tracking link.
export async function shipSubOrder(
  subOrderId: string,
  input: ShipInput,
): Promise<Result> {
  const gate = await requireSellerStore();
  if (!gate) return { error: "forbidden" };
  const locale = await getLocale();

  const carrierId = input.carrierId;
  const trackingNumber = (input.trackingNumber ?? "").trim();
  if (!carrierId) return { error: "carrierRequired" };
  if (trackingNumber.length < 3) return { error: "trackingRequired" };

  const [sub, carrier] = await Promise.all([
    prisma.subOrder.findFirst({
      where: { id: subOrderId, storeId: gate.storeId },
      select: {
        id: true,
        orderId: true,
        status: true,
        store: { select: { name: true } },
        order: {
          select: { buyerId: true, buyer: { select: { locale: true } } },
        },
      },
    }),
    prisma.carrier.findUnique({
      where: { id: carrierId },
      select: {
        id: true,
        name: true,
        trackingUrl: true,
        platformManaged: true,
      },
    }),
  ]);
  if (!sub) return { error: "notFound" };
  if (!carrier) return { error: "carrierRequired" };
  if (sub.status !== "PROCESSING") return { error: "badState" };

  const trackUrl = buildTrackingUrl(carrier.trackingUrl, trackingNumber);
  const ar = sub.order.buyer.locale === "ar";

  await prisma.$transaction(async (tx) => {
    // A sub-order has at most one shipment (unique). Upsert to be safe.
    const shipment = await tx.shipment.upsert({
      where: { subOrderId },
      create: {
        subOrderId,
        carrierId: carrier.id,
        trackingNumber,
        status: "IN_TRANSIT",
        platformManaged: carrier.platformManaged,
        shippedAt: new Date(),
      },
      update: {
        carrierId: carrier.id,
        trackingNumber,
        status: "IN_TRANSIT",
        platformManaged: carrier.platformManaged,
        shippedAt: new Date(),
      },
      select: { id: true },
    });
    await tx.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        status: "IN_TRANSIT",
        note: input.note?.trim() || null,
      },
    });

    await tx.subOrder.update({
      where: { id: subOrderId },
      data: { status: "SHIPPED" },
    });

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
        status: "SHIPPED",
        actor: "seller",
        note: `${sub.store.name}: ${carrier.name} #${trackingNumber}`,
      },
    });

    await tx.notification.create({
      data: {
        userId: sub.order.buyerId,
        type: "SHIPMENT",
        title: ar ? "تم شحن طلبك" : "Your order shipped",
        body: ar
          ? `شحنت ${sub.store.name} طلبك عبر ${carrier.name} — رقم التتبع ${trackingNumber}.`
          : `${sub.store.name} shipped your order via ${carrier.name} — tracking ${trackingNumber}.`,
        data: {
          orderId: sub.orderId,
          trackingNumber,
          ...(trackUrl ? { trackingUrl: trackUrl } : {}),
        },
      },
    });
  });

  revalidatePath(`/${locale}/seller/orders`);
  revalidatePath(`/${locale}/seller/orders/${subOrderId}`);
  revalidatePath(`/${locale}/account/orders`);
  return { ok: true };
}

// Seller corrects a wrong carrier/tracking on an already-shipped order.
// Audit-logged so the change is traceable.
export async function editTracking(
  subOrderId: string,
  input: ShipInput,
): Promise<Result> {
  const gate = await requireSellerStore();
  if (!gate) return { error: "forbidden" };
  const locale = await getLocale();

  const carrierId = input.carrierId;
  const trackingNumber = (input.trackingNumber ?? "").trim();
  if (!carrierId) return { error: "carrierRequired" };
  if (trackingNumber.length < 3) return { error: "trackingRequired" };

  const sub = await prisma.subOrder.findFirst({
    where: { id: subOrderId, storeId: gate.storeId },
    select: {
      id: true,
      orderId: true,
      status: true,
      shipment: {
        select: { id: true, carrierId: true, trackingNumber: true },
      },
      order: { select: { buyerId: true, buyer: { select: { locale: true } } } },
    },
  });
  if (!sub || !sub.shipment) return { error: "notFound" };
  if (sub.status !== "SHIPPED") return { error: "badState" };

  const carrier = await prisma.carrier.findUnique({
    where: { id: carrierId },
    select: { id: true, name: true, platformManaged: true },
  });
  if (!carrier) return { error: "carrierRequired" };

  await prisma.$transaction([
    prisma.shipment.update({
      where: { id: sub.shipment.id },
      data: {
        carrierId: carrier.id,
        trackingNumber,
        platformManaged: carrier.platformManaged,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: gate.userId,
        action: "shipment.editTracking",
        entity: "Shipment",
        entityId: sub.shipment.id,
        meta: {
          from: {
            carrierId: sub.shipment.carrierId,
            trackingNumber: sub.shipment.trackingNumber,
          },
          to: { carrierId: carrier.id, trackingNumber },
        },
      },
    }),
    prisma.notification.create({
      data: {
        userId: sub.order.buyerId,
        type: "SHIPMENT",
        title:
          sub.order.buyer.locale === "ar"
            ? "تم تحديث تتبع الشحنة"
            : "Tracking updated",
        body:
          sub.order.buyer.locale === "ar"
            ? `رقم التتبع الجديد ${trackingNumber} عبر ${carrier.name}.`
            : `New tracking ${trackingNumber} via ${carrier.name}.`,
        data: { orderId: sub.orderId, trackingNumber },
      },
    }),
  ]);

  revalidatePath(`/${locale}/seller/orders/${subOrderId}`);
  revalidatePath(`/${locale}/account/orders/${sub.orderId}`);
  return { ok: true };
}
