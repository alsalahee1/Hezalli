// Auto-placement for a delivery point's shelves (docs §42e). When a point has
// registered its bays, the counter no longer decides where a received parcel
// goes: assignShelf picks the least-busy eligible bay and the receive scan
// stamps it, so the operator just reads "→ B3" and places it there. Occupancy
// is derived live from Shipment.shelfCode — never stored — so it can't drift.
import { prisma } from "@/lib/prisma";

export type ShelfSlot = { code: string; capacity: number | null };

// Pure selection: the least-occupied bay that still has room, preferring the
// earliest bay on a tie (shelves come pre-sorted by code, so A1 wins over B1).
// If every capped bay is full, fall back to the globally least-occupied bay so
// the counter always gets a suggestion rather than being blocked.
export function pickShelf(
  shelves: ShelfSlot[],
  occupancy: Map<string, number>,
): string | null {
  let best: string | null = null;
  let bestLoad = Infinity;
  let fallback: string | null = null;
  let fallbackLoad = Infinity;

  for (const s of shelves) {
    const load = occupancy.get(s.code) ?? 0;
    if (load < fallbackLoad) {
      fallbackLoad = load;
      fallback = s.code;
    }
    // A capped, full bay is not eligible for a fresh placement.
    if (s.capacity != null && load >= s.capacity) continue;
    if (load < bestLoad) {
      bestLoad = load;
      best = s.code;
    }
  }
  return best ?? fallback;
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

// The bay a freshly received parcel should go on, or null when the point hasn't
// registered any shelves (then the operator's manual entry — or nothing — is
// used, exactly as before).
export async function assignShelf(pointId: string): Promise<string | null> {
  const shelves = await prisma.pointShelf.findMany({
    where: { pointId },
    orderBy: { code: "asc" },
    select: { code: true, capacity: true },
  });
  if (shelves.length === 0) return null;
  const occupancy = await shelfOccupancy(pointId);
  return pickShelf(shelves, occupancy);
}
