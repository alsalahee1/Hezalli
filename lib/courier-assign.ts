// Auto-assignment for Hezalli Express. When a platform-managed parcel is
// shipped it can be handed to a courier automatically:
//   - "balanced": the least-loaded active courier (fewest in-flight jobs)
//   - "nearest":  when the parcel's address has pinned coordinates and couriers
//                 have shared theirs, the closest by true (haversine) distance,
//                 tie-broken by load; otherwise a courier in the destination
//                 governorate (locality), then least-loaded among those; else
//                 global least-loaded. Ops can always reassign from dispatch.
//
// The hand-off is an OFFER, not an order (docs/EXPRESS-DELIVERY.md): the
// chosen driver gets `courier_offer_timeout_minutes` to accept (a tap, or
// implicitly their first scan) or decline. A declined/expired offer cascades
// to the next-best courier, excluding everyone who already said no; when
// `courier_offer_max_rounds` drivers have been tried — or nobody eligible is
// left — dispatch staff are alerted once to assign by hand. Outside
// `dispatch_hours_*` nothing is offered: parcels queue and go out with the
// first sweep after opening (lib/offer-sweep.ts), so night orders wait for
// the morning wave instead of pinging sleeping drivers.
import { codBlockedCourierIds } from "@/lib/cod-guard";
import { courierAcceptanceStats } from "@/lib/courier-reliability";
import { isDispatchOpen } from "@/lib/dispatch-hours";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings, getSetting } from "@/lib/settings";
import { haversineKm } from "@/lib/yemen-geo";

export type AssignStrategy = "balanced" | "nearest";

/**
 * Shipment statuses in which the offered driver has NOT physically started
 * the job — the only window where an offer may still be declined or expired.
 * A direct parcel sits IN_TRANSIT from the ship action until the driver's
 * pickup scan; a point-routed parcel is held by the hub (AT_POINT /
 * RETURNED_TO_POINT) until the collection scan. Anything past these means the
 * driver acted, which counts as an implicit accept.
 */
export function offerOpenStatuses(
  deliveryPointId: string | null,
): (
  "PENDING" | "LABEL_CREATED" | "IN_TRANSIT" | "AT_POINT" | "RETURNED_TO_POINT"
)[] {
  return deliveryPointId
    ? ["AT_POINT", "RETURNED_TO_POINT"]
    : ["PENDING", "LABEL_CREATED", "IN_TRANSIT"];
}
type CourierLoad = {
  id: string;
  load: number;
  // 90-day offer acceptance rate (1 with no history — a new driver starts
  // trusted). Breaks ranking ties after load; the hard gate is applied before
  // ranking (see activeCouriersWithLoad).
  rate: number;
  governorate: string | null;
  lat: number | null;
  lng: number | null;
};

async function activeCouriersWithLoad(
  excludeIds?: ReadonlySet<string>,
): Promise<CourierLoad[]> {
  let couriers = await prisma.user.findMany({
    where: { roles: { has: "COURIER" }, isSuspended: false, deletedAt: null },
    select: {
      id: true,
      courierLocation: { select: { governorate: true, lat: true, lng: true } },
    },
  });
  // Drivers who already declined (or let expire) an offer for this parcel are
  // out of the running — a cascade must move forward, never bounce back.
  if (excludeIds?.size) {
    couriers = couriers.filter((c) => !excludeIds.has(c.id));
  }
  if (couriers.length === 0) return [];

  // COD credit control: drivers over the cash limit or sitting on overdue
  // COD don't get new work until they remit (lib/cod-guard.ts). Dispatch can
  // still assign manually — this gates the automatic paths only.
  const codBlocked = await codBlockedCourierIds(couriers.map((c) => c.id));
  let eligible = couriers.filter((c) => !codBlocked.has(c.id));
  if (eligible.length === 0) return [];

  // Reliability (lib/courier-reliability.ts): with the gate configured,
  // chronic decliners — enough answered offers, acceptance under the floor —
  // stop receiving auto-offers, same manual-dispatch escape hatch as the COD
  // guard. The rate itself also feeds ranking below.
  const stats = await courierAcceptanceStats(eligible.map((c) => c.id));
  const settings = await getPlatformSettings();
  const minRate = settings.driver_min_acceptance_rate / 100;
  const minOffers = settings.driver_acceptance_min_offers;
  if (minRate > 0) {
    eligible = eligible.filter((c) => {
      const s = stats.get(c.id);
      return !s || s.responded < minOffers || (s.rate ?? 1) >= minRate;
    });
    if (eligible.length === 0) return [];
  }

  const ids = eligible.map((c) => c.id);
  const loads = await prisma.shipment.groupBy({
    by: ["driverId"],
    where: { driverId: { in: ids }, subOrder: { status: "SHIPPED" } },
    _count: { _all: true },
  });
  const loadBy = new Map(loads.map((l) => [l.driverId, l._count._all]));
  return eligible.map((c) => ({
    id: c.id,
    load: loadBy.get(c.id) ?? 0,
    rate: stats.get(c.id)?.rate ?? 1,
    governorate: c.courierLocation?.governorate ?? null,
    lat: c.courierLocation?.lat ?? null,
    lng: c.courierLocation?.lng ?? null,
  }));
}

