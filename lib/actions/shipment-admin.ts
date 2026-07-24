"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { audit } from "@/lib/audit";
import { requireDeliveryScope } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { settleReturnedSubOrder } from "@/lib/return-core";
import { markSubOrderDelivered } from "@/lib/shipment-core";

// A sub-order past delivery is settled money — its shipment must not be forced
// backwards (would run public tracking in reverse and desync the paid order).
const TERMINAL_SUB = ["COMPLETED", "CANCELLED", "REFUNDED"];

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
  const staffId = await requireDeliveryScope("DISPATCH");
  if (!staffId) return { error: "forbidden" };
  if (!STATUSES.includes(status)) return { error: "badStatus" };
  const locale = await getLocale();

  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      status: true,
      shippedAt: true,
      driverId: true,
      platformManaged: true,
      deliveryPointId: true,
      subOrder: { select: { id: true, orderId: true, status: true } },
    },
  });
  if (!shipment) return { error: "notFound" };
  if (shipment.status === status) return { error: "badState" };
  // Never force a shipment on an already-settled order (completed/refunded/
  // cancelled) — money has moved and the transition would only desync it.
  if (TERMINAL_SUB.includes(shipment.subOrder.status)) {
    return { error: "orderClosed" };
  }

  const location = input?.location?.trim() || null;
  const note = input?.note?.trim() || null;

  if (status === "DELIVERED") {
    // Shared cascade (guards on sub-order SHIPPED). Name who holds the cash so
    // COD lands on a real ledger: the assigned courier, if any. A platform COD
    // parcel with no assigned courier is refused by the cascade's money safety
    // net (noCashHandler) — ops must assign a driver (or use the counter/pickup
    // flow) rather than strand the cash.
    const res = await markSubOrderDelivered(
      shipment.subOrder.id,
      "admin",
      locale,
      {
        courierId: shipment.driverId ?? undefined,
        ...(note ? { note } : {}),
      },
    );
    if (res.error) return res;
  } else if (status === "RETURNED") {
    // A real return settles money: refund a captured order (or cancel a COD
    // one) and restock. Reusing the shared path keeps the console identical to
    // a point RTS / exhausted-attempts return instead of a bare status write
    // that strands the buyer's refund and the seller's stock.
    await settleReturnedSubOrder(shipment.subOrder.id, "admin");
    await prisma.$transaction([
      prisma.shipment.update({
        where: { id: shipment.id },
        data: { status, stuckFlaggedAt: null, atPointId: null },
      }),
      prisma.shipmentEvent.create({
        data: { shipmentId: shipment.id, status, location, note },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.shipment.update({
        where: { id: shipment.id },
        data: {
          status,
          stuckFlaggedAt: null, // moved — allow a future stuck alert again
          // Keep custody columns consistent with the real transitions: a parcel
          // now held at its point carries atPointId; one back on the road clears
          // it. Otherwise counter-pickup / manifest lookups desync.
          ...(status === "AT_POINT" || status === "RETURNED_TO_POINT"
            ? { atPointId: shipment.deliveryPointId }
            : { atPointId: null }),
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

// Bulk form of overrideShipmentStatus: apply one status to many shipments.
// Each shipment goes through the same per-shipment path (DELIVERED cascade
// included) and gets its own audit row; failures don't stop the rest.
export async function bulkOverrideShipmentStatus(
  shipmentIds: string[],
  status: OverrideStatus,
  note?: string,
): Promise<{ ok?: boolean; error?: string; changed: number; skipped: number }> {
  const staffId = await requireDeliveryScope("DISPATCH");
  if (!staffId) return { error: "forbidden", changed: 0, skipped: 0 };
  if (!STATUSES.includes(status))
    return { error: "badStatus", changed: 0, skipped: 0 };

  const ids = [...new Set(shipmentIds)].slice(0, 100);
  let changed = 0;
  let skipped = 0;
  for (const id of ids) {
    const res = await overrideShipmentStatus(id, status, { note }).catch(
      () => ({ error: "failed" }),
    );
    if (res.error) skipped += 1;
    else changed += 1;
  }
  return { ok: true, changed, skipped };
}

// Delivery staff corrects a shipment's carrier / tracking number, for any
// store. Audit-logged; the buyer is notified of the new tracking.
export async function editShipmentTracking(
  shipmentId: string,
  carrierId: string,
  trackingNumber: string,
): Promise<Result> {
  const staffId = await requireDeliveryScope("DISPATCH");
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

// Look up a shipment for the delivery-manager scan console by its printed
// tracking number or its Hezalli Express delivery code. Returns a compact
// summary the console shows before/after applying a status.
export async function lookupShipmentForScan(code: string): Promise<
  | {
      ok: true;
      shipment: {
        id: string;
        status: string;
        code: string;
        store: string;
        buyer: string;
        governorate: string;
        courier: string | null;
      };
    }
  | { ok?: false; error: string }
> {
  const staffId = await requireDeliveryScope("DISPATCH");
  if (!staffId) return { error: "forbidden" };
  const raw = (code ?? "").trim();
  if (raw.length < 3) return { error: "badCode" };

  const shipment = await prisma.shipment.findFirst({
    where: {
      OR: [
        { trackingNumber: { equals: raw, mode: "insensitive" } },
        { deliveryCode: { equals: raw, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      driver: { select: { name: true } },
      subOrder: {
        select: {
          id: true,
          store: { select: { name: true } },
          order: {
            select: {
              buyer: { select: { name: true } },
              address: { select: { governorate: true } },
            },
          },
        },
      },
    },
  });
  if (!shipment) return { error: "notFound" };

  return {
    ok: true,
    shipment: {
      id: shipment.id,
      status: shipment.status,
      code: `#${shipment.subOrder.id.slice(-8).toUpperCase()}`,
      store: shipment.subOrder.store.name,
      buyer: shipment.subOrder.order.buyer.name ?? "—",
      governorate: shipment.subOrder.order.address.governorate,
      courier: shipment.driver?.name ?? null,
    },
  };
}
