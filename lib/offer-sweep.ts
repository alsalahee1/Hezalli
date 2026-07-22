// Offer sweep (docs/EXPRESS-DELIVERY.md): the clock behind driver job offers.
// During dispatch hours it (1) expires offers whose accept window lapsed and
// cascades those parcels to the next courier, and (2) runs the "morning
// wave" — offers out every unassigned platform parcel that queued while
// dispatch was closed (or fell through a race). Outside dispatch hours it
// does nothing at all: offer clocks pause overnight instead of expiring while
// the drivers sleep.
import {
  cascadeShipmentOffer,
  offerOpenStatuses,
} from "@/lib/courier-assign";
import { isDispatchOpen } from "@/lib/dispatch-hours";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";

const BATCH = 100;

export async function sweepCourierOffers(): Promise<{
  expired: number;
  waved: number;
}> {
  const settings = await getPlatformSettings();
  if (
    !isDispatchOpen(settings.dispatch_hours_start, settings.dispatch_hours_end)
  ) {
    return { expired: 0, waved: 0 };
  }

  // 1. Expire lapsed offers and move those parcels to the next courier.
  const lapsed = await prisma.shipmentOffer.findMany({
    where: { status: "OFFERED", expiresAt: { lt: new Date() } },
    take: BATCH,
    select: {
      id: true,
      shipmentId: true,
      driverId: true,
      shipment: {
        select: { status: true, driverId: true, deliveryPointId: true },
      },
    },
  });
  let expired = 0;
  for (const offer of lapsed) {
    // Only a job the driver hasn't physically started may be taken back;
    // anything past that (a pickup or collection scan, an attempt) means they
    // acted, which counts as an implicit accept.
    const openStatuses = offerOpenStatuses(offer.shipment.deliveryPointId);
    const started = !(openStatuses as string[]).includes(offer.shipment.status);
    if (started || offer.shipment.driverId !== offer.driverId) {
      // The driver already worked the parcel (implicit accept), or ops
      // reassigned it meanwhile — settle the row, take nothing away.
      await prisma.shipmentOffer.updateMany({
        where: { id: offer.id, status: "OFFERED" },
        data: started
          ? { status: "ACCEPTED", respondedAt: new Date() }
          : { status: "EXPIRED" },
      });
      continue;
    }
    // Expire + release atomically; the conditional updates make a race with a
    // just-in-time accept or scan harmless (accept wins).
    const released = await prisma.$transaction(async (tx) => {
      const o = await tx.shipmentOffer.updateMany({
        where: { id: offer.id, status: "OFFERED" },
        data: { status: "EXPIRED" },
      });
      if (o.count !== 1) return false;
      const s = await tx.shipment.updateMany({
        where: {
          id: offer.shipmentId,
          driverId: offer.driverId,
          status: { in: openStatuses },
        },
        data: { driverId: null },
      });
      return s.count === 1;
    });
    if (!released) continue;
    expired += 1;
    await cascadeShipmentOffer(offer.shipmentId).catch(() => {});
  }

  // 2. Morning wave: unassigned, in-flight, platform parcels with no open
  // offer — mostly the overnight queue. Two shapes are ready for a courier:
  // direct parcels not yet picked up, and point-routed parcels received at
  // their DESTINATION point (a parcel held at its origin hub is waiting for
  // line-haul, not a doorstep driver; PUDO parcels never get one).
  let waved = 0;
  if (settings.express_auto_assign) {
    const queued = await prisma.shipment.findMany({
      where: {
        platformManaged: true,
        driverId: null,
        assignmentEscalatedAt: null,
        subOrder: { status: "SHIPPED", shippingMethod: { not: "PICKUP" } },
        OR: [
          // A direct parcel sits IN_TRANSIT from ship until the pickup scan.
          {
            deliveryPointId: null,
            status: { in: ["PENDING", "LABEL_CREATED", "IN_TRANSIT"] },
          },
          { deliveryPointId: { not: null }, status: "AT_POINT" },
        ],
      },
      take: BATCH,
      select: { id: true, status: true, atPointId: true, deliveryPointId: true },
    });
    for (const s of queued) {
      // Prisma can't compare two columns in `where`; do the "at destination"
      // check here.
      if (s.status === "AT_POINT" && s.atPointId !== s.deliveryPointId) {
        continue;
      }
      const got = await cascadeShipmentOffer(s.id).catch(() => null);
      if (got) waved += 1;
    }
  }

  return { expired, waved };
}
