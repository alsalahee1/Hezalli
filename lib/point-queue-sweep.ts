// Approaching-slot reminder sweep (docs/DELIVERY-POINTS.md §45). Notifications
// only: when a booked visitor's arrival slot is coming up within
// `queue_reminder_minutes`, nudge them once so a reservation doesn't slip. A
// one-shot guard (PointQueueEntry.remindedAt, claimed with a race-safe
// updateMany before the notification is written) keeps re-runs harmless.
//
// Runs from the existing CRON_SECRET-protected /api/cron/points endpoint,
// alongside the stale-parcel sweep.
import { notify } from "@/lib/notify";
import { minutesNowAden, serviceDayFor } from "@/lib/point-queue";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

const BATCH = 200;

export type QueueSweepResult = {
  reminded: number; // booked visitors nudged that their slot is near
};

/** Nudge booked visitors whose slot starts within the reminder window. Safe to
 *  call as often as you like; each entry is reminded at most once. */
export async function sweepQueueReminders(): Promise<QueueSweepResult> {
  const [enabled, reminderMinutes] = await Promise.all([
    getSetting("queue_enabled"),
    getSetting("queue_reminder_minutes"),
  ]);
  if (!enabled || reminderMinutes <= 0) return { reminded: 0 };

  const serviceDay = serviceDayFor();
  const nowMin = minutesNowAden();

  // Booked, not yet reminded, at an active hub, whose slot starts between now
  // and the reminder horizon (a slot already past is skipped by gte: nowMin).
  const due = await prisma.pointQueueEntry.findMany({
    where: {
      status: "BOOKED",
      serviceDay,
      remindedAt: null,
      slotStart: { gte: nowMin, lte: nowMin + reminderMinutes },
      point: { status: "ACTIVE" },
    },
    select: {
      id: true,
      userId: true,
      pointId: true,
      slotStart: true,
      point: { select: { name: true } },
      user: { select: { locale: true } },
    },
    take: BATCH,
  });

  let reminded = 0;
  for (const e of due) {
    // Claim the one-shot guard; a concurrent run that got here first skips it.
    const claim = await prisma.pointQueueEntry.updateMany({
      where: { id: e.id, remindedAt: null },
      data: { remindedAt: new Date() },
    });
    if (claim.count === 0) continue;

    const ar = e.user.locale === "ar";
    const time =
      e.slotStart == null
        ? ""
        : `${String(Math.floor(e.slotStart / 60)).padStart(2, "0")}:${String(
            e.slotStart % 60,
          ).padStart(2, "0")}`;
    await notify({
      userId: e.userId,
      type: "SHIPMENT",
      title: ar ? "موعدك يقترب" : "Your slot is coming up",
      body: ar
        ? `موعدك في ${e.point.name} الساعة ${time}. سجّل وصولك عند حضورك.`
        : `Your slot at ${e.point.name} is at ${time}. Check in when you arrive.`,
      link: `/points/${e.pointId}/queue`,
      data: { pointId: e.pointId, entryId: e.id },
    });
    reminded++;
  }

  return { reminded };
}

/**
 * Close out bookings that were never honoured (docs §46), so a no-show stops
 * consuming a slot's capacity and stops showing as the visitor's "current"
 * ticket:
 *  - today's BOOKED whose slot ended more than one slot-length ago (a grace
 *    period so someone walking in a little late isn't cut off);
 *  - any still-open entry left over from a previous service day.
 * Pure state cleanup — no notification, no money.
 */
export async function sweepQueueNoShows(): Promise<{ expired: number }> {
  const [enabled, slotMinutes] = await Promise.all([
    getSetting("queue_enabled"),
    getSetting("queue_slot_minutes"),
  ]);
  if (!enabled) return { expired: 0 };

  const today = serviceDayFor();
  const nowMin = minutesNowAden();
  // Slot ends at slotStart + slotMinutes; add one slot of grace after that.
  const cutoff = nowMin - 2 * slotMinutes;

  const [todayGone, staleGone] = await Promise.all([
    prisma.pointQueueEntry.updateMany({
      where: {
        status: "BOOKED",
        serviceDay: today,
        slotStart: { not: null, lte: cutoff },
      },
      data: { status: "NO_SHOW" },
    }),
    // Anything still open from an earlier day is dead — a stale booking would
    // otherwise resurface as the visitor's active ticket (myQueueEntry isn't
    // day-scoped).
    prisma.pointQueueEntry.updateMany({
      where: {
        status: { in: ["BOOKED", "WAITING", "SERVING"] },
        serviceDay: { lt: today },
      },
      data: { status: "NO_SHOW" },
    }),
  ]);

  return { expired: todayGone.count + staleGone.count };
}
