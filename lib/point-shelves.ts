// Auto-placement for a delivery point's shelves (docs §42e). When a point has
// registered its bays, the counter no longer decides where a received parcel
// goes: assignShelf picks the least-busy eligible bay and the receive scan
// stamps it, so the operator just reads "→ B3" and places it there. Occupancy
// is derived live from Shipment.shelfCode — never stored — so it can't drift.
import type { PointShelfZone } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type ShelfZone = PointShelfZone;
export type ShelfSlot = {
  code: string;
  capacity: number | null;
  zone: ShelfZone | null;
};

// Pure selection. When the parcel has a target zone AND the point has bays in
// that zone, placement is confined to those bays (buyer pickups near the
// counter, courier loads near the door); otherwise any bay is eligible.
//
// Co-location (`sameKey`, shelfCode → how many parcels already there share this
// parcel's destination): among bays with room, one that already holds the same
// destination wins, so a driver's load consolidates onto as few bays as
// possible — the fullest matching bay first, to finish filling it before
// opening another. With no match it's the least-occupied bay with room,
// earliest on a tie (shelves come pre-sorted by code, so A1 wins over B1). If
// every capped bay is full, fall back to the least-occupied bay in the pool so
// the counter is never blocked.
export function pickShelf(
  shelves: ShelfSlot[],
  occupancy: Map<string, number>,
  zone?: ShelfZone | null,
  sameKey?: Map<string, number>,
): string | null {
  const zoned = zone ? shelves.filter((s) => s.zone === zone) : [];
  const pool = zoned.length > 0 ? zoned : shelves;

  let best: string | null = null;
  let bestLoad = Infinity;
  let fallback: string | null = null;
  let fallbackLoad = Infinity;
  // Co-location pick: the eligible bay already holding the most of this
  // destination — consolidate onto it until it's full.
  let group: string | null = null;
  let groupMatch = 0;

  for (const s of pool) {
    const load = occupancy.get(s.code) ?? 0;
    if (load < fallbackLoad) {
      fallbackLoad = load;
      fallback = s.code;
    }
    // A capped, full bay is not eligible for a fresh placement.
    if (s.capacity != null && load >= s.capacity) continue;
    const match = sameKey?.get(s.code) ?? 0;
    if (match > groupMatch) {
      groupMatch = match;
      group = s.code;
    }
    if (load < bestLoad) {
      bestLoad = load;
      best = s.code;
    }
  }
  return group ?? best ?? fallback;
}

// Live occupancy per bay: how many parcels the point currently holds on each
// shelf. Only held statuses count — handed-over/collected parcels have their
// shelfCode cleared, so they naturally drop out.
async function shelfOccupancy(pointId: string): Promise<Map<string, number>> {
  const rows = await prisma.shipment.groupBy({
    by: ["shelfCode"],
    where: {
      atPointId: pointId,
      status: { in: ["AT_POINT", "RETURNED_TO_POINT"] },
      shelfCode: { not: null },
    },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) if (r.shelfCode) map.set(r.shelfCode, r._count._all);
  return map;
}

// Same shape, but scoped to parcels bound for one destination city — powers
// co-location so a driver's run consolidates onto the same bay(s).
async function cityOccupancy(
  pointId: string,
  city: string,
): Promise<Map<string, number>> {
  const rows = await prisma.shipment.groupBy({
    by: ["shelfCode"],
    where: {
      atPointId: pointId,
      status: { in: ["AT_POINT", "RETURNED_TO_POINT"] },
      shelfCode: { not: null },
      subOrder: { order: { address: { city } } },
    },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) if (r.shelfCode) map.set(r.shelfCode, r._count._all);
  return map;
}

// The bay a freshly received parcel should go on, or null when the point hasn't
// registered any shelves (then the operator's manual entry — or nothing — is
// used, exactly as before). `zone` steers the parcel to the matching area; for
// a dispatch parcel `city` groups it with others bound for the same place.
export async function assignShelf(
  pointId: string,
  zone?: ShelfZone | null,
  city?: string | null,
): Promise<string | null> {
  const shelves = await prisma.pointShelf.findMany({
    where: { pointId },
    orderBy: { code: "asc" },
    select: { code: true, capacity: true, zone: true },
  });
  if (shelves.length === 0) return null;
  const occupancy = await shelfOccupancy(pointId);
  // Co-location only makes sense for the dispatch queue (a driver's route);
  // buyer pickups and returns are retrieved one at a time.
  const sameKey =
    zone === "DISPATCH" && city?.trim()
      ? await cityOccupancy(pointId, city.trim())
      : undefined;
  return pickShelf(shelves, occupancy, zone, sameKey);
}

export type ShelfLoad = {
  code: string;
  zone: ShelfZone | null;
  capacity: number | null;
  load: number;
};

// Live load of every registered bay, for the occupancy view: how many parcels
// each bay currently holds, with its zone and cap. Sorted by code.
export async function pointShelfLoads(pointId: string): Promise<ShelfLoad[]> {
  const [shelves, occupancy] = await Promise.all([
    prisma.pointShelf.findMany({
      where: { pointId },
      orderBy: { code: "asc" },
      select: { code: true, zone: true, capacity: true },
    }),
    shelfOccupancy(pointId),
  ]);
  return shelves.map((s) => ({ ...s, load: occupancy.get(s.code) ?? 0 }));
}
