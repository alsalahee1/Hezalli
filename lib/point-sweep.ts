// Stale-parcel sweep (docs/DELIVERY-POINTS.md §20). Notifications only — the
// operator's RTS scan stays the single human-verified trigger for refunds and
// cancellation, so this sweep can never move money on its own.
//
// Staleness = Shipment.updatedAt age, the same signal as the point dashboard's
// v1.6 badges. Each phase is one-shot per parcel via the pickupRemindedAt /
// staleFlaggedAt guards (claimed with a race-safe updateMany before the
// notification is written), so re-running the sweep is harmless.
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

const DAY_MS = 86_400_000;
const BATCH = 200; // per-phase cap per run; the next run picks up the rest

export type SweepResult = {
  reminded: number; // buyers nudged to collect a waiting PUDO parcel
  expired: number; // pickup windows lapsed (buyer + hub + seller told)
  flagged: number; // stuck courier parcels flagged to the holding hub
};

const parcelSelect = {
  id: true,
  trackingNumber: true,
  atPointId: true,
  subOrder: {
    select: {
      orderId: true,
      order: {
        select: { buyerId: true, buyer: { select: { locale: true } } },
      },
      store: {
        select: {
          name: true,
          seller: {
            select: { userId: true, user: { select: { locale: true } } },
          },
        },
      },
    },
  },
} as const;

type Parcel = {
  id: string;
  trackingNumber: string | null;
  atPointId: string | null;
  subOrder: {
    orderId: string;
    order: { buyerId: string; buyer: { locale: string | null } };
    store: {
      name: string;
      seller: { userId: string; user: { locale: string | null } } | null;
    };
  };
};

// Hub name + owner for every point holding a swept parcel, in one query.
async function pointsById(parcels: Parcel[]) {
  const ids = [...new Set(parcels.map((p) => p.atPointId).filter(Boolean))];
  if (ids.length === 0) return new Map<string, PointInfo>();
  const rows = await prisma.deliveryPoint.findMany({
    where: { id: { in: ids as string[] } },
    select: {
      id: true,
      name: true,
      ownerId: true,
      owner: { select: { locale: true } },
    },
  });
  return new Map(rows.map((r) => [r.id, r]));
}
type PointInfo = {
  id: string;
  name: string;
  ownerId: string;
  owner: { locale: string | null };
};

// Claim a one-shot guard; false = another run already handled this parcel.
// Raw SQL on purpose: Prisma's @updatedAt would bump updatedAt and reset the
// staleness clock (and the dashboard age badges) on every claim.
async function claim(
  shipmentId: string,
  field: "pickupRemindedAt" | "staleFlaggedAt",
): Promise<boolean> {
  const count =
    field === "pickupRemindedAt"
      ? await prisma.$executeRaw`UPDATE "Shipment" SET "pickupRemindedAt" = NOW() WHERE "id" = ${shipmentId} AND "pickupRemindedAt" IS NULL`
      : await prisma.$executeRaw`UPDATE "Shipment" SET "staleFlaggedAt" = NOW() WHERE "id" = ${shipmentId} AND "staleFlaggedAt" IS NULL`;
  return count > 0;
}

