"use client";

import { useState, useTransition } from "react";
import { CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";

import { setPointSlotCapacity } from "@/lib/actions/point";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Per-hub arrival-queue slot cap (docs §45). Owner/manager sets how many
// bookings one time slot + lane accepts here; blank clears the override so the
// hub falls back to the platform default. Writes through the gated
// setPointSlotCapacity action.
export function PointSlotCapacityEditor({
  initial,
  platformDefault,
}: {
  initial: number | null;
  platformDefault: number;
}) {
  const t = useTranslations("Point");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(initial == null ? "" : String(initial));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  const save = () =>
    start(async () => {
      setError(false);
      setSaved(false);
      const trimmed = value.trim();
      const cap = trimmed === "" ? null : Math.trunc(Number(trimmed));
      const res = await setPointSlotCapacity(cap);
      if (res.error) setError(true);
      else {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <CalendarClock className="size-4" /> {t("slotCapTitle")}
      </h2>
      <p className="text-muted-foreground text-xs">
        {t("slotCapHint", { default: platformDefault })}
      </p>
      <div className="flex items-center gap-2" dir="ltr">
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("slotCapDefault", { default: platformDefault })}
          className="w-40"
        />
        <Button type="button" onClick={save} disabled={pending}>
          {t("hoursSave")}
        </Button>
      </div>
      {saved ? (
        <span className="text-xs text-emerald-600 dark:text-emerald-400">
          {t("hoursSaved")}
        </span>
      ) : null}
      {error ? (
        <span className="text-destructive text-xs">{t("hoursError")}</span>
      ) : null}
    </section>
  );
}
