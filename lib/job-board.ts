// Open driver job board (docs/EXPRESS-DELIVERY.md §4b). The PULL side of
// dispatch: instead of the platform picking a courier and offering the parcel
// (lib/courier-assign.ts), a boarded parcel is visible to every eligible
// driver — destination, size, COD amount, delivery fee — and the FIRST driver
// to claim it takes it (an atomic conditional update, so a race has exactly
// one winner). The two systems compose:
//
//   ship → board (job_board_enabled) → nobody claimed within
//   `job_board_window_minutes` → the offer sweep starts the usual push-offer
//   cascade AS WELL. The parcel stays claimable the whole time — whoever gets
//   there first (a claim or an accepted offer) holds the job, because both
//   paths set Shipment.driverId and the board only shows unassigned parcels.
//
// With the board off, dispatchShippedParcel falls straight through to the
// classic auto-assign, so lib/actions/shipment.ts and lib/point-core.ts don't
// need to know which mode the platform runs in.
import { autoAssignShipment } from "@/lib/courier-assign";
import { codBlockedCourierIds } from "@/lib/cod-guard";
import { isDispatchOpen } from "@/lib/dispatch-hours";
import type { Prisma } from "@/lib/generated/prisma/client";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/settings";

/**
 * Parcels currently visible on the board: platform-managed, boarded,
 * unassigned, in-flight, and physically ready for a doorstep courier — a
 * direct parcel from the ship action until pickup, or a point-routed parcel
 * held at a hub. (Whether that hub is the DESTINATION point can't be expressed
 * in Prisma's `where` — filter `atPointId === deliveryPointId` in JS, see
 * boardReadyAtPoint.) PUDO parcels never appear: the buyer is the last mile.
 */
export function openBoardWhere(): Prisma.ShipmentWhereInput {
  return {
    platformManaged: true,
    driverId: null,
    boardedAt: { not: null },
    subOrder: { status: "SHIPPED", shippingMethod: { not: "PICKUP" } },
    OR: [
      {
        deliveryPointId: null,
        status: { in: ["PENDING", "LABEL_CREATED", "IN_TRANSIT"] },
      },
      { deliveryPointId: { not: null }, status: "AT_POINT" },
    ],
  };
}

/** The JS half of openBoardWhere: an AT_POINT parcel is only claimable once it
 *  reached its DESTINATION hub — at the origin it is waiting for line-haul. */
export function boardReadyAtPoint(s: {
  status: string;
  deliveryPointId: string | null;
  atPointId: string | null;
}): boolean {
  return s.status !== "AT_POINT" || s.atPointId === s.deliveryPointId;
}

/**
 * Post a parcel on the open board (idempotent — an already-boarded parcel is
 * left alone and nobody is re-notified) and tell eligible couriers about it:
 * drivers who shared a location in the destination governorate when there are
 * any, otherwise every active courier. COD-blocked drivers are skipped — they
 * can't claim until they remit, so pinging them is noise. Returns true when
 * the parcel is on the board after the call.
 */
export async function boardShipment(shipmentId: string): Promise<boolean> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      driverId: true,
      boardedAt: true,
      platformManaged: true,
      status: true,
      deliveryPointId: true,
      atPointId: true,
      subOrder: {
        select: {
          status: true,
          shippingMethod: true,
          order: {
            select: {
              address: { select: { city: true, governorate: true } },
            },
          },
        },
      },
    },
  });
  if (
    !shipment ||
    !shipment.platformManaged ||
    shipment.driverId ||
    shipment.subOrder?.status !== "SHIPPED" ||
    shipment.subOrder.shippingMethod === "PICKUP" ||
    !boardReadyAtPoint(shipment)
  ) {
    return false;
  }
  const ready = shipment.deliveryPointId
    ? shipment.status === "AT_POINT"
    : ["PENDING", "LABEL_CREATED", "IN_TRANSIT"].includes(shipment.status);
  if (!ready) return false;
  if (shipment.boardedAt) return true;

  // Conditional so a concurrent claim/assign or double-boarding is harmless.
  const posted = await prisma.shipment.updateMany({
    where: { id: shipmentId, driverId: null, boardedAt: null },
    data: { boardedAt: new Date() },
  });
  if (posted.count !== 1) return false;

  // Fan the news out. Best-effort: a failed notification never un-boards.
  const dest = shipment.subOrder.order.address;
  try {
    const couriers = await prisma.user.findMany({
      where: {
        roles: { has: "COURIER" },
        isSuspended: false,
        deletedAt: null,
        // Paused drivers asked for quiet — no board pings either.
        courierPausedAt: null,
      },
      select: {
        id: true,
        locale: true,
        courierLocation: { select: { governorate: true } },
      },
    });
    const blocked = await codBlockedCourierIds(couriers.map((c) => c.id));
    const eligible = couriers.filter((c) => !blocked.has(c.id));
    const local = eligible.filter(
      (c) => c.courierLocation?.governorate === dest.governorate,
    );
    const audience = local.length > 0 ? local : eligible;
    await Promise.all(
      audience.map((c) => {
        const ar = c.locale === "ar";
        return notify({
          userId: c.id,
          type: "SHIPMENT",
          title: ar ? "توصيلة جديدة في لوحة المهام" : "New job on the board",
          body: ar
            ? `توصيلة إلى ${dest.city} متاحة الآن — أول من يقبلها يأخذها.`
            : `A delivery to ${dest.city} is up for grabs — first to claim it takes it.`,
          link: "/driver/board",
          email: false,
        }).catch(() => {});
      }),
    );
  } catch {
    // Board state is what matters; the sweep and the board page still work.
  }
  return true;
}

