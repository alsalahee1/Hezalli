// Point capacity & smart selection (docs/DELIVERY-POINTS.md §8). One shared
// definition of a point's LOAD (parcels held or inbound), whether it is FULL,
// and how pickers order candidates — used by checkout, the seller ship form,
// and the server-side validation in placeOrder / shipSubOrder.
import { prisma } from "@/lib/prisma";

// Parcels that occupy shelf space now or are on their way to it.
const LOAD_STATUSES = [
  "LABEL_CREATED",
  "AT_POINT",
  "RETURNED_TO_POINT",
] as const;

export type RoutablePoint = {
  id: string;
  name: string;
  governorate: string;
  city: string;
  load: number;
  capacity: number | null; // null = unlimited
};

/**
 * Current load per point id: parcels physically held (atPointId) plus
 * announced drop-offs heading to this counter first (LABEL_CREATED at the
 * origin hub, or at the destination when there is no origin leg).
 */
async function loadByPoint(pointIds: string[]): Promise<Map<string, number>> {
  if (pointIds.length === 0) return new Map();
  const [held, inbound] = await Promise.all([
    prisma.shipment.groupBy({
      by: ["atPointId"],
      where: {
        atPointId: { in: pointIds },
        status: { in: LOAD_STATUSES as unknown as never },
        subOrder: { status: "SHIPPED" },
      },
      _count: { _all: true },
    }),
    prisma.shipment.findMany({
      where: {
        status: "LABEL_CREATED",
        subOrder: { status: "SHIPPED" },
        OR: [
          { originPointId: { in: pointIds } },
          { originPointId: null, deliveryPointId: { in: pointIds } },
        ],
      },
      select: { originPointId: true, deliveryPointId: true },
    }),
  ]);
  const out = new Map<string, number>();
  for (const g of held) out.set(g.atPointId!, g._count._all);
  for (const s of inbound) {
    const p = s.originPointId ?? s.deliveryPointId!;
    out.set(p, (out.get(p) ?? 0) + 1);
  }
  return out;
}

/**
 * ACTIVE points that can accept NEW routing (not full), ordered for a picker:
 * destination-governorate matches first, then least-loaded, then name. Pass
 * no governorate to get the same list ordered globally by load.
 */
export async function listRoutablePoints(
  destGovernorate?: string | null,
): Promise<RoutablePoint[]> {
  const points = await prisma.deliveryPoint.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      governorate: true,
      city: true,
      capacity: true,
    },
  });
  const loads = await loadByPoint(points.map((p) => p.id));

  return points
    .map((p) => ({ ...p, load: loads.get(p.id) ?? 0 }))
    .filter((p) => p.capacity == null || p.load < p.capacity)
    .sort((a, b) => {
      const aLocal = a.governorate === destGovernorate ? 0 : 1;
      const bLocal = b.governorate === destGovernorate ? 0 : 1;
      return aLocal - bLocal || a.load - b.load || a.name.localeCompare(b.name);
    });
}

export type PointRoutability = "ok" | "full" | "unavailable";

/**
 * Server-side gate for routing a NEW parcel to a point. Never trusts the
 * client's picker: re-checks ACTIVE status and remaining capacity.
 */
export async function checkPointRoutable(
  pointId: string,
): Promise<PointRoutability> {
  const point = await prisma.deliveryPoint.findFirst({
    where: { id: pointId, status: "ACTIVE" },
    select: { id: true, capacity: true },
  });
  if (!point) return "unavailable";
  if (point.capacity == null) return "ok";
  const loads = await loadByPoint([point.id]);
  return (loads.get(point.id) ?? 0) < point.capacity ? "ok" : "full";
}
