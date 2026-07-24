import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { liveQueue, type LaneView, type QueueRow } from "@/lib/point-queue";
import { getPlatformSettings } from "@/lib/settings";
import {
  QueueConsole,
  type ConsoleLane,
  type ConsoleRow,
} from "@/components/point/queue-console";

// The counter's live arrival queue (docs §44): drop-offs and collections in
// separate lanes, each served in fair arrival order. Kills the morning
// "who's first" scrum — the ticket number is the answer.
export default async function PointQueuePage() {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  const t = await getTranslations("Point");
  const settings = await getPlatformSettings();

  if (!settings.queue_enabled) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">{t("queueTitle")}</h1>
        <p className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
          {t("queueDisabled")}
        </p>
      </div>
    );
  }

  const queue = await liveQueue(gate.pointId);
  const now = Date.now();
  const toConsole = (r: QueueRow): ConsoleRow => ({
    id: r.id,
    ticketNo: r.ticketNo,
    slotLabel: r.slotLabel,
    parcelCount: r.parcelCount,
    userName: r.userName,
    note: r.note,
    waitedMin: r.arrivedAt
      ? Math.max(0, Math.round((now - r.arrivedAt.getTime()) / 60_000))
      : null,
  });
  const toLane = (l: LaneView): ConsoleLane => ({
    serving: l.serving.map(toConsole),
    waiting: l.waiting.map(toConsole),
    booked: l.booked.map(toConsole),
  });

  const total = queue.dropoff.waiting.length + queue.collection.waiting.length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="size-5" /> {t("queueTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("queueWaitingTotal", { count: total })}
        </p>
      </div>

      <QueueConsole
        dropoff={toLane(queue.dropoff)}
        collection={toLane(queue.collection)}
      />
    </div>
  );
}
