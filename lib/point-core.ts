// Scan-driven custody transitions for Hezalli Delivery Points
// (docs/DELIVERY-POINTS.md). Every handover is a scan and every transition is
// race-guarded (updateMany on the expected prior status) and event-logged, so
// the ShipmentEvent trail is the chain-of-custody evidence.
//
// Callers (lib/actions/point.ts) are responsible for authorization; pointId
// here is always the *authenticated* operator's point.
import { autoAssignShipment } from "@/lib/courier-assign";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { getSetting } from "@/lib/settings";

type Result = { ok?: boolean; error?: string };

// Resolve a scanned parcel: a platform-managed shipment routed through this
// point, by tracking token. Selects everything the transitions below need.
async function findParcel(pointId: string, tracking: string) {
  const t = tracking.trim();
  if (!t) return null;
  return prisma.shipment.findFirst({
    where: {
      trackingNumber: t,
      platformManaged: true,
      deliveryPointId: pointId,
    },
    select: {
      id: true,
      status: true,
      driverId: true,
      attemptCount: true,
      deliveryPoint: { select: { name: true } },
      subOrder: {
        select: {
          id: true,
          status: true,
          orderId: true,
          store: {
            select: {
              name: true,
              seller: { select: { userId: true, user: { select: { locale: true } } } },
            },
          },
          order: {
            select: { buyerId: true, buyer: { select: { locale: true } } },
          },
        },
      },
    },
  });
}

type Parcel = NonNullable<Awaited<ReturnType<typeof findParcel>>>;

function buyerNotice(
  parcel: Parcel,
  title: { en: string; ar: string },
  body: { en: string; ar: string },
) {
  const ar = parcel.subOrder.order.buyer.locale === "ar";
  return {
    userId: parcel.subOrder.order.buyerId,
    type: "SHIPMENT" as const,
    title: ar ? title.ar : title.en,
    body: ar ? body.ar : body.en,
    data: { orderId: parcel.subOrder.orderId },
  };
}

// Seller dropped the parcel off — the point takes custody. Guard: only an
// announced (LABEL_CREATED) parcel of an in-flight sub-order can be received.
// Courier auto-assignment for point-routed parcels happens here (not at ship
// time) so "nearest" dispatch sees the real destination when it matters.
export async function receiveParcelAtPoint(
  pointId: string,
  tracking: string,
): Promise<Result> {
  const parcel = await findParcel(pointId, tracking);
  if (!parcel) return { error: "notFound" };
  if (parcel.subOrder.status !== "SHIPPED") return { error: "badState" };
  if (parcel.status !== "LABEL_CREATED") return { error: "badState" };

  const claimed = await prisma.shipment.updateMany({
    where: { id: parcel.id, status: "LABEL_CREATED" },
    data: { status: "AT_POINT" },
  });
  if (claimed.count !== 1) return { error: "badState" };

  const pointName = parcel.deliveryPoint?.name ?? "Hezalli Point";
  await prisma.$transaction([
    prisma.shipmentEvent.create({
      data: {
        shipmentId: parcel.id,
        status: "AT_POINT",
        location: pointName,
        note: `Received at ${pointName}`,
      },
    }),
    prisma.notification.create({
      data: buyerNotice(
        parcel,
        { en: "Your parcel reached the delivery point", ar: "وصل طردك إلى نقطة التوصيل" },
        {
          en: `Your order from ${parcel.subOrder.store.name} arrived at ${pointName} and will be handed to a courier soon.`,
          ar: `وصل طلبك من ${parcel.subOrder.store.name} إلى ${pointName} وسيُسلَّم للمندوب قريبًا.`,
        },
      ),
    }),
  ]);

  // Hand it to a courier now, when auto-assign is on. Best-effort.
  if (await getSetting("express_auto_assign")) {
    try {
      await autoAssignShipment(parcel.id);
    } catch {
      // Ops/point staff can still assign at handover.
    }
  }
  return { ok: true };
}

