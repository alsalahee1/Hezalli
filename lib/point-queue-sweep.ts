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
