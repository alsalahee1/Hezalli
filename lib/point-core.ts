// Scan-driven custody transitions for Hezalli Delivery Points
// (docs/DELIVERY-POINTS.md). Every handover is a scan and every transition is
// race-guarded (updateMany on the expected prior status) and event-logged, so
// the ShipmentEvent trail is the chain-of-custody evidence.
//
// Callers (lib/actions/point.ts) are responsible for authorization; pointId
// here is always the *authenticated* operator's point.
import { autoAssignShipment } from "@/lib/courier-assign";
import { prisma } from "@/lib/prisma";
import { settleReturnedSubOrder } from "@/lib/return-core";
import { sendPushToUser } from "@/lib/push";
import { getSetting } from "@/lib/settings";
import { markSubOrderDelivered } from "@/lib/shipment-core";

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
      // Two-hop line-haul (docs §14): the scanning point may be the parcel's
      // ORIGIN (entry hub near the seller) or its DESTINATION.
      OR: [{ deliveryPointId: pointId }, { originPointId: pointId }],
    },
    select: {
      id: true,
      status: true,
      driverId: true,
      attemptCount: true,
      deliveryPointId: true,
      originPointId: true,
      deliveryPoint: { select: { name: true } },
      subOrder: {
        select: {
          id: true,
          status: true,
          orderId: true,
          shippingMethod: true,
          store: {
            select: {
              name: true,
              seller: {
                select: { userId: true, user: { select: { locale: true } } },
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
  // Which hop is this? Origin receives the seller drop-off (LABEL_CREATED);
  // the destination receives either the drop-off (single-hop) or the
  // line-haul arrival (IN_TRANSIT with an origin leg).
  const isOriginHop =
    parcel.originPointId === pointId && parcel.deliveryPointId !== pointId;
  const expectFrom = isOriginHop
    ? ["LABEL_CREATED"]
    : parcel.originPointId && parcel.originPointId !== pointId
      ? ["IN_TRANSIT"]
      : ["LABEL_CREATED"];
  if (!expectFrom.includes(parcel.status)) return { error: "badState" };

  const claimed = await prisma.shipment.updateMany({
    where: { id: parcel.id, status: { in: expectFrom as never } },
    data: {
      status: "AT_POINT",
      atPointId: pointId,
      ...(isOriginHop ? {} : { driverId: null }),
    },
  });
  if (claimed.count !== 1) return { error: "badState" };

  if (isOriginHop) {
    // Entry hub: log custody, tell the buyer it's moving; the last-mile
    // machinery waits until the destination point receives it.
    const originName =
      (
        await prisma.deliveryPoint.findUnique({
          where: { id: pointId },
          select: { name: true },
        })
      )?.name ?? "Hezalli Point";
    await prisma.$transaction([
      prisma.shipmentEvent.create({
        data: {
          shipmentId: parcel.id,
          status: "AT_POINT",
          location: originName,
          note: `Entered the network at ${originName} — awaiting line-haul`,
        },
      }),
      prisma.notification.create({
        data: buyerNotice(
          parcel,
          { en: "Your parcel is on its way", ar: "طردك في الطريق" },
          {
            en: `Your order from ${parcel.subOrder.store.name} entered our delivery network and is being routed to your area.`,
            ar: `دخل طلبك من ${parcel.subOrder.store.name} شبكة التوصيل لدينا وهو في طريقه إلى منطقتك.`,
          },
        ),
      }),
    ]);
    return { ok: true };
  }

  const pointName = parcel.deliveryPoint?.name ?? "Hezalli Point";
  // A PICKUP parcel's journey ends here: the buyer collects it from the
  // counter with their delivery code — no courier is ever assigned.
  const isPickup = parcel.subOrder.shippingMethod === "PICKUP";
  await prisma.$transaction([
    prisma.shipmentEvent.create({
      data: {
        shipmentId: parcel.id,
        status: "AT_POINT",
        location: pointName,
        note: isPickup
          ? `Ready for pickup at ${pointName}`
          : `Received at ${pointName}`,
      },
    }),
    prisma.notification.create({
      data: isPickup
        ? buyerNotice(
            parcel,
            {
              en: "Your order is ready for pickup",
              ar: "طلبك جاهز للاستلام",
            },
            {
              en: `Your order from ${parcel.subOrder.store.name} is waiting at ${pointName}. Bring your delivery code (in the order page) to collect it.`,
              ar: `طلبك من ${parcel.subOrder.store.name} بانتظارك في ${pointName}. أحضر رمز الاستلام (في صفحة الطلب) لاستلامه.`,
            },
          )
        : buyerNotice(
            parcel,
            {
              en: "Your parcel reached the delivery point",
              ar: "وصل طردك إلى نقطة التوصيل",
            },
            {
              en: `Your order from ${parcel.subOrder.store.name} arrived at ${pointName} and will be handed to a courier soon.`,
              ar: `وصل طلبك من ${parcel.subOrder.store.name} إلى ${pointName} وسيُسلَّم للمندوب قريبًا.`,
            },
          ),
    }),
  ]);

  // Hand it to a courier now, when auto-assign is on. Best-effort. Never for
  // pickup parcels — the buyer is the last mile.
  if (!isPickup && (await getSetting("express_auto_assign"))) {
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
  // Origin hop: this handover starts the LINE-HAUL leg (origin → destination),
  // not the last mile — allowed even for PICKUP orders.
  const isOriginHop =
    parcel.originPointId === pointId && parcel.deliveryPointId !== pointId;
  // A PICKUP parcel at its DESTINATION is collected by the buyer — never a driver.
  if (!isOriginHop && parcel.subOrder.shippingMethod === "PICKUP") {
    return { error: "pickupOnly" };
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
    data: {
      status: isOriginHop ? "IN_TRANSIT" : "OUT_FOR_DELIVERY",
      driverId: assignee,
      atPointId: null,
    },
  });
  if (claimed.count !== 1) return { error: "badState" };

  if (isOriginHop) {
    // Line-haul departure: custody moves to the transfer driver; the buyer
    // hears again when the destination point receives it.
    await prisma.$transaction([
      prisma.shipmentEvent.create({
        data: {
          shipmentId: parcel.id,
          status: "PICKED_UP",
          note: "Collected for line-haul transfer",
        },
      }),
      prisma.shipmentEvent.create({
        data: { shipmentId: parcel.id, status: "IN_TRANSIT" },
      }),
    ]);
    await sendPushToUser(assignee, {
      title: "Transfer parcel collected",
      body: "A line-haul parcel was scanned onto your run.",
      url: "/driver",
      tag: "handover",
      icon: "/driver-icon.svg",
    }).catch(() => {});
    return { ok: true };
  }

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
    icon: "/driver-icon.svg",
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
  // Failed doorstep parcels return to the DESTINATION point only.
  if (parcel.deliveryPointId !== pointId) return { error: "notFound" };
  if (parcel.subOrder.status !== "SHIPPED") return { error: "badState" };
  if (parcel.status !== "FAILED") return { error: "badState" };

  const claimed = await prisma.shipment.updateMany({
    where: { id: parcel.id, status: "FAILED" },
    data: { status: "RETURNED_TO_POINT", atPointId: pointId },
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
        {
          en: "Your parcel is back at the delivery point",
          ar: "عاد طردك إلى نقطة التوصيل",
        },
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
// reached, buyer refused for good, or a pickup was never collected). The RTS
// scan resolves the sub-order in the same step (docs §10): captured prepaid
// money is refunded to the buyer's wallet via the shared refund core; a COD
// or not-yet-captured order is simply cancelled. Both paths restock the
// returned items — the goods are back with the seller.
export async function returnParcelToSeller(
  pointId: string,
  tracking: string,
  note?: string,
): Promise<Result> {
  const parcel = await findParcel(pointId, tracking);
  if (!parcel) return { error: "notFound" };
  // RTS is a destination-point decision (an origin hub just declines receipt).
  if (parcel.deliveryPointId !== pointId) return { error: "notFound" };
  // Failed-delivery parcels RTS from RETURNED_TO_POINT; an uncollected PICKUP
  // parcel can be sent back straight from AT_POINT (operator judgment).
  const rtsFrom =
    parcel.subOrder.shippingMethod === "PICKUP"
      ? ["RETURNED_TO_POINT", "AT_POINT"]
      : ["RETURNED_TO_POINT"];
  if (!rtsFrom.includes(parcel.status)) return { error: "badState" };

  const claimed = await prisma.shipment.updateMany({
    where: { id: parcel.id, status: { in: rtsFrom as never } },
    data: { status: "RETURNED", atPointId: null },
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

  // Resolve the order itself (refund-if-captured-else-cancel + restock) — the
  // shared money-path used for every returned parcel.
  await settleReturnedSubOrder(parcel.subOrder.id);
  return { ok: true };
}

// How many failed attempts before the point should RTS (Admin → Settings).
export async function maxDeliveryAttempts(): Promise<number> {
  return getSetting("max_delivery_attempts");
}

// The buyer collects a parcel at the counter. Keyed by the buyer's delivery
// CODE (their QR), not the tracking number — presenting it is the proof of
// handover. Works for any parcel the point holds: PICKUP orders waiting for
// the buyer, or a failed-delivery parcel the buyer prefers to come fetch.
// COD cash goes onto the point's cash ledger (docs/DELIVERY-POINTS.md §6).
export async function buyerPickupAtPoint(
  pointId: string,
  code: string,
  locale: string,
): Promise<{ ok?: boolean; error?: string; codDue?: number }> {
  const c = code.trim().toUpperCase();
  if (!c) return { error: "notFound" };

  const shipment = await prisma.shipment.findFirst({
    where: {
      deliveryCode: c,
      deliveryPointId: pointId,
      platformManaged: true,
      status: { in: ["AT_POINT", "RETURNED_TO_POINT"] },
      subOrder: { status: "SHIPPED" },
    },
    select: {
      id: true,
      subOrder: {
        select: {
          id: true,
          itemsTotal: true,
          shippingTotal: true,
          discountTotal: true,
          order: { select: { paymentMethod: true } },
        },
      },
    },
  });
  if (!shipment?.subOrder) return { error: "notFound" };

  const sub = shipment.subOrder;
  const codDue =
    sub.order.paymentMethod === "COD"
      ? Math.round(
          (Number(sub.itemsTotal) +
            Number(sub.shippingTotal) -
            Number(sub.discountTotal)) *
            100,
        ) / 100
      : 0;

  const res = await markSubOrderDelivered(sub.id, "point", locale, {
    codeVerified: true,
    pickupPointId: pointId,
  });
  if (res.error) return res;
  return { ok: true, codDue };
}

// ---------------------------------------------------------------------------
// Driver collection manifest (docs §26): everything at THIS hub assigned to a
// driver, so the counter can hand a whole pickup list over in one go.
// ---------------------------------------------------------------------------

export type ManifestRow = {
  shipmentId: string;
  trackingNumber: string;
  city: string | null;
  isCod: boolean;
};

/**
 * Parcels held at this hub and assigned to the driver — the driver's pickup
 * list. Last-mile only: a PICKUP parcel at its destination belongs to the
 * buyer's counter collection, never a driver manifest (same guard as
 * handoverParcelToDriver).
 */
export async function driverManifestAtPoint(
  pointId: string,
  driverId: string,
): Promise<ManifestRow[]> {
  const rows = await prisma.shipment.findMany({
    where: {
      platformManaged: true,
      driverId,
      atPointId: pointId,
      status: { in: ["AT_POINT", "RETURNED_TO_POINT"] },
      subOrder: { status: "SHIPPED" },
      trackingNumber: { not: null },
    },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      trackingNumber: true,
      deliveryPointId: true,
      originPointId: true,
      subOrder: {
        select: {
          shippingMethod: true,
          order: {
            select: {
              paymentMethod: true,
              address: { select: { city: true } },
            },
          },
        },
      },
    },
  });
  return rows
    .filter(
      (r) =>
        !(
          r.subOrder.shippingMethod === "PICKUP" &&
          !(r.originPointId === pointId && r.deliveryPointId !== pointId)
        ),
    )
    .map((r) => ({
      shipmentId: r.id,
      trackingNumber: r.trackingNumber!,
      city: r.subOrder.order.address?.city ?? null,
      isCod: r.subOrder.order.paymentMethod === "COD",
    }));
}

/**
 * Hand the driver their whole manifest. Each parcel goes through the same
 * race-guarded handoverParcelToDriver transition — a parcel claimed by a
 * concurrent scan simply drops out and is reported as failed.
 */
export async function handoverManifestToDriver(
  pointId: string,
  driverId: string,
): Promise<{ handed: number; failed: number }> {
  const manifest = await driverManifestAtPoint(pointId, driverId);
  let handed = 0;
  let failed = 0;
  for (const row of manifest) {
    const res = await handoverParcelToDriver(
      pointId,
      row.trackingNumber,
      driverId,
    );
    if (res.ok) handed++;
    else failed++;
  }
  return { handed, failed };
}
