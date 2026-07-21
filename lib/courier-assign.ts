// Auto-assignment for Hezalli Express. When a platform-managed parcel is
// shipped it can be handed to a courier automatically:
//   - "balanced": the least-loaded active courier (fewest in-flight jobs)
//   - "nearest":  when the parcel's address has pinned coordinates and couriers
//                 have shared theirs, the closest by true (haversine) distance,
//                 tie-broken by load; otherwise a courier in the destination
//                 governorate (locality), then least-loaded among those; else
//                 global least-loaded. Ops can always reassign from dispatch.
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { getSetting } from "@/lib/settings";
import { haversineKm } from "@/lib/yemen-geo";

export type AssignStrategy = "balanced" | "nearest";
type CourierLoad = {
  id: string;
  load: number;
  governorate: string | null;
  lat: number | null;
  lng: number | null;
};

async function activeCouriersWithLoad(): Promise<CourierLoad[]> {
  const couriers = await prisma.user.findMany({
    where: { roles: { has: "COURIER" }, isSuspended: false, deletedAt: null },
    select: {
      id: true,
      courierLocation: { select: { governorate: true, lat: true, lng: true } },
    },
  });
  if (couriers.length === 0) return [];

  const ids = couriers.map((c) => c.id);
  const loads = await prisma.shipment.groupBy({
    by: ["driverId"],
    where: { driverId: { in: ids }, subOrder: { status: "SHIPPED" } },
    _count: { _all: true },
  });
  const loadBy = new Map(loads.map((l) => [l.driverId, l._count._all]));
  return couriers.map((c) => ({
    id: c.id,
    load: loadBy.get(c.id) ?? 0,
    governorate: c.courierLocation?.governorate ?? null,
    lat: c.courierLocation?.lat ?? null,
    lng: c.courierLocation?.lng ?? null,
  }));
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
): Promise<string | null> {
  const all = await activeCouriersWithLoad();
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
 * Assign a shipment to a courier per the platform strategy (only if currently
 * unassigned) and notify them. Best-effort: returns the chosen driver id, or
 * null when there are no couriers or the parcel is already assigned.
 */
export async function autoAssignShipment(
  shipmentId: string,
): Promise<string | null> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      driverId: true,
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
  const driverId = await pickCourierForShipment(
    addr?.governorate ?? null,
    strategy === "nearest" ? "nearest" : "balanced",
    addr ? { lat: addr.lat, lng: addr.lng } : null,
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
  }).catch(() => {});
  return driverId;
}
