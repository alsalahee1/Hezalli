// Offer sweep (docs/EXPRESS-DELIVERY.md): the clock behind driver job offers.
// During dispatch hours it (1) expires offers whose accept window lapsed and
// cascades those parcels to the next courier, and (2) runs the "morning
// wave" — offers out every unassigned platform parcel that queued while
// dispatch was closed (or fell through a race). Outside dispatch hours it
// does nothing at all: offer clocks pause overnight instead of expiring while
// the drivers sleep.
import { cascadeShipmentOffer, offerOpenStatuses } from "@/lib/courier-assign";
import { isDispatchOpen } from "@/lib/dispatch-hours";
import { boardShipment } from "@/lib/job-board";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";

const BATCH = 100;
// Escalated parcels nobody assigned re-alert staff this often (GAP-5 in
// docs/AUDIT-LIFECYCLE-2026-07-22.md: an ignored alert must not end the chain).
const REESCALATE_HOURS = 24;

export async function sweepCourierOffers(): Promise<{
  expired: number;
  reclaimed: number;
  waved: number;
  boarded: number;
  reescalated: number;
}> {
  const settings = await getPlatformSettings();
  if (
    !isDispatchOpen(settings.dispatch_hours_start, settings.dispatch_hours_end)
  ) {
    return { expired: 0, reclaimed: 0, waved: 0, boarded: 0, reescalated: 0 };
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

  // 1b. Pickup deadline (docs/EXPRESS-DELIVERY.md §4a): a driver who ACCEPTED
  // a job — tapped the offer or claimed it off the board — but still hasn't
  // made a single scan after `pickup_deadline_hours` loses it automatically.
  // Safe to automate precisely because no scan means the physical parcel was
  // never in their hands: only parcels still in the untouched statuses
  // (offerOpenStatuses) are taken back, the same rule that gates declines and
  // offer expiry. Forced and manual assignments have no accepted-offer row and
  // are exempt — ops decisions stay ops'. 0 turns the deadline off.
  let reclaimed = 0;
  if (settings.pickup_deadline_hours > 0) {
    const overdue = await prisma.shipmentOffer.findMany({
      where: {
        status: "ACCEPTED",
        respondedAt: {
          lt: new Date(Date.now() - settings.pickup_deadline_hours * 3_600_000),
        },
        shipment: {
          // Broad untouched-status filter so long-delivered jobs don't fill
          // the batch; the exact per-shape rule is applied per row below.
          status: {
            in: [
              "PENDING",
              "LABEL_CREATED",
              "IN_TRANSIT",
              "AT_POINT",
              "RETURNED_TO_POINT",
            ],
          },
          subOrder: { status: "SHIPPED" },
        },
      },
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
    for (const offer of overdue) {
      const openStatuses = offerOpenStatuses(offer.shipment.deliveryPointId);
      // A scan of any kind, or an ops reassignment, means hands off — the
      // deadline only reclaims jobs the driver never physically started.
      if (
        !(openStatuses as string[]).includes(offer.shipment.status) ||
        offer.shipment.driverId !== offer.driverId
      ) {
        continue;
      }
      const released = await prisma.$transaction(async (tx) => {
        const o = await tx.shipmentOffer.updateMany({
          where: { id: offer.id, status: "ACCEPTED" },
          data: { status: "EXPIRED", reason: "pickup_timeout" },
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
      reclaimed += 1;

      // Tell the driver why the job vanished from their list.
      const driver = await prisma.user.findUnique({
        where: { id: offer.driverId },
        select: { locale: true },
      });
      const ar = driver?.locale === "ar";
      await notify({
        userId: offer.driverId,
        type: "SHIPMENT",
        title: ar
          ? "سُحبت توصيلة لعدم الاستلام"
          : "A delivery was taken back — pickup deadline",
        body: ar
          ? `لم تستلم الطرد خلال ${settings.pickup_deadline_hours} ساعة من قبولك المهمة، فأُعيد توزيعها.`
          : `You didn't collect the parcel within ${settings.pickup_deadline_hours} hours of accepting the job, so it was re-dispatched.`,
        link: "/driver",
      }).catch(() => {});

      // Move the parcel along. The reclaimed driver's EXPIRED row excludes
      // them from the cascade; with the board on, the parcel reappears there
      // automatically (it is unassigned again and boardedAt is still set). In
      // pull-only mode (auto-assign off) the board is the whole re-dispatch.
      if (settings.express_auto_assign) {
        await cascadeShipmentOffer(offer.shipmentId).catch(() => {});
      }
    }
  }

  // 2. Morning wave: unassigned, in-flight, platform parcels with no open
  // offer — mostly the overnight queue. Two shapes are ready for a courier:
  // direct parcels not yet picked up, and point-routed parcels received at
  // their DESTINATION point (a parcel held at its origin hub is waiting for
  // line-haul, not a doorstep driver; PUDO parcels never get one).
  //
  // With the job board on (docs/EXPRESS-DELIVERY.md §4b) each parcel goes
  // through two stages here: not yet boarded → post it on the board; boarded
  // but unclaimed past `job_board_window_minutes` → start the push-offer
  // cascade as well (only when auto-assign is on — a pure-pull marketplace
  // just leaves it claimable). Board off = the classic wave, unchanged.
  let waved = 0;
  let boarded = 0;
  if (settings.express_auto_assign || settings.job_board_enabled) {
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
      select: {
        id: true,
        status: true,
        atPointId: true,
        deliveryPointId: true,
        boardedAt: true,
      },
    });
    const boardCutoff = new Date(
      Date.now() - settings.job_board_window_minutes * 60_000,
    );
    for (const s of queued) {
      // Prisma can't compare two columns in `where`; do the "at destination"
      // check here.
      if (s.status === "AT_POINT" && s.atPointId !== s.deliveryPointId) {
        continue;
      }
      if (settings.job_board_enabled && !s.boardedAt) {
        const posted = await boardShipment(s.id).catch(() => false);
        if (posted) boarded += 1;
        continue; // Its board-only window starts now; push comes later.
      }
      if (
        settings.job_board_enabled &&
        s.boardedAt &&
        (!settings.express_auto_assign || s.boardedAt > boardCutoff)
      ) {
        continue; // Still board-only, or pull-only mode — leave it claimable.
      }
      const got = await cascadeShipmentOffer(s.id).catch(() => null);
      if (got) waved += 1;
    }
  }

  // 3. Re-escalate: parcels flagged for manual dispatch that are STILL
  // unassigned after REESCALATE_HOURS get one aggregated re-alert (and the
  // flag re-stamped so the next one is another day out). Manual assignment
  // clears the flag and ends the cycle.
  const stale = await prisma.shipment.findMany({
    where: {
      platformManaged: true,
      driverId: null,
      assignmentEscalatedAt: {
        lt: new Date(Date.now() - REESCALATE_HOURS * 3_600_000),
      },
      subOrder: { status: "SHIPPED" },
    },
    take: BATCH,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.shipment.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { assignmentEscalatedAt: new Date() },
    });
    const staff = await prisma.user.findMany({
      where: {
        isSuspended: false,
        deletedAt: null,
        roles: { hasSome: ["DELIVERY_MANAGER", "ADMIN"] },
      },
      select: { id: true, locale: true },
    });
    await Promise.all(
      staff.map((u) => {
        const ar = u.locale === "ar";
        return notify({
          userId: u.id,
          type: "SHIPMENT",
          title: ar
            ? `تذكير: ${stale.length} طرد ما زال بلا مندوب`
            : `Reminder: ${stale.length} parcel(s) still have no courier`,
          body: ar
            ? "طرود صعّدناها سابقًا وما زالت بلا تعيين. عيّنها يدويًا من لوحة التوزيع."
            : "Parcels escalated earlier are still unassigned. Assign them manually from dispatch.",
          link: "/admin/dispatch",
        }).catch(() => {});
      }),
    );
  }

  return { expired, reclaimed, waved, boarded, reescalated: stale.length };
}
