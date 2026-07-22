"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { notifyBot } from "@/lib/integrations/bot-notify";
import { getLocale } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { autoAssignShipment } from "@/lib/courier-assign";
import { aggregateOrderStatus } from "@/lib/order-status";
import { checkPointRoutable } from "@/lib/point-select";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { markSubOrderDelivered } from "@/lib/shipment-core";
import { buildTrackingUrl } from "@/lib/tracking";

type Result = { ok?: boolean; error?: string };

export type ShipInput = {
  carrierId: string;
  trackingNumber: string;
  note?: string;
  // Route the parcel through a Hezalli Point (platform carrier only): the
  // seller drops it there instead of handing it to a courier directly.
  deliveryPointId?: string;
  // Two-hop line-haul (docs §14): the ENTRY hub near the seller. Only valid
  // together with a destination point, and must differ from it.
  originPointId?: string;
};

// Short unguessable code for the buyer's delivery QR (unique on Shipment).
const mintDeliveryCode = () => randomBytes(5).toString("hex").toUpperCase();

// Hezalli Express waybill numbers are minted by the platform — the seller has
// no external carrier to get one from, so asking them to type one only
// produces made-up values that collide and break the scan flows (driver scan,
// hub console, public tracking all resolve parcels by this number). Digits
// after the prefix keep the printed Code 39 barcode compact and scannable.
async function mintTrackingNumber(): Promise<string> {
  for (;;) {
    const digits = Array.from(randomBytes(10), (b) => b % 10).join("");
    const candidate = `HZE${digits}`;
    const clash = await prisma.shipment.findFirst({
      where: { trackingNumber: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
}

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
  let trackingNumber = (input.trackingNumber ?? "").trim();
  if (!carrierId) return { error: "carrierRequired" };

  const [sub, carrier] = await Promise.all([
    prisma.subOrder.findFirst({
      where: { id: subOrderId, storeId: gate.storeId },
      select: {
        id: true,
        orderId: true,
        status: true,
        shippingMethod: true,
        pickupPointId: true,
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

  // Hezalli Express: the platform mints the waybill number when none is
  // provided. Third-party carriers issue their own — the seller must type it.
  if (!trackingNumber && carrier.platformManaged) {
    trackingNumber = await mintTrackingNumber();
  }
  if (trackingNumber.length < 3) return { error: "trackingRequired" };

  // Optional routing via a Hezalli Point (platform carrier only): the parcel
  // starts LABEL_CREATED (awaiting drop-off) instead of IN_TRANSIT, and
  // courier auto-assignment waits until the point receives it. For a PICKUP
  // sub-order the destination is FORCED to the buyer's chosen point — the
  // seller can't reroute it, and only the platform carrier can serve it.
  let pointId: string | null = null;
  let pointName: string | null = null;
  const wantedPointId =
    sub.shippingMethod === "PICKUP"
      ? sub.pickupPointId
      : input.deliveryPointId?.trim() || null;
  if (sub.shippingMethod === "PICKUP" && !carrier.platformManaged) {
    return { error: "pointNotAllowed" };
  }
  if (wantedPointId) {
    if (!carrier.platformManaged) return { error: "pointNotAllowed" };
    // A buyer-chosen pickup point stays routable even if points were later
    // switched off platform-wide — the buyer already paid for that option.
    if (
      sub.shippingMethod !== "PICKUP" &&
      !(await getSetting("points_enabled"))
    ) {
      return { error: "pointNotAllowed" };
    }
    // Capacity gates NEW seller-chosen routing only; a buyer's committed
    // pickup destination is honored even if the point filled up meanwhile.
    if (sub.shippingMethod !== "PICKUP") {
      const routable = await checkPointRoutable(wantedPointId);
      if (routable === "full") return { error: "pointFull" };
      if (routable !== "ok") return { error: "invalidPoint" };
    }
    const point = await prisma.deliveryPoint.findFirst({
      where: { id: wantedPointId, status: "ACTIVE" },
      select: { id: true, name: true },
    });
    if (!point) return { error: "invalidPoint" };
    pointId = point.id;
    pointName = point.name;
  }

  // Optional line-haul entry hub near the seller (docs §14). Needs a
  // destination point, must differ from it, and must have room.
  let originId: string | null = null;
  if (input.originPointId?.trim()) {
    if (!pointId) return { error: "invalidPoint" };
    const wanted = input.originPointId.trim();
    if (wanted !== pointId) {
      const routable = await checkPointRoutable(wanted);
      if (routable === "full") return { error: "pointFull" };
      if (routable !== "ok") return { error: "invalidPoint" };
      originId = wanted;
    }
  }
  const initialStatus = pointId ? "LABEL_CREATED" : "IN_TRANSIT";

  const trackUrl = buildTrackingUrl(carrier.trackingUrl, trackingNumber);
  const ar = sub.order.buyer.locale === "ar";
  let shipmentId: string | null = null;

  await prisma.$transaction(async (tx) => {
    // A sub-order has at most one shipment (unique). Upsert to be safe.
    const data = {
      carrierId: carrier.id,
      trackingNumber,
      status: initialStatus as "IN_TRANSIT" | "LABEL_CREATED",
      platformManaged: carrier.platformManaged,
      deliveryPointId: pointId,
      originPointId: originId,
      shippedAt: new Date(),
    };
    const shipment = await tx.shipment.upsert({
      where: { subOrderId },
      create: {
        subOrderId,
        ...data,
        // Buyer-QR proof of delivery works on every Hezalli Express parcel.
        deliveryCode: carrier.platformManaged ? mintDeliveryCode() : null,
      },
      update: data,
      select: { id: true, deliveryCode: true },
    });
    shipmentId = shipment.id;
    // An upserted (re-shipped) platform parcel may predate delivery codes.
    if (carrier.platformManaged && !shipment.deliveryCode) {
      await tx.shipment.update({
        where: { id: shipment.id },
        data: { deliveryCode: mintDeliveryCode() },
      });
    }
    await tx.shipmentEvent.create({
      data: {
        shipmentId: shipment.id,
        status: initialStatus,
        note:
          input.note?.trim() ||
          (pointName ? `Dropping off at ${pointName}` : null),
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

  // Hand platform-managed (Hezalli Express) parcels to the least-loaded courier
  // automatically, when enabled. Best-effort: never blocks the ship action.
  // Point-routed parcels wait — assignment happens when the point receives
  // them (lib/point-core.ts).
  if (carrier.platformManaged && shipmentId && !pointId) {
    if (await getSetting("express_auto_assign")) {
      try {
        await autoAssignShipment(shipmentId);
      } catch {
        // Auto-assign is a convenience; ops can still assign from dispatch.
      }
    }
  }

  // Courtesy ping over the buyer's linked messaging bots.
  await notifyBot(
    sub.order.buyerId,
    ar
      ? `📦 شحنت ${sub.store.name} طلبك عبر ${carrier.name}. رقم التتبع: ${trackingNumber}`
      : `📦 ${sub.store.name} shipped your order via ${carrier.name}. Tracking: ${trackingNumber}`,
  );

  revalidatePath(`/${locale}/seller/orders`);
  revalidatePath(`/${locale}/seller/orders/${subOrderId}`);
  revalidatePath(`/${locale}/account/orders`);
  revalidatePath(`/${locale}/admin/dispatch`);
  return { ok: true };
}

// Seller marks a shipped sub-order DELIVERED. The shared core handles the
// state change, COD cash capture, auto-complete countdown, and buyer
// notification; here we only enforce store ownership first.
export async function markDelivered(subOrderId: string): Promise<Result> {
  const gate = await requireSellerStore();
  if (!gate) return { error: "forbidden" };
  const locale = await getLocale();

  const owns = await prisma.subOrder.findFirst({
    where: { id: subOrderId, storeId: gate.storeId },
    select: { id: true },
  });
  if (!owns) return { error: "notFound" };

  return markSubOrderDelivered(subOrderId, "seller", locale);
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
  let trackingNumber = (input.trackingNumber ?? "").trim();
  if (!carrierId) return { error: "carrierRequired" };

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
  // Same rule as shipping: a blank number on the platform carrier mints a
  // fresh waybill (e.g. switching a mis-shipped parcel over to Express).
  if (!trackingNumber && carrier.platformManaged) {
    trackingNumber = await mintTrackingNumber();
  }
  if (trackingNumber.length < 3) return { error: "trackingRequired" };

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
