// Auto-assignment for Hezalli Express. When a platform-managed parcel is
// shipped it can be handed to a courier automatically:
//   - "balanced": the least-loaded active courier (fewest in-flight jobs)
//   - "nearest":  when the parcel's address has pinned coordinates and couriers
//                 have shared theirs, the closest by true (haversine) distance,
//                 tie-broken by load; otherwise a courier in the destination
//                 governorate (locality), then least-loaded among those; else
//                 global least-loaded. Ops can always reassign from dispatch.
//
// Two refinements apply under both strategies (lib/courier-capacity.ts):
//   - Capacity: couriers whose vehicle can't take the parcel — too heavy, too
//     bulky, or too long for the vehicle, or the driver is already at their
//     weight/volume/parcel limit — are skipped. If nobody fits, the parcel
//     stays unassigned for dispatch.
//   - Batching: a courier already carrying a parcel to the same destination
//     governorate is preferred over everyone else, so orders heading the same
//     way ride on one trip instead of fanning out across the fleet.
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
import { QUALITY_BADGE_IDS } from "@/lib/courier-badges";
import {
  effectiveVehicleCapacity,
  hasRoomFor,
  type ParcelMetrics,
  subOrderMetric,
  subOrderMetrics,
  type VehicleCapacity,
  ZERO_METRICS,
} from "@/lib/courier-capacity";
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

export type CourierLoad = {
  id: string;
  load: number;
  loadWeightGrams: number;
  loadVolumeCm3: number;
  vehicleType: string | null;
  // 90-day offer acceptance rate (1 with no history — a new driver starts
  // trusted). Breaks ranking ties after load; the hard gate is applied before
  // ranking (see activeCouriersWithLoad).
  rate: number;
  // Earned quality badges (lib/courier-badges.ts). With
  // badge_priority_dispatch on, equally loaded/near couriers rank badge
  // holders first — the perk never overrides load balancing or distance.
  badges: number;
  governorate: string | null;
  lat: number | null;
  lng: number | null;
  // Destination governorates of the parcels this courier is carrying now —
  // the batching signal ("they're already driving there").
  activeGovernorates: ReadonlySet<string>;
};

