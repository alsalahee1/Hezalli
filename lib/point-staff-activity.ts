// Per-staff accountability (docs/DELIVERY-POINTS.md §42e). Now that every
// counter scan and COD row records WHO acted (ShipmentEvent.actorId,
// DeliveryPointLedgerEntry.createdById), this rolls a hub's activity up by
// person: what each employee received / handed over / picked up, and how much
// cash they took — the owner's "who did what" + drawer-reconciliation view.
import type { PointAccess } from "@/lib/point-access";
import { prisma } from "@/lib/prisma";

export type StaffActivityRow = {
  userId: string;
  name: string | null;
  // OWNER, or the person's PointStaffRole. "FORMER" marks someone who acted in
  // the window but is no longer on the roster (kept so their cash still shows).
  role: PointAccess | "FORMER";
  received: number; // parcels taken in at the counter (AT_POINT scans)
  handedOver: number; // parcels handed to a driver (PICKED_UP scans)
  pickups: number; // buyer counter collections (DELIVERED scans)
  returns: number; // failed-return receipts + RTS-to-seller scans
  codCollected: number; // cash this person took (counter COD + driver cash-in)
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// Roll a hub's per-person activity for [from, to). Every current team member
// (owner + staff) gets a row even with no activity, so the owner sees the
// whole team; anyone who acted but has since left is appended as FORMER.
export async function pointStaffActivity(
  pointId: string,
  from: Date,
  to: Date,
): Promise<StaffActivityRow[]> {
  const [events, cash, point] = await Promise.all([
    // Custody scans in-window that a person performed at this hub.
    prisma.shipmentEvent.groupBy({
      by: ["actorId", "status"],
      where: {
        actorId: { not: null },
        createdAt: { gte: from, lt: to },
        shipment: {
          OR: [{ deliveryPointId: pointId }, { originPointId: pointId }],
        },
      },
      _count: { _all: true },
    }),
    // Cash a person took: counter COD + driver cash-ins, in-window.
    prisma.deliveryPointLedgerEntry.groupBy({
      by: ["createdById"],
      where: {
        pointId,
        type: { in: ["COD_COLLECTED", "DRIVER_CASH_IN"] },
        createdById: { not: null },
        createdAt: { gte: from, lt: to },
      },
      _sum: { amountUsd: true },
    }),
    prisma.deliveryPoint.findUnique({
      where: { id: pointId },
      select: {
        owner: { select: { id: true, name: true } },
        staff: {
          where: { isActive: true },
          select: {
            role: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);
  if (!point) return [];

  // Seed a row per current team member (owner first, then staff), all zeros.
  const rows = new Map<string, StaffActivityRow>();
  const blank = (
    userId: string,
    name: string | null,
    role: PointAccess | "FORMER",
  ): StaffActivityRow => ({
    userId,
    name,
    role,
    received: 0,
    handedOver: 0,
    pickups: 0,
    returns: 0,
    codCollected: 0,
  });
  rows.set(point.owner.id, blank(point.owner.id, point.owner.name, "OWNER"));
  for (const s of point.staff) {
    rows.set(s.user.id, blank(s.user.id, s.user.name, s.role));
  }

  // Any actor not on the current roster (left/removed) still gets a row so
  // their in-window cash and scans are not silently dropped.
  const strangerIds = new Set<string>();
  for (const e of events)
    if (e.actorId && !rows.has(e.actorId)) strangerIds.add(e.actorId);
  for (const c of cash)
    if (c.createdById && !rows.has(c.createdById))
      strangerIds.add(c.createdById);
  if (strangerIds.size > 0) {
    const strangers = await prisma.user.findMany({
      where: { id: { in: [...strangerIds] } },
      select: { id: true, name: true },
    });
    for (const u of strangers) rows.set(u.id, blank(u.id, u.name, "FORMER"));
  }

  for (const e of events) {
    const row = e.actorId && rows.get(e.actorId);
    if (!row) continue;
    const n = e._count._all;
    switch (e.status) {
      case "AT_POINT":
        row.received += n;
        break;
      case "PICKED_UP":
        row.handedOver += n;
        break;
      case "DELIVERED":
        row.pickups += n;
        break;
      case "RETURNED_TO_POINT":
      case "RETURNED":
        row.returns += n;
        break;
    }
  }
  for (const c of cash) {
    const row = c.createdById && rows.get(c.createdById);
    if (!row) continue;
    row.codCollected = round2(row.codCollected + Number(c._sum.amountUsd ?? 0));
  }

  return [...rows.values()];
}