/** Run all three sweep phases; safe to call as often as you like. */
export async function sweepPointParcels(): Promise<SweepResult> {
  const [staleDays, windowDays] = await Promise.all([
    getSetting("stale_parcel_days"),
    getSetting("pickup_window_days"),
  ]);
  const staleBefore = new Date(Date.now() - staleDays * DAY_MS);
  const windowBefore = new Date(Date.now() - windowDays * DAY_MS);

  // Phase 1 — pickup window lapsed: tell the buyer, and prompt the hub +
  // seller to run the normal RTS scan (which resolves refund/cancel/restock).
  // Runs BEFORE the reminder phase so an already-lapsed parcel doesn't get a
  // "collect it soon" nudge and an expiry notice in the same sweep.
  const toExpire = (await prisma.shipment.findMany({
    where: {
      platformManaged: true,
      status: "AT_POINT",
      atPointId: { not: null },
      staleFlaggedAt: null,
      updatedAt: { lte: windowBefore },
      subOrder: { shippingMethod: "PICKUP" },
    },
    select: parcelSelect,
    take: BATCH,
  })) as Parcel[];
  let expired = 0;
  const expirePoints = await pointsById(toExpire);
  for (const p of toExpire) {
    if (!(await claim(p.id, "staleFlaggedAt"))) continue;
    const point = expirePoints.get(p.atPointId!);
    const store = p.subOrder.store;
    const buyerAr = p.subOrder.order.buyer.locale === "ar";
    const tracking = p.trackingNumber ?? "";
    await notify({
      userId: p.subOrder.order.buyerId,
      type: "SHIPMENT",
      title: buyerAr ? "انتهت مهلة الاستلام" : "Pickup window expired",
      body: buyerAr
        ? `لم يُستلم طلبك من ${store.name} خلال ${windowDays} أيام وسيُعاد إلى البائع.`
        : `Your order from ${store.name} wasn't collected within ${windowDays} days and will be returned to the seller.`,
      data: { orderId: p.subOrder.orderId },
    });
    if (point) {
      const ownerAr = point.owner.locale === "ar";
      await notify({
        userId: point.ownerId,
        type: "SHIPMENT",
        title: ownerAr ? "انتهت مهلة استلام طرد" : "Pickup window expired",
        body: ownerAr
          ? `الطرد ${tracking} لم يُستلم خلال ${windowDays} أيام — امسحه كإرجاع إلى البائع.`
          : `Parcel ${tracking} wasn't collected within ${windowDays} days — scan it as return-to-seller.`,
        data: { shipmentId: p.id },
      });
    }
    if (store.seller) {
      const sellerAr = store.seller.user.locale === "ar";
      await notify({
        userId: store.seller.userId,
        type: "SHIPMENT",
        title: sellerAr ? "طرد لم يُستلم" : "Parcel not collected",
        body: sellerAr
          ? `الطرد ${tracking} (${store.name}) لم يُستلم من نقطة الاستلام وسيُعاد إليك.`
          : `Parcel ${tracking} (${store.name}) wasn't collected from the pickup point and will be returned to you.`,
        data: { shipmentId: p.id },
      });
    }
    expired++;
  }

  // Phase 2 — remind buyers their PUDO parcel is waiting at the counter.
  // Skips anything the expiry phase already flagged.
  const toRemind = (await prisma.shipment.findMany({
    where: {
      platformManaged: true,
      status: "AT_POINT",
      atPointId: { not: null },
      pickupRemindedAt: null,
      staleFlaggedAt: null,
      updatedAt: { lte: staleBefore },
      subOrder: { shippingMethod: "PICKUP" },
    },
    select: parcelSelect,
    take: BATCH,
  })) as Parcel[];
  let reminded = 0;
  const remindPoints = await pointsById(toRemind);
  for (const p of toRemind) {
    if (!(await claim(p.id, "pickupRemindedAt"))) continue;
    const hub = remindPoints.get(p.atPointId!)?.name ?? "";
    const ar = p.subOrder.order.buyer.locale === "ar";
    await notify({
      userId: p.subOrder.order.buyerId,
      type: "SHIPMENT",
      title: ar ? "طردك بانتظارك" : "Your parcel is waiting",
      body: ar
        ? `طلبك من ${p.subOrder.store.name} جاهز للاستلام في ${hub}. يرجى استلامه قريبًا.`
        : `Your order from ${p.subOrder.store.name} is ready at ${hub}. Please collect it soon.`,
      data: { orderId: p.subOrder.orderId },
    });
    reminded++;
  }

  // Phase 3 — courier-routed parcels stuck at a hub: nudge the operator once.
  const toFlag = (await prisma.shipment.findMany({
    where: {
      platformManaged: true,
      status: { in: ["AT_POINT", "RETURNED_TO_POINT"] },
      atPointId: { not: null },
      staleFlaggedAt: null,
      updatedAt: { lte: staleBefore },
      subOrder: { shippingMethod: { not: "PICKUP" } },
    },
    select: parcelSelect,
    take: BATCH,
  })) as Parcel[];
  let flagged = 0;
  const flagPoints = await pointsById(toFlag);
  for (const p of toFlag) {
    if (!(await claim(p.id, "staleFlaggedAt"))) continue;
    const point = flagPoints.get(p.atPointId!);
    if (!point) continue;
    const ar = point.owner.locale === "ar";
    const tracking = p.trackingNumber ?? "";
    await notify({
      userId: point.ownerId,
      type: "SHIPMENT",
      title: ar ? "طرد متوقف في نقطتك" : "Parcel stuck at your hub",
      body: ar
        ? `الطرد ${tracking} لم يتحرك منذ ${staleDays}+ أيام — سلّمه لسائق أو أعده إلى البائع.`
        : `Parcel ${tracking} hasn't moved in ${staleDays}+ days — hand it to a driver or return it to the seller.`,
      data: { shipmentId: p.id },
    });
    flagged++;
  }

  return { reminded, expired, flagged };
}