async function activeCouriersWithLoad(
  excludeIds?: ReadonlySet<string>,
): Promise<CourierLoad[]> {
  let couriers = await prisma.user.findMany({
    where: {
      roles: { has: "COURIER" },
      isSuspended: false,
      deletedAt: null,
      // Vacation mode: paused drivers get no automatic work of any kind.
      courierPausedAt: null,
    },
    select: {
      id: true,
      courierVehicleType: true,
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

  // In-flight parcels with their destination and weight, so a driver's load is
  // known in kilos, liters, and destinations — not just a count.
  const ids = eligible.map((c) => c.id);
  const [active, awards] = await Promise.all([
    prisma.shipment.findMany({
      where: { driverId: { in: ids }, subOrder: { status: "SHIPPED" } },
      select: {
        driverId: true,
        subOrderId: true,
        subOrder: {
          select: {
            order: { select: { address: { select: { governorate: true } } } },
          },
        },
      },
    }),
    // Quality-badge counts for priority dispatch (tie-break only).
    settings.badge_priority_dispatch
      ? prisma.courierBadgeAward.groupBy({
          by: ["courierId"],
          where: {
            courierId: { in: ids },
            badgeId: { in: [...QUALITY_BADGE_IDS] },
          },
          _count: { _all: true },
        })
      : [],
  ]);
  const badgesBy = new Map(awards.map((a) => [a.courierId, a._count._all]));
  const metrics = await subOrderMetrics(active.map((s) => s.subOrderId));

  const byDriver = new Map<
    string,
    { load: number; weight: number; volume: number; govs: Set<string> }
  >();
  for (const s of active) {
    if (!s.driverId) continue;
    const cur = byDriver.get(s.driverId) ?? {
      load: 0,
      weight: 0,
      volume: 0,
      govs: new Set<string>(),
    };
    cur.load += 1;
    const m = metrics.get(s.subOrderId) ?? ZERO_METRICS;
    cur.weight += m.weightGrams;
    cur.volume += m.volumeCm3;
    const gov = s.subOrder?.order.address?.governorate;
    if (gov) cur.govs.add(gov);
    byDriver.set(s.driverId, cur);
  }

  return eligible.map((c) => {
    const cur = byDriver.get(c.id);
    return {
      id: c.id,
      load: cur?.load ?? 0,
      loadWeightGrams: cur?.weight ?? 0,
      loadVolumeCm3: cur?.volume ?? 0,
      vehicleType: c.courierVehicleType,
      rate: stats.get(c.id)?.rate ?? 1,
      badges: badgesBy.get(c.id) ?? 0,
      governorate: c.courierLocation?.governorate ?? null,
      lat: c.courierLocation?.lat ?? null,
      lng: c.courierLocation?.lng ?? null,
      activeGovernorates: cur?.govs ?? new Set<string>(),
    };
  });
}

// Fewest active jobs wins; ties go to the driver with more quality badges,
// then the more reliable one, then id for deterministic behavior.
function leastLoaded(list: CourierLoad[]): string | null {
  if (list.length === 0) return null;
  return [...list].sort(
    (a, b) =>
      a.load - b.load ||
      b.badges - a.badges ||
      b.rate - a.rate ||
      a.id.localeCompare(b.id),
  )[0].id;
}

/** The active courier with the fewest in-flight deliveries, or null. */
export async function pickLeastLoadedCourierId(): Promise<string | null> {
  return leastLoaded(await activeCouriersWithLoad());
}

export type ParcelInfo = {
  destGovernorate: string | null;
  destCoords?: { lat: number | null; lng: number | null } | null;
  metrics?: ParcelMetrics;
};

/**
 * Pure ranking core of pickCourierForShipment, exported for tests.
 *
 * 1. Drop couriers without room for the parcel (vehicle weight/volume/parcel
 *    limits, and its longest item must physically fit the vehicle).
 * 2. Prefer a courier already delivering to the destination governorate
 *    (batching) — they're making that trip anyway, capacity permitting.
 * 3. Within that, the strategy's usual order: distance (nearest) or load,
 *    with quality-badge holders, then the more reliable driver, winning ties.
 */
export function pickFrom(
  list: CourierLoad[],
  strategy: AssignStrategy,
  parcel: ParcelInfo,
  capacityTable?: Record<string, VehicleCapacity>,
): string | null {
  const metrics = parcel.metrics ?? ZERO_METRICS;
  // Oversized freight (sofas, wardrobes) never auto-assigns: it needs crew
  // planning, so it always goes through manual dispatch (the null triggers
  // the same escalation path as "nobody eligible").
  if (metrics.oversized) return null;
  const capable = list.filter((c) => hasRoomFor(c, metrics, capacityTable));
  if (capable.length === 0) return null;

  const gov = parcel.destGovernorate;
  // Freight is appointment-bound — a truck run is one or two big items, not a
  // parcel round — so it doesn't ride the same-destination batching bonus.
  const batched = (c: CourierLoad) =>
    !metrics.freight && gov && c.activeGovernorates.has(gov) ? 0 : 1;
  const best = (candidates: CourierLoad[]) =>
    [...candidates].sort(
      (a, b) =>
        batched(a) - batched(b) ||
        a.load - b.load ||
        b.badges - a.badges ||
        b.rate - a.rate ||
        a.id.localeCompare(b.id),
    )[0].id;

  if (strategy === "nearest") {
    // 1. True point-to-point distance, when both sides have coordinates.
    const dLat = parcel.destCoords?.lat;
    const dLng = parcel.destCoords?.lng;
    if (dLat != null && dLng != null) {
      const withCoords = capable.filter((c) => c.lat != null && c.lng != null);
      if (withCoords.length > 0) {
        return [...withCoords].sort(
          (a, b) =>
            batched(a) - batched(b) ||
            haversineKm(dLat, dLng, a.lat!, a.lng!) -
              haversineKm(dLat, dLng, b.lat!, b.lng!) ||
            a.load - b.load ||
            b.badges - a.badges ||
            b.rate - a.rate ||
            a.id.localeCompare(b.id),
        )[0].id;
      }
    }
    // 2. Governorate locality.
    if (gov) {
      const local = capable.filter((c) => c.governorate === gov);
      if (local.length > 0) return best(local);
    }
  }
  return best(capable);
}

/**
 * Choose a courier for a parcel. With "nearest": rank by true distance when the
 * destination has pinned coordinates and couriers have shared theirs; else by
 * destination-governorate locality; else global least-loaded. "balanced" always
 * uses global least-loaded. Both strategies filter by vehicle capacity and
 * prefer a courier already headed to the destination governorate (see
 * pickFrom). `excludeIds` drops drivers who already declined this parcel's
 * offer. Null when no eligible courier can take the parcel.
 */
export async function pickCourierForShipment(
  destGovernorate: string | null,
  strategy: AssignStrategy,
  destCoords?: { lat: number | null; lng: number | null } | null,
  parcelMetrics?: ParcelMetrics,
  excludeIds?: ReadonlySet<string>,
): Promise<string | null> {
  const all = await activeCouriersWithLoad(excludeIds);
  if (all.length === 0) return null;
  const capacityTable = await effectiveVehicleCapacity();
  return pickFrom(
    all,
    strategy,
    { destGovernorate, destCoords, metrics: parcelMetrics },
    capacityTable,
  );
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
      subOrderId: true,
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
  const metrics = await subOrderMetric(shipment.subOrderId);
  const driverId = await pickCourierForShipment(
    addr?.governorate ?? null,
    settings.courier_assign_strategy === "nearest" ? "nearest" : "balanced",
    addr ? { lat: addr.lat, lng: addr.lng } : null,
    metrics,
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
