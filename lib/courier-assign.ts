// Auto-assignment for Hezalli Express. When a platform-managed parcel is
// shipped it can be handed to a courier automatically:
//   - "balanced": the least-loaded active courier (fewest in-flight jobs)
//   - "nearest":  a courier currently in the destination governorate (from
//                 their shared location), then least-loaded among those
// No point-to-point distance is used — destinations are only governorate-level,
// so this is locality matching. Ops can always reassign from the dispatch board.
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

export type AssignStrategy = "balanced" | "nearest";
type CourierLoad = { id: string; load: number; governorate: string | null };

async function activeCouriersWithLoad(): Promise<CourierLoad[]> {
  const couriers = await prisma.user.findMany({
    where: { roles: { has: "COURIER" }, isSuspended: false, deletedAt: null },
    select: { id: true, courierLocation: { select: { governorate: true } } },
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
 * Choose a courier for a parcel. With "nearest", prefer a driver already in the
 * destination governorate (then least-loaded); falls back to global
 * least-loaded when none are local or the strategy is "balanced".
 */
export async function pickCourierForShipment(
  destGovernorate: string | null,
  strategy: AssignStrategy,
): Promise<string | null> {
  const all = await activeCouriersWithLoad();
  if (all.length === 0) return null;
  if (strategy === "nearest" && destGovernorate) {
    const local = all.filter((c) => c.governorate === destGovernorate);
    if (local.length > 0) return leastLoaded(local);
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
          order: { select: { address: { select: { governorate: true } } } },
        },
      },
    },
  });
  if (!shipment || shipment.driverId) return null;

  const strategy = await getSetting("courier_assign_strategy");
  const destGov = shipment.subOrder?.order.address.governorate ?? null;
  const driverId = await pickCourierForShipment(
    destGov,
    strategy === "nearest" ? "nearest" : "balanced",
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
  return driverId;
}
