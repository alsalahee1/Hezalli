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
//   - Capacity: couriers whose vehicle can't take the parcel — too heavy for
//     the vehicle, or the driver is already at their weight/parcel limit — are
//     skipped. If nobody fits, the parcel stays unassigned for dispatch.
//   - Batching: a courier already carrying a parcel to the same destination
//     governorate is preferred over everyone else, so orders heading the same
//     way ride on one trip instead of fanning out across the fleet.
import { codBlockedCourierIds } from "@/lib/cod-guard";
import {
  hasRoomFor,
  subOrderWeightGrams,
  subOrderWeights,
} from "@/lib/courier-capacity";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { getSetting } from "@/lib/settings";
import { haversineKm } from "@/lib/yemen-geo";

export type AssignStrategy = "balanced" | "nearest";
export type CourierLoad = {
  id: string;
  load: number;
  loadWeightGrams: number;
  vehicleType: string | null;
  governorate: string | null;
  lat: number | null;
  lng: number | null;
  // Destination governorates of the parcels this courier is carrying now —
  // the batching signal ("they're already driving there").
  activeGovernorates: ReadonlySet<string>;
};

async function activeCouriersWithLoad(): Promise<CourierLoad[]> {
  const couriers = await prisma.user.findMany({
    where: { roles: { has: "COURIER" }, isSuspended: false, deletedAt: null },
    select: {
      id: true,
      courierVehicleType: true,
      courierLocation: { select: { governorate: true, lat: true, lng: true } },
    },
  });
  if (couriers.length === 0) return [];

  // COD credit control: drivers over the cash limit or sitting on overdue
  // COD don't get new work until they remit (lib/cod-guard.ts). Dispatch can
  // still assign manually — this gates the automatic paths only.
  const codBlocked = await codBlockedCourierIds(couriers.map((c) => c.id));
  const eligible = couriers.filter((c) => !codBlocked.has(c.id));
  if (eligible.length === 0) return [];

  // In-flight parcels with their destination and weight, so a driver's load is
  // known in kilos and destinations — not just a count.
  const ids = eligible.map((c) => c.id);
  const active = await prisma.shipment.findMany({
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
  });
  const weights = await subOrderWeights(active.map((s) => s.subOrderId));

  const byDriver = new Map<
    string,
    { load: number; weight: number; govs: Set<string> }
  >();
  for (const s of active) {
    if (!s.driverId) continue;
    const cur = byDriver.get(s.driverId) ?? {
      load: 0,
      weight: 0,
      govs: new Set<string>(),
    };
    cur.load += 1;
    cur.weight += weights.get(s.subOrderId) ?? 0;
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
      vehicleType: c.courierVehicleType,
      governorate: c.courierLocation?.governorate ?? null,
      lat: c.courierLocation?.lat ?? null,
      lng: c.courierLocation?.lng ?? null,
      activeGovernorates: cur?.govs ?? new Set<string>(),
    };
  });
}

// Fewest active jobs wins; ties broken by id for deterministic behavior.
function leastLoaded(list: CourierLoad[]): string | null {
  if (list.length === 0) return null;
  return [...list].sort(
    (a, b) => a.load - b.load || a.id.localeCompare(b.id),
  )[0].id;
}

/** The active courier with the fewest in-flight deliveries, or null. */
export async function pickLeastLoadedCourierId(): Promise<string | null> {
  return leastLoaded(await activeCouriersWithLoad());
}

export type ParcelInfo = {
  destGovernorate: string | null;
  destCoords?: { lat: number | null; lng: number | null } | null;
  weightGrams?: number;
};

/**
 * Pure ranking core of pickCourierForShipment, exported for tests.
 *
 * 1. Drop couriers without room for the parcel (vehicle weight/parcel limits).
 * 2. Prefer a courier already delivering to the destination governorate
 *    (batching) — they're making that trip anyway, capacity permitting.
 * 3. Within that, the strategy's usual order: distance (nearest) or load.
 */
export function pickFrom(
  list: CourierLoad[],
  strategy: AssignStrategy,
  parcel: ParcelInfo,
): string | null {
  const capable = list.filter((c) => hasRoomFor(c, parcel.weightGrams ?? 0));
  if (capable.length === 0) return null;

  const gov = parcel.destGovernorate;
  const batched = (c: CourierLoad) =>
    gov && c.activeGovernorates.has(gov) ? 0 : 1;
  const best = (candidates: CourierLoad[]) =>
    [...candidates].sort(
      (a, b) =>
        batched(a) - batched(b) ||
        a.load - b.load ||
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
 * pickFrom). Null when no active courier can take the parcel.
 */
export async function pickCourierForShipment(
  destGovernorate: string | null,
  strategy: AssignStrategy,
  destCoords?: { lat: number | null; lng: number | null } | null,
  parcelWeightGrams?: number,
): Promise<string | null> {
  const all = await activeCouriersWithLoad();
  if (all.length === 0) return null;
  return pickFrom(all, strategy, {
    destGovernorate,
    destCoords,
    weightGrams: parcelWeightGrams,
  });
}

/**
 * Assign a shipment to a courier per the platform strategy (only if currently
 * unassigned) and notify them. Best-effort: returns the chosen driver id, or
 * null when no courier can take the parcel or it is already assigned.
 */
export async function autoAssignShipment(
  shipmentId: string,
): Promise<string | null> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      driverId: true,
      subOrderId: true,
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

  const strategy = await getSetting("courier_assign_strategy");
  const addr = shipment.subOrder?.order.address;
  const weightGrams = await subOrderWeightGrams(shipment.subOrderId);
  const driverId = await pickCourierForShipment(
    addr?.governorate ?? null,
    strategy === "nearest" ? "nearest" : "balanced",
    addr ? { lat: addr.lat, lng: addr.lng } : null,
    weightGrams,
  );
  if (!driverId) return null;

  // Guard against a race: only claim it while still unassigned.
  const claimed = await prisma.shipment.updateMany({
    where: { id: shipmentId, driverId: null },
    data: { driverId },
  });
  if (claimed.count !== 1) return null;

  await prisma.notification.create({
    data: {
      userId: driverId,
      type: "SHIPMENT",
      title: "New delivery assigned",
      body: "A Hezalli Express delivery was auto-assigned to you.",
      data: { link: "/driver" },
    },
  });
  // Ping the driver's phone (no-op unless push is configured).
  await sendPushToUser(driverId, {
    title: "New delivery assigned",
    body: "A Hezalli Express delivery was auto-assigned to you.",
    url: "/driver",
    tag: "assignment",
    icon: "/driver-icon.svg",
  }).catch(() => {});
  return driverId;
}
