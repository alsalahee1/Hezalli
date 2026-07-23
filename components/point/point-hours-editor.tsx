"use client";

import { useState, useTransition } from "react";
import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";

import { setPointHours } from "@/lib/actions/point";
import type { WeeklyHours } from "@/lib/point-hours";
import { useRouter } from "@/i18n/navigation";

// Editable weekly opening hours (docs §42g). Seven rows, each an open/close
// pair or a "closed" toggle; Save writes the whole schedule through the
// owner/manager-gated setPointHours action. Times are Asia/Aden wall clock.
export function PointHoursEditor({ initial }: { initial: WeeklyHours | null }) {
  const t = useTranslations("Point");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  // Day labels are index 0=Sunday..6=Saturday (JS getUTCDay order).
  const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

  const [rows, setRows] = useState<WeeklyHours>(() =>
    Array.from({ length: 7 }, (_, i) => initial?.[i] ?? null),
  );

  const setDay = (i: number, next: { open: string; close: string } | null) =>
    setRows((r) => r.map((d, j) => (j === i ? next : d)));

  const save = () =>
    start(async () => {
      setError(false);
      setSaved(false);
      // Any published day must have both ends filled; otherwise treat as closed.
      const cleaned: WeeklyHours = rows.map((d) =>
        d && d.open && d.close ? { open: d.open, close: d.close } : null,
      );
      const res = await setPointHours(cleaned);
      if (res.error) setError(true);
      else {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <Clock className="size-4" /> {t("hoursTitle")}
      </h2>
      <p className="text-muted-foreground text-xs">{t("hoursHint")}</p>

      <div className="space-y-2">
        {rows.map((d, i) => {
          const open = d !== null;
          return (
            <div key={dayKeys[i]} className="flex items-center gap-2 text-sm">
              <span className="w-10 shrink-0 font-medium">
                {t(`day_${dayKeys[i]}`)}
              </span>
              <label className="text-muted-foreground flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={open}
                  onChange={(e) =>
                    setDay(
                      i,
                      e.target.checked
                        ? { open: "09:00", close: "18:00" }
                        : null,
                    )
                  }
                />
                {t("hoursOpen")}
              </label>
              {open ? (
                <div className="flex items-center gap-1" dir="ltr">
                  <input
                    type="time"
                    value={d.open}
                    onChange={(e) => setDay(i, { ...d, open: e.target.value })}
                    className="border-input bg-background rounded-md border px-2 py-1 text-xs"
                  />
                  <span className="text-muted-foreground">–</span>
                  <input
                    type="time"
                    value={d.close}
                    onChange={(e) => setDay(i, { ...d, close: e.target.value })}
                    className="border-input bg-background rounded-md border px-2 py-1 text-xs"
                  />
                </div>
              ) : (
                <span className="text-muted-foreground text-xs">
                  {t("hoursClosed")}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="bg-primary text-primary-foreground rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
        >
          {t("hoursSave")}
        </button>
        {saved ? (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            {t("hoursSaved")}
          </span>
        ) : null}
        {error ? (
          <span className="text-destructive text-xs">{t("hoursError")}</span>
        ) : null}
      </div>
    </section>
  );
}
