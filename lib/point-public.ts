// Public-facing views of the Hezalli Points network (docs §24). Only exposes
// what a walk-in customer could see on the shopfront: hub name, address, and
// phone — never capacity, load, ledgers, or the operator's account.
import { prisma } from "@/lib/prisma";

export type PublicPoint = {
  id: string;
  name: string;
  governorate: string;
  city: string;
  addressLine: string;
  phone: string;
};

/**
 * ACTIVE hubs grouped by governorate, for the public /points directory.
 * Hubs on a vacation pause are hidden — a walk-in would find a closed door.
 */
export async function publicPointsByGovernorate(): Promise<
  { governorate: string; points: PublicPoint[] }[]
> {
  const rows = await prisma.deliveryPoint.findMany({
    where: { status: "ACTIVE", pausedAt: null },
    orderBy: [{ governorate: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      governorate: true,
      city: true,
      addressLine: true,
      phone: true,
    },
  });
  const groups = new Map<string, PublicPoint[]>();
  for (const p of rows) {
    const list = groups.get(p.governorate) ?? [];
    list.push(p);
    groups.set(p.governorate, list);
  }
  return [...groups.entries()].map(([governorate, points]) => ({
    governorate,
    points,
  }));
}

/**
 * The hub a parcel is waiting at, for the public track page's pickup card.
 * Only resolves while the parcel is actually held (AT_POINT) so the card
 * disappears the moment it's collected or moved on.
 */
export async function pickupHubForShipment(shipment: {
  status: string;
  atPointId?: string | null;
}): Promise<PublicPoint | null> {
  if (shipment.status !== "AT_POINT" || !shipment.atPointId) return null;
  return prisma.deliveryPoint.findFirst({
    where: { id: shipment.atPointId, status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      governorate: true,
      city: true,
      addressLine: true,
      phone: true,
    },
  });
}
