// Driver reliability from offer history (docs/AUDIT-LIFECYCLE-2026-07-22.md
// GAP-4). Every answered ShipmentOffer is a data point: ACCEPTED counts for
// the driver, REJECTED and EXPIRED against. The rate feeds dispatch two ways
// (lib/courier-assign.ts): as a ranking tie-break — reliable drivers are
// offered first — and, when `driver_min_acceptance_rate` is set, as a gate
// that pauses chronic decliners from auto-offers entirely (manual dispatch
// still works, mirroring the COD guard). A rolling window keeps old history
// from haunting a driver forever.
import { prisma } from "@/lib/prisma";

export const RELIABILITY_WINDOW_DAYS = 90;

export type CourierAcceptance = {
  responded: number; // answered offers in the window (accept + decline + expire)
  accepted: number;
  rate: number | null; // accepted / responded; null with no history
};

/**
 * Acceptance stats per courier over the rolling window. Pass ids to scope the
 * query; drivers with no history are simply absent from the map.
 */
export async function courierAcceptanceStats(
  ids?: string[],
): Promise<Map<string, CourierAcceptance>> {
  if (ids && ids.length === 0) return new Map();
  const since = new Date(
    Date.now() - RELIABILITY_WINDOW_DAYS * 86_400_000,
  );
  const rows = await prisma.shipmentOffer.groupBy({
    by: ["driverId", "status"],
    where: {
      status: { in: ["ACCEPTED", "REJECTED", "EXPIRED"] },
      createdAt: { gte: since },
      ...(ids ? { driverId: { in: ids } } : {}),
    },
    _count: { _all: true },
  });
  const out = new Map<string, CourierAcceptance>();
  for (const r of rows) {
    const s = out.get(r.driverId) ?? { responded: 0, accepted: 0, rate: null };
    s.responded += r._count._all;
    if (r.status === "ACCEPTED") s.accepted += r._count._all;
    out.set(r.driverId, s);
  }
  for (const s of out.values()) {
    s.rate = s.responded > 0 ? s.accepted / s.responded : null;
  }
  return out;
}
