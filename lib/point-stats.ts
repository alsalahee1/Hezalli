// Delivery network analytics (docs/DELIVERY-POINTS.md §18): performance of
// the Hezalli Express + Points network over a date range, for the admin
// Reports page. Read-only aggregates — no money paths here.
import { prisma } from "@/lib/prisma";

export type PointRow = {
  pointId: string;
  name: string;
  delivered: number;
  feesUsd: number;
};

export type NetworkSummary = {
  shipped: number; // platform parcels that entered the network in range
  delivered: number; // platform parcels delivered in range
  failedAttempts: number; // failed doorstep attempts logged in range
  rts: number; // returned-to-seller events in range
  successRatePct: number | null; // delivered / (delivered + rts), null = no data
  avgDeliveryHours: number | null; // mean shippedAt → deliveredAt
  pickupSharePct: number | null; // share of deliveries collected at a counter
  perPoint: PointRow[]; // top hubs by delivered volume in range
};

export async function networkSummary(
  from: Date,
  to: Date,
): Promise<NetworkSummary> {
  const [shipped, deliveredRows, failedAttempts, rts, fees] = await Promise.all(
    [
      prisma.shipment.count({
        where: { platformManaged: true, shippedAt: { gte: from, lte: to } },
      }),
      prisma.shipment.findMany({
        where: {
          platformManaged: true,
          status: "DELIVERED",
          deliveredAt: { gte: from, lte: to },
        },
        select: {
          shippedAt: true,
          deliveredAt: true,
          deliveryPointId: true,
          subOrder: { select: { shippingMethod: true } },
        },
      }),
      prisma.deliveryAttempt.count({
        where: { outcome: "FAILED", createdAt: { gte: from, lte: to } },
      }),
      prisma.shipmentEvent.count({
        where: { status: "RETURNED", createdAt: { gte: from, lte: to } },
      }),
      // Fees credited to hubs in range (handling + transfer legs).
      prisma.deliveryPointLedgerEntry.groupBy({
        by: ["pointId"],
        where: { type: "HANDLING_FEE", createdAt: { gte: from, lte: to } },
        _sum: { amountUsd: true },
      }),
    ],
  );

  const delivered = deliveredRows.length;
  const terminal = delivered + rts;
  const durations = deliveredRows.filter((d) => d.shippedAt && d.deliveredAt);
  const avgDeliveryHours =
    durations.length > 0
      ? Math.round(
          (durations.reduce(
            (s, d) => s + (d.deliveredAt!.getTime() - d.shippedAt!.getTime()),
            0,
          ) /
            durations.length /
            3_600_000) *
            10,
        ) / 10
      : null;
  const pickups = deliveredRows.filter(
    (d) => d.subOrder.shippingMethod === "PICKUP",
  ).length;

  // Per-hub delivered volume in range, joined with the fee sums above.
  const deliveredByPoint = new Map<string, number>();
  for (const d of deliveredRows) {
    if (d.deliveryPointId) {
      deliveredByPoint.set(
        d.deliveryPointId,
        (deliveredByPoint.get(d.deliveryPointId) ?? 0) + 1,
      );
    }
  }
  const feeByPoint = new Map(
    fees.map((f) => [f.pointId, Number(f._sum.amountUsd ?? 0)]),
  );
  const pointIds = [
    ...new Set([...deliveredByPoint.keys(), ...feeByPoint.keys()]),
  ];
  const names = pointIds.length
    ? await prisma.deliveryPoint.findMany({
        where: { id: { in: pointIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(names.map((n) => [n.id, n.name]));
  const perPoint: PointRow[] = pointIds
    .map((id) => ({
      pointId: id,
      name: nameById.get(id) ?? id.slice(-6),
      delivered: deliveredByPoint.get(id) ?? 0,
      feesUsd: Math.round((feeByPoint.get(id) ?? 0) * 100) / 100,
    }))
    .sort((a, b) => b.delivered - a.delivered || b.feesUsd - a.feesUsd)
    .slice(0, 20);

  return {
    shipped,
    delivered,
    failedAttempts,
    rts,
    successRatePct:
      terminal > 0 ? Math.round((delivered / terminal) * 1000) / 10 : null,
    avgDeliveryHours,
    pickupSharePct:
      delivered > 0 ? Math.round((pickups / delivered) * 1000) / 10 : null,
    perPoint,
  };
}
