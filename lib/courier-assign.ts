// Auto-assignment for Hezalli Express. When a platform-managed parcel is
// shipped, it can be handed to the least-loaded active courier so ops don't
// have to assign every parcel by hand. Load = a courier's in-flight (SHIPPED)
// deliveries. No location data is involved — this is a fairness/round-robin
// balance, and ops can always reassign from the dispatch board.
import { prisma } from "@/lib/prisma";

/** The active courier with the fewest in-flight deliveries, or null if none. */
export async function pickLeastLoadedCourierId(): Promise<string | null> {
  const couriers = await prisma.user.findMany({
    where: { roles: { has: "COURIER" }, isSuspended: false, deletedAt: null },
    select: { id: true },
  });
  if (couriers.length === 0) return null;

  const ids = couriers.map((c) => c.id);
  const loads = await prisma.shipment.groupBy({
    by: ["driverId"],
    where: { driverId: { in: ids }, subOrder: { status: "SHIPPED" } },
    _count: { _all: true },
  });
  const loadBy = new Map(loads.map((l) => [l.driverId, l._count._all]));

  // Fewest active jobs wins; ties broken by id for deterministic behavior.
  return couriers
    .map((c) => ({ id: c.id, load: loadBy.get(c.id) ?? 0 }))
    .sort((a, b) => a.load - b.load || a.id.localeCompare(b.id))[0].id;
}

/**
 * Assign a shipment to the least-loaded courier (only if currently unassigned)
 * and notify them. Best-effort: returns the chosen driver id, or null when
 * there are no couriers or the parcel is already assigned.
 */
export async function autoAssignShipment(
  shipmentId: string,
): Promise<string | null> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { driverId: true },
  });
  if (!shipment || shipment.driverId) return null;

  const driverId = await pickLeastLoadedCourierId();
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