/**
 * Repeat reminder for unclaimed board jobs (the small-fleet safety net): when
 * parcels have sat on the board longer than `reminderMinutes` since they were
 * posted (or last reminded), re-ping eligible couriers — ONE aggregated
 * notification per driver, however many parcels are waiting, so a slow
 * morning never turns into notification spam. Escalated parcels are included
 * on purpose: a cascade that ran dry is exactly when a waking driver's claim
 * matters most. Returns how many parcels were covered by this round.
 */
export async function remindOpenBoardJobs(
  reminderMinutes: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - reminderMinutes * 60_000);
  const rows = await prisma.shipment.findMany({
    where: {
      AND: [
        openBoardWhere(),
        { boardedAt: { lt: cutoff } },
        {
          OR: [{ boardRemindedAt: null }, { boardRemindedAt: { lt: cutoff } }],
        },
      ],
    },
    take: 100,
    select: {
      id: true,
      status: true,
      deliveryPointId: true,
      atPointId: true,
    },
  });
  const due = rows.filter(boardReadyAtPoint);
  if (due.length === 0) return 0;

  // Stamp first, then notify — a notify failure must not re-spam next run.
  await prisma.shipment.updateMany({
    where: { id: { in: due.map((s) => s.id) } },
    data: { boardRemindedAt: new Date() },
  });

  const couriers = await prisma.user.findMany({
    where: { roles: { has: "COURIER" }, isSuspended: false, deletedAt: null },
    select: { id: true, locale: true },
  });
  const blocked = await codBlockedCourierIds(couriers.map((c) => c.id));
  const eligible = couriers.filter((c) => !blocked.has(c.id));
  const count = due.length;
  await Promise.all(
    eligible.map((c) => {
      const ar = c.locale === "ar";
      return notify({
        userId: c.id,
        type: "SHIPMENT",
        title: ar
          ? "مهام ما زالت بانتظارك في لوحة المهام"
          : "Jobs still waiting on the board",
        body: ar
          ? count === 1
            ? "ما زالت مهمة توصيل بانتظار من يقبلها — الأسبق يأخذها."
            : `ما زالت ${count} مهمة توصيل بانتظار من يقبلها — الأسبق يأخذها.`
          : count === 1
            ? "A delivery job is still waiting on the board — first to claim it takes it."
            : `${count} delivery jobs are still waiting on the board — first to claim takes them.`,
        link: "/driver/board",
        email: false,
      }).catch(() => {});
    }),
  );
  return count;
}

/**
 * Entry point for "a platform parcel just became ready for a doorstep
 * courier" (the ship action for direct parcels, the destination point's
 * receive scan for routed ones). Routes by mode:
 *   - board on  → post it on the open board (during dispatch hours only —
 *     night parcels queue exactly like the push flow, and the first sweep
 *     after opening boards them). Push-offers start later, from the sweep,
 *     once the board-only window lapses.
 *   - board off → classic auto-assign push offer, when that is enabled.
 */
export async function dispatchShippedParcel(shipmentId: string): Promise<void> {
  const settings = await getPlatformSettings();
  if (settings.job_board_enabled) {
    if (
      isDispatchOpen(settings.dispatch_hours_start, settings.dispatch_hours_end)
    ) {
      await boardShipment(shipmentId);
    }
    return;
  }
  if (settings.express_auto_assign) {
    await autoAssignShipment(shipmentId);
  }
}
