"use client";

import { useState, useTransition } from "react";
import { CalendarClock } from "lucide-react";
import { useTranslations } from "next-intl";

import { requestRedelivery } from "@/lib/actions/redelivery";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// After a failed delivery attempt the buyer picks a new day (and an optional
// note like "after 4 pm" / "call first"). Shown on the order page while the
// parcel is FAILED or RETURNED_TO_POINT.
export function RedeliveryForm({
  subOrderId,
  currentDate,
}: {
  subOrderId: string;
  currentDate: string | null; // ISO yyyy-mm-dd of an already-requested day
}) {
  const t = useTranslations("Orders");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(currentDate ?? "");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const min = new Date().toISOString().slice(0, 10);
  const max = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  const submit = () =>
    start(async () => {
      setErr(null);
      const res = await requestRedelivery(subOrderId, date, note);
      if (res.error) setErr(res.error);
      else {
        setDone(true);
        router.refresh();
      }
    });

  return (
    <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-500">
        <CalendarClock className="size-4" /> {t("redeliveryTitle")}
      </p>
      <p className="text-muted-foreground text-xs">{t("redeliveryHint")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          type="date"
          value={date}
          min={min}
          max={max}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 w-40"
          dir="ltr"
        />
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("redeliveryNotePh")}
          className="h-9 flex-1 basis-48"
        />
        <Button size="sm" onClick={submit} disabled={pending || !date}>
          {pending ? t("redeliverySaving") : t("redeliverySubmit")}
        </Button>
      </div>
      {done ? (
        <p className="text-xs text-emerald-600">{t("redeliverySaved")}</p>
      ) : null}
      {err ? (
        <p className="text-destructive text-xs">{t(`redeliveryErr_${err}`)}</p>
      ) : null}
    </div>
  );
}
