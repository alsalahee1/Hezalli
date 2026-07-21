"use client";

import { CalendarClock } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

// A buyer's scheduled delivery window (preferred day + time-of-day slot), shown
// on the dispatch board, the courier's job views, and the buyer's order page.
// The day is a date-only value stored at UTC midnight — render it in UTC so the
// calendar day never drifts across timezones.
export function DeliveryWindowBadge({
  date,
  slot,
  className,
}: {
  date: Date | string;
  slot: string;
  className?: string;
}) {
  const t = useTranslations("DeliveryWindow");
  const format = useFormatter();
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-400",
        className,
      )}
    >
      <CalendarClock className="size-3" />
      {format.dateTime(d, { dateStyle: "medium", timeZone: "UTC" })} ·{" "}
      {t(`slot_${slot}`)}
    </span>
  );
}
