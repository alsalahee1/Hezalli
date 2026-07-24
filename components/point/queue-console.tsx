"use client";

import { useState, useTransition } from "react";
import { BellRing, Check, PackageOpen, Truck, UserX } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  callNextInQueue,
  callQueueEntry,
  markQueueNoShow,
  serveQueueEntry,
} from "@/lib/actions/point-queue";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export type ConsoleRow = {
  id: string;
  ticketNo: number | null;
  slotLabel: string | null;
  parcelCount: number | null;
  userName: string | null;
  note: string | null;
  waitedMin: number | null;
};

export type ConsoleLane = {
  serving: ConsoleRow[];
  waiting: ConsoleRow[];
  booked: ConsoleRow[];
};

// The operator's live queue for one hub: two lanes, each with a "call next"
// button and per-ticket serve / no-show controls. All state changes go through
// the point-queue server actions, then refresh.
export function QueueConsole({
  dropoff,
  collection,
}: {
  dropoff: ConsoleLane;
  collection: ConsoleLane;
}) {
  const t = useTranslations("Point");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Lane
        kind="DROPOFF"
        title={t("queueDropoff")}
        icon={<PackageOpen className="size-4" />}
        lane={dropoff}
      />
      <Lane
        kind="COLLECTION"
        title={t("queueCollection")}
        icon={<Truck className="size-4" />}
        lane={collection}
      />
    </div>
  );
}

function Lane({
  kind,
  title,
  icon,
  lane,
}: {
  kind: "DROPOFF" | "COLLECTION";
  title: string;
  icon: React.ReactNode;
  lane: ConsoleLane;
}) {
  const t = useTranslations("Point");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const act = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.error) setErr(res.error);
      else router.refresh();
    });

  const empty =
    lane.serving.length === 0 &&
    lane.waiting.length === 0 &&
    lane.booked.length === 0;

  return (
    <section className="space-y-3 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          {icon} {title}
          <span className="bg-muted rounded px-1.5 text-xs">
            {lane.waiting.length}
          </span>
        </h2>
        <Button
          size="sm"
          onClick={() => act(() => callNextInQueue(kind))}
          disabled={pending || lane.waiting.length === 0}
        >
          <BellRing className="size-4" /> {t("queueCallNext")}
        </Button>
      </div>

      {err ? (
        <p className="text-destructive text-xs">{t(`err_${err}`)}</p>
      ) : null}

      {empty ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {t("queueLaneEmpty")}
        </p>
      ) : null}

      {/* Now serving — highlighted so the counter always sees who's up. */}
      {lane.serving.map((r) => (
        <div
          key={r.id}
          className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-2.5"
        >
          <Head row={r} nowServing t={t} />
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => act(() => serveQueueEntry(r.id))}
              disabled={pending}
            >
              <Check className="size-4" /> {t("queueDone")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => act(() => markQueueNoShow(r.id))}
              disabled={pending}
            >
              <UserX className="size-4" /> {t("queueNoShow")}
            </Button>
          </div>
        </div>
      ))}

      {/* Waiting — arrival order. */}
      {lane.waiting.map((r) => (
        <div key={r.id} className="rounded-lg border p-2.5">
          <Head row={r} t={t} />
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => act(() => callQueueEntry(r.id))}
              disabled={pending}
            >
              <BellRing className="size-4" /> {t("queueCall")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => act(() => serveQueueEntry(r.id))}
              disabled={pending}
            >
              <Check className="size-4" /> {t("queueDone")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => act(() => markQueueNoShow(r.id))}
              disabled={pending}
            >
              <UserX className="size-4" /> {t("queueNoShow")}
            </Button>
          </div>
        </div>
      ))}

      {/* Booked for later — not yet arrived; slot time only. */}
      {lane.booked.length > 0 ? (
        <div className="space-y-1.5 pt-1">
          <p className="text-muted-foreground text-xs font-semibold">
            {t("queueBookedLater")}
          </p>
          {lane.booked.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-dashed px-2.5 py-1.5"
            >
              <span className="truncate text-sm">
                <span className="font-medium" dir="ltr">
                  {r.slotLabel}
                </span>
                {r.userName ? ` · ${r.userName}` : ""}
                {r.parcelCount
                  ? ` · ${t("queueParcels", { count: r.parcelCount })}`
                  : ""}
              </span>
              <button
                type="button"
                onClick={() => act(() => markQueueNoShow(r.id))}
                disabled={pending}
                className="text-muted-foreground hover:text-destructive text-xs"
              >
                {t("queueNoShow")}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Head({
  row,
  nowServing,
  t,
}: {
  row: ConsoleRow;
  nowServing?: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span
          className={
            nowServing
              ? "rounded bg-emerald-600 px-2 py-0.5 text-sm font-bold text-white"
              : "bg-muted rounded px-2 py-0.5 text-sm font-bold"
          }
          dir="ltr"
        >
          #{row.ticketNo}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {row.userName ?? t("queueVisitor")}
          </span>
          <span className="text-muted-foreground block text-xs">
            {row.parcelCount
              ? t("queueParcels", { count: row.parcelCount })
              : null}
            {row.parcelCount && row.waitedMin != null ? " · " : ""}
            {row.waitedMin != null
              ? t("queueWaited", { min: row.waitedMin })
              : null}
          </span>
        </span>
      </div>
    </div>
  );
}