// Fewest active jobs wins; ties go to the more reliable driver, then id for
// deterministic behavior.
function leastLoaded(list: CourierLoad[]): string | null {
  if (list.length === 0) return null;
  return [...list].sort(
    (a, b) => a.load - b.load || b.rate - a.rate || a.id.localeCompare(b.id),
  )[0].id;
}

/** The active courier with the fewest in-flight deliveries, or null. */
export async function pickLeastLoadedCourierId(): Promise<string | null> {
  return leastLoaded(await activeCouriersWithLoad());
}

/**
 * Choose a courier for a parcel. With "nearest": rank by true distance when the
 * destination has pinned coordinates and couriers have shared theirs; else by
 * destination-governorate locality; else global least-loaded. "balanced" always
 * uses global least-loaded.
 */
export async function pickCourierForShipment(
  destGovernorate: string | null,
  strategy: AssignStrategy,
  destCoords?: { lat: number | null; lng: number | null } | null,
  excludeIds?: ReadonlySet<string>,
): Promise<string | null> {
  const all = await activeCouriersWithLoad(excludeIds);
  if (all.length === 0) return null;

  if (strategy === "nearest") {
    // 1. True point-to-point distance, when both sides have coordinates.
    if (destCoords?.lat != null && destCoords.lng != null) {
      const withCoords = all.filter((c) => c.lat != null && c.lng != null);
      if (withCoords.length > 0) {
        const dLat = destCoords.lat;
        const dLng = destCoords.lng;
        return [...withCoords].sort(
          (a, b) =>
            haversineKm(dLat, dLng, a.lat!, a.lng!) -
              haversineKm(dLat, dLng, b.lat!, b.lng!) ||
            a.load - b.load ||
            b.rate - a.rate ||
            a.id.localeCompare(b.id),
        )[0].id;
      }
    }
    // 2. Governorate locality.
    if (destGovernorate) {
      const local = all.filter((c) => c.governorate === destGovernorate);
      if (local.length > 0) return leastLoaded(local);
    }
  }
  return leastLoaded(all);
}

/**
 * Offer a shipment to a courier per the platform strategy (only if currently
 * unassigned) and notify them. With `courier_offer_timeout_minutes` > 0 the
 * driver gets an accept/decline window (a ShipmentOffer row); at 0 this is the
 * classic forced assignment. Outside dispatch hours nothing happens — the
 * parcel queues for the morning wave (lib/offer-sweep.ts). Best-effort:
 * returns the chosen driver id, or null when nothing was offered.
 */