// Point staff hand the parcel to a courier (the "collection" scan). Guard:
// only a parcel held by the point (AT_POINT / RETURNED_TO_POINT). If the
// parcel is unassigned, the staff-picked driverId claims it; if assigned, a
// mismatching driver is rejected — the parcel belongs on another manifest.
export async function handoverParcelToDriver(
  pointId: string,
  tracking: string,
  driverId?: string,
): Promise<Result> {
  const parcel = await findParcel(pointId, tracking);
  if (!parcel) return { error: "notFound" };
  if (parcel.subOrder.status !== "SHIPPED") return { error: "badState" };
  if (parcel.status !== "AT_POINT" && parcel.status !== "RETURNED_TO_POINT") {
    return { error: "badState" };
  }

  let assignee = parcel.driverId;
  const picked = driverId?.trim();
  if (assignee) {
    if (picked && picked !== assignee) return { error: "wrongDriver" };
  } else {
    if (!picked) return { error: "driverRequired" };
    const driver = await prisma.user.findUnique({
      where: { id: picked },
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
    assignee = picked;
  }

  const claimed = await prisma.shipment.updateMany({
    where: {
      id: parcel.id,
      status: { in: ["AT_POINT", "RETURNED_TO_POINT"] },
    },
    data: { status: "OUT_FOR_DELIVERY", driverId: assignee },
  });
  if (claimed.count !== 1) return { error: "badState" };

  const pointName = parcel.deliveryPoint?.name ?? "Hezalli Point";
  await prisma.$transaction([
    // The scan is both the pickup and the start of the run — log both hops so
    // the public timeline reads naturally.
    prisma.shipmentEvent.create({
      data: {
        shipmentId: parcel.id,
        status: "PICKED_UP",
        location: pointName,
        note: `Collected from ${pointName}`,
      },
    }),
    prisma.shipmentEvent.create({
      data: { shipmentId: parcel.id, status: "OUT_FOR_DELIVERY" },
    }),
    prisma.notification.create({
      data: buyerNotice(
        parcel,
        { en: "Your order is out for delivery", ar: "طلبك في الطريق إليك" },
        {
          en: `Your order from ${parcel.subOrder.store.name} left ${pointName} with a courier.`,
          ar: `خرج طلبك من ${parcel.subOrder.store.name} من ${pointName} مع المندوب.`,
        },
      ),
    }),
  ]);

  await sendPushToUser(assignee, {
    title: "Parcel collected",
    body: "A parcel was scanned onto your delivery run.",
    url: "/driver",
    tag: "handover",
  }).catch(() => {});
  return { ok: true };
}

// A failed parcel comes back from the driver — the point takes custody again.
// The failure reason was already recorded by courierFailDelivery; this scan
// closes the custody loop and tells the buyer they can reschedule.
export async function receiveReturnAtPoint(
  pointId: string,
  tracking: string,
  note?: string,
): Promise<Result> {
  const parcel = await findParcel(pointId, tracking);
  if (!parcel) return { error: "notFound" };
  if (parcel.subOrder.status !== "SHIPPED") return { error: "badState" };
  if (parcel.status !== "FAILED") return { error: "badState" };

  const claimed = await prisma.shipment.updateMany({
    where: { id: parcel.id, status: "FAILED" },
    data: { status: "RETURNED_TO_POINT" },
  });
  if (claimed.count !== 1) return { error: "badState" };

  const pointName = parcel.deliveryPoint?.name ?? "Hezalli Point";
  await prisma.$transaction([
    prisma.shipmentEvent.create({
      data: {
        shipmentId: parcel.id,
        status: "RETURNED_TO_POINT",
        location: pointName,
        note: note?.trim() || `Back at ${pointName}`,
      },
    }),
    prisma.notification.create({
      data: buyerNotice(
        parcel,
        { en: "Your parcel is back at the delivery point", ar: "عاد طردك إلى نقطة التوصيل" },
        {
          en: `We couldn't deliver your order from ${parcel.subOrder.store.name}. It's held at ${pointName} — open the order to pick a new delivery day.`,
          ar: `تعذّر توصيل طلبك من ${parcel.subOrder.store.name} وهو الآن في ${pointName} — افتح الطلب لاختيار يوم توصيل جديد.`,
        },
      ),
    }),
  ]);
  return { ok: true };
}

// Terminal RTS: the point sends the parcel back to the seller (attempt limit
// reached or the buyer refused for good). The sub-order stays for ops to
// resolve with the existing cancel/refund tools — no automatic refund in v1.
export async function returnParcelToSeller(
  pointId: string,
  tracking: string,
  note?: string,
): Promise<Result> {
  const parcel = await findParcel(pointId, tracking);
  if (!parcel) return { error: "notFound" };
  if (parcel.status !== "RETURNED_TO_POINT") return { error: "badState" };

  const claimed = await prisma.shipment.updateMany({
    where: { id: parcel.id, status: "RETURNED_TO_POINT" },
    data: { status: "RETURNED" },
  });
  if (claimed.count !== 1) return { error: "badState" };

  const pointName = parcel.deliveryPoint?.name ?? "Hezalli Point";
  const seller = parcel.subOrder.store.seller;
  const sellerAr = seller?.user?.locale === "ar";
  await prisma.$transaction([
    prisma.shipmentEvent.create({
      data: {
        shipmentId: parcel.id,
        status: "RETURNED",
        location: pointName,
        note: note?.trim() || "Returning to seller",
      },
    }),
    ...(seller
      ? [
          prisma.notification.create({
            data: {
              userId: seller.userId,
              type: "SHIPMENT",
              title: sellerAr
                ? "طرد مرتجع بانتظار الاستلام"
                : "A parcel is being returned to you",
              body: sellerAr
                ? `تعذّر توصيل أحد طلباتك بعد ${parcel.attemptCount} محاولة، وهو بانتظار استلامك من ${pointName}.`
                : `A parcel couldn't be delivered after ${parcel.attemptCount} attempt(s) and is waiting for you at ${pointName}.`,
              data: { subOrderId: parcel.subOrder.id },
            },
          }),
        ]
      : []),
  ]);
  return { ok: true };
}

// How many failed attempts before the point should RTS (Admin → Settings).
export async function maxDeliveryAttempts(): Promise<number> {
  return getSetting("max_delivery_attempts");
}
