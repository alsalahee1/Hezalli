"use client";

import { useState, useTransition } from "react";
import { BellRing, CalendarClock, Check, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  bookPointSlot,
  cancelQueueEntry,
  checkInToPoint,
} from "@/lib/actions/point-queue";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Slot = {
  start: number;
  label: string;
  full: boolean;
  past: boolean;
};

export type MyEntry = {
  id: string;
  kind: "DROPOFF" | "COLLECTION";
  status: string;
  ticketNo: number | null;
  slotLabel: string | null;
  ahead: number | null;
};

// Self-service arrival page for a seller/driver at one hub (docs §44): see your
// current ticket, book a time slot, or check in on arrival. All writes go
// through the point-queue actions; the page refreshes to reflect new state.
export function QueueCheckin({
  pointId,
  signedIn,
  status,
  dropoffSlots,
  collectionSlots,
  myEntry,
}: {
  pointId: string;
  signedIn: boolean;
  status: "open" | "disabled" | "closed" | "noHours";
  dropoffSlots: Slot[];
  collectionSlots: Slot[];
  myEntry: MyEntry | null;
}) {
  const t = useTranslations("Point");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<"DROPOFF" | "COLLECTION">("DROPOFF");
  const [parcels, setParcels] = useState("");

  const act = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.error) setErr(res.error);
      else router.refresh();
    });

  if (!signedIn) {
    return (
      <div className="rounded-xl border p-6 text-center">
        <p className="text-sm">{t("queueSignInPrompt")}</p>
        <Button asChild className="mt-3">
          <Link href="/login">
            <LogIn className="size-4" /> {t("queueSignIn")}
          </Link>
        </Button>
      </div>
    );
  }

  const errLine = err ? (
    <p className="text-destructive text-sm">{t(`err_${err}`)}</p>
  ) : null;

  // Already in the system today — show the ticket and the one relevant action.
  if (myEntry) {
    const laneLabel =
      myEntry.kind === "DROPOFF" ? t("queueDropoff") : t("queueCollection");
    return (
      <div className="space-y-3">
        {myEntry.status === "SERVING" ? (
          <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-5 text-center">
            <BellRing className="mx-auto size-7 text-emerald-600" />
            <p className="mt-2 text-lg font-semibold text-emerald-700 dark:text-emerald-400">
              {t("queueYourTurn")}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("queueYourTurnHint")}
            </p>
            <p className="mt-2 text-3xl font-bold" dir="ltr">
              #{myEntry.ticketNo}
            </p>
          </div>
        ) : myEntry.status === "WAITING" ? (
          <div className="rounded-xl border p-5 text-center">
            <p className="text-muted-foreground text-sm">{laneLabel}</p>
            <p className="mt-1 text-4xl font-bold" dir="ltr">
              #{myEntry.ticketNo}
            </p>
            <p className="text-muted-foreground mt-2 text-sm">
              {myEntry.ahead && myEntry.ahead > 0
                ? t("queueAhead", { count: myEntry.ahead })
                : t("queueNext")}
            </p>
          </div>
        ) : (
          // BOOKED
          <div className="rounded-xl border p-5 text-center">
            <CalendarClock className="text-primary mx-auto size-6" />
            <p className="mt-2 text-sm">
              {t("queueBookedFor", { time: myEntry.slotLabel ?? "" })} ·{" "}
              {laneLabel}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {t("queueBookedHint")}
            </p>
            <Button
              className="mt-3"
              onClick={() => act(() => checkInToPoint({ pointId }))}
              disabled={pending}
            >
              <Check className="size-4" /> {t("queueCheckIn")}
            </Button>
          </div>
        )}
        {errLine}
        {myEntry.status !== "SERVING" ? (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => act(() => cancelQueueEntry(myEntry.id))}
            disabled={pending}
          >
            {t("queueCancel")}
          </Button>
        ) : null}
      </div>
    );
  }

  if (status !== "open") {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed py-12 text-center text-sm">
        {t(
          status === "disabled"
            ? "queueDisabled"
            : status === "noHours"
              ? "queueNoHours"
              : "queueClosed",
        )}
      </p>
    );
  }

  const slots = kind === "DROPOFF" ? dropoffSlots : collectionSlots;

  return (
    <div className="space-y-4">
      {/* Lane picker — the two flows are served separately. */}
      <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
        {(["DROPOFF", "COLLECTION"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={
              kind === k
                ? "bg-background rounded-md px-3 py-1.5 text-sm font-medium shadow-sm"
                : "text-muted-foreground rounded-md px-3 py-1.5 text-sm"
            }
          >
            {k === "DROPOFF" ? t("queueDropoff") : t("queueCollection")}
          </button>
        ))}
      </div>

      {kind === "DROPOFF" ? (
        <label className="block">
          <span className="text-muted-foreground text-sm">
            {t("queueParcelCount")}
          </span>
          <Input
            type="number"
            min={1}
            inputMode="numeric"
            value={parcels}
            onChange={(e) => setParcels(e.target.value)}
            placeholder="1"
            className="mt-1"
          />
        </label>
      ) : null}

      {/* Walk-in: I'm here now. */}
      <Button
        className="w-full"
        onClick={() =>
          act(() =>
            checkInToPoint({
              pointId,
              kind,
              parcelCount: parcels ? Number(parcels) : null,
            }),
          )
        }
        disabled={pending}
      >
        <Check className="size-4" /> {t("queueCheckInNow")}
      </Button>

      {errLine}

      {/* Or reserve a time. */}
      <div>
        <p className="text-muted-foreground mb-2 text-sm font-medium">
          {t("queueBookHeading")}
        </p>
        {slots.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("queueNoSlots")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => {
              const disabled = pending || s.full || s.past;
              return (
                <button
                  key={s.start}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    act(() =>
                      bookPointSlot({
                        pointId,
                        kind,
                        slotStart: s.start,
                        parcelCount: parcels ? Number(parcels) : null,
                      }),
                    )
                  }
                  className={
                    disabled
                      ? "text-muted-foreground cursor-not-allowed rounded-lg border border-dashed py-2 text-sm line-through"
                      : "hover:border-primary hover:bg-primary/5 rounded-lg border py-2 text-sm font-medium"
                  }
                  dir="ltr"
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