export async function autoAssignShipment(
  shipmentId: string,
): Promise<string | null> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      driverId: true,
      offers: { select: { driverId: true } },
      subOrder: {
        select: {
          order: {
            select: {
              address: {
                select: { governorate: true, lat: true, lng: true },
              },
            },
          },
        },
      },
    },
  });
  if (!shipment || shipment.driverId) return null;

  const settings = await getPlatformSettings();
  // Night orders wait: no offers outside the dispatch window. The offer sweep
  // picks the parcel up in its first run after opening.
  if (
    !isDispatchOpen(settings.dispatch_hours_start, settings.dispatch_hours_end)
  ) {
    return null;
  }

  const declined = new Set(shipment.offers.map((o) => o.driverId));
  const addr = shipment.subOrder?.order.address;
  const driverId = await pickCourierForShipment(
    addr?.governorate ?? null,
    settings.courier_assign_strategy === "nearest" ? "nearest" : "balanced",
    addr ? { lat: addr.lat, lng: addr.lng } : null,
    declined,
  );
  if (!driverId) return null;

  // Guard against a race: only claim it while still unassigned.
  const claimed = await prisma.shipment.updateMany({
    where: { id: shipmentId, driverId: null },
    data: { driverId },
  });
  if (claimed.count !== 1) return null;

  const offerMinutes = settings.courier_offer_timeout_minutes;
  const offered = offerMinutes > 0;
  if (offered) {
    // Upsert keeps a crashed/re-run hand-off idempotent for the same driver.
    await prisma.shipmentOffer.upsert({
      where: { shipmentId_driverId: { shipmentId, driverId } },
      create: {
        shipmentId,
        driverId,
        expiresAt: new Date(Date.now() + offerMinutes * 60_000),
      },
      update: {
        status: "OFFERED",
        reason: null,
        respondedAt: null,
        expiresAt: new Date(Date.now() + offerMinutes * 60_000),
      },
    });
  }

  const driver = await prisma.user.findUnique({
    where: { id: driverId },
    select: { locale: true },
  });
  const ar = driver?.locale === "ar";
  await notify({
    userId: driverId,
    type: "SHIPMENT",
    title: offered
      ? ar
        ? "عرض توصيل جديد"
        : "New delivery offer"
      : ar
        ? "تم إسناد توصيلة جديدة إليك"
        : "New delivery assigned",
    body: offered
      ? ar
        ? `لديك ${offerMinutes} دقيقة لقبول أو رفض توصيلة هزّلي إكسبرس.`
        : `You have ${offerMinutes} minutes to accept or decline a Hezalli Express delivery.`
      : ar
        ? "أُسندت إليك توصيلة هزّلي إكسبرس تلقائيًا."
        : "A Hezalli Express delivery was auto-assigned to you.",
    link: "/driver",
  }).catch(() => {});
  return driverId;
}

// One-shot escalation: when the offer cascade runs dry (rounds exhausted or
// nobody eligible left), tell DELIVERY_MANAGER + ADMIN to assign by hand —
// same pattern as the stuck-shipment sweep. A manual dispatch assignment
// clears the flag so a re-stranded parcel can alert again.
async function escalateAssignment(shipmentId: string): Promise<void> {
  const flagged = await prisma.shipment.updateMany({
    where: { id: shipmentId, assignmentEscalatedAt: null },
    data: { assignmentEscalatedAt: new Date() },
  });
  if (flagged.count !== 1) return;

  const staff = await prisma.user.findMany({
    where: {
      isSuspended: false,
      deletedAt: null,
      roles: { hasSome: ["DELIVERY_MANAGER", "ADMIN"] },
    },
    select: { id: true, locale: true },
  });
  await Promise.all(
    staff.map((u) => {
      const ar = u.locale === "ar";
      return notify({
        userId: u.id,
        type: "SHIPMENT",
        title: ar
          ? "طرد بلا مندوب — يحتاج تعيينًا يدويًا"
          : "Parcel needs manual dispatch",
        body: ar
          ? "لم يقبل أي مندوب هذا الطرد (رفض أو انتهت المهلة). عيّنه يدويًا من لوحة التوزيع."
          : "No courier accepted this parcel (declined or timed out). Assign it manually from dispatch.",
        link: "/admin/dispatch",
      }).catch(() => {});
    }),
  );
}

/**
 * Move a parcel to the next courier after a declined or expired offer. Stops
 * and alerts dispatch (one-shot) when `courier_offer_max_rounds` drivers have
 * been tried, or when nobody eligible is left during dispatch hours. Returns
 * the newly offered driver id, or null when the cascade ran dry / is queued
 * for the next dispatch window.
 */
export async function cascadeShipmentOffer(
  shipmentId: string,
): Promise<string | null> {
  const [maxRounds, tried] = await Promise.all([
    getSetting("courier_offer_max_rounds"),
    prisma.shipmentOffer.count({ where: { shipmentId } }),
  ]);
  if (tried >= maxRounds) {
    await escalateAssignment(shipmentId);
    return null;
  }
  const driverId = await autoAssignShipment(shipmentId);
  if (!driverId) {
    // Nobody left to try — but only escalate while dispatch is open; a null
    // outside the window just means the parcel queued for the morning wave.
    const s = await getPlatformSettings();
    if (isDispatchOpen(s.dispatch_hours_start, s.dispatch_hours_end)) {
      await escalateAssignment(shipmentId);
    }
  }
  return driverId;
}
