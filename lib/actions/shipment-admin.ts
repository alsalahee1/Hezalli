"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { audit } from "@/lib/audit";
import { requireDeliveryManagerId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { markSubOrderDelivered } from "@/lib/shipment-core";

type Result = { ok?: boolean; error?: string };

const STATUSES = [
  "PENDING",
  "LABEL_CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "AT_POINT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "RETURNED_TO_POINT",
  "RETURNED",
] as const;
export type OverrideStatus = (typeof STATUSES)[number];

// Delivery staff sets a shipment's status and appends a tracking event.
// DELIVERED delegates to the shared markSubOrderDelivered cascade (sub-order
// completion, COD cash, point/courier fees, order aggregate, buyer notice) so
// a staff override behaves exactly like a courier/seller delivery.
export async function overrideShipmentStatus(
  shipmentId: string,
  status: OverrideStatus,
  input?: { location?: string; note?: string },
): Promise<Result> {
  const staffId = await requireDeliveryManagerId();
  if (!staffId) return { error: "forbidden" };
  if (!STATUSES.includes(status)) return { error: "badStatus" };
  const locale = await getLocale();

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      status: true,
      shippedAt: true,
      subOrder: { select: { id: true, orderId: true, status: true } },
    },
  });
  if (!shipment) return { error: "notFound" };
  if (shipment.status === status) return { error: "badState" };

  const location = input?.location?.trim() || null;
  const note = input?.note?.trim() || null;

  if (status === "DELIVERED") {
    // Shared cascade — only acts while the sub-order is SHIPPED (its guard).
    const res = await markSubOrderDelivered(
      shipment.subOrder.id,
      "admin",
      locale,
      note ? { note } : undefined,
    );
    if (res.error) return res;
  } else {
    await prisma.$transaction([
      prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          status,
          ...(status === "IN_TRANSIT" && !shipment.shippedAt
            ? { shippedAt: new Date() }
            : {}),
        },
      }),
      prisma.shipmentEvent.create({
        data: { shipmentId: shipment.id, status, location, note },
      }),
    ]);
  }

  await audit(staffId, "shipment.overrideStatus", "Shipment", shipment.id, {
    from: shipment.status,
    to: status,
    location,
    note,
  });

  revalidatePath(`/${locale}/delivery-manager/shipments/${shipment.id}`);
  revalidatePath(`/${locale}/delivery-manager/shipments`);
  revalidatePath(`/${locale}/delivery-manager`);
  revalidatePath(`/${locale}/account/orders/${shipment.subOrder.orderId}`);
  return { ok: true };
}

// Delivery staff corrects a shipment's carrier / tracking number, for any
// store. Audit-logged; the buyer is notified of the new tracking.
export async function editShipmentTracking(
  shipmentId: string,
  carrierId: string,
  trackingNumber: string,
): Promise<Result> {
  const staffId = await requireDeliveryManagerId();
  if (!staffId) return { error: "forbidden" };
  const locale = await getLocale();

  const tracking = (trackingNumber ?? "").trim();
  if (!carrierId) return { error: "carrierRequired" };
  if (tracking.length < 3) return { error: "trackingRequired" };

  const [shipment, carrier] = await Promise.all([
    prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: {
        id: true,
        carrierId: true,
        trackingNumber: true,
        subOrder: {
          select: {
            orderId: true,
            order: {
              select: { buyerId: true, buyer: { select: { locale: true } } },
            },
          },
        },
      },
    }),
    prisma.carrier.findUnique({
      where: { id: carrierId },
      select: { id: true, name: true, platformManaged: true },
    }),
  ]);
  if (!shipment) return { error: "notFound" };
  if (!carrier) return { error: "carrierRequired" };

  const ar = shipment.subOrder.order.buyer.locale === "ar";
  await prisma.$transaction([
    prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        carrierId: carrier.id,
        trackingNumber: tracking,
        platformManaged: carrier.platformManaged,
      },
    }),
    prisma.notification.create({
      data: {
        userId: shipment.subOrder.order.buyerId,
        type: "SHIPMENT",
        title: ar ? "تم تحديث تتبع الشحنة" : "Tracking updated",
        body: ar
          ? `رقم التتبع الجديد ${tracking} عبر ${carrier.name}.`
          : `New tracking ${tracking} via ${carrier.name}.`,
        data: { orderId: shipment.subOrder.orderId, trackingNumber: tracking },
      },
    }),
  ]);

  await audit(staffId, "shipment.editTracking", "Shipment", shipment.id, {
    from: {
      carrierId: shipment.carrierId,
      trackingNumber: shipment.trackingNumber,
    },
    to: { carrierId: carrier.id, trackingNumber: tracking },
  });

  revalidatePath(`/${locale}/delivery-manager/shipments/${shipment.id}`);
  revalidatePath(`/${locale}/delivery-manager/shipments`);
  revalidatePath(`/${locale}/account/orders/${shipment.subOrder.orderId}`);
  return { ok: true };
}
