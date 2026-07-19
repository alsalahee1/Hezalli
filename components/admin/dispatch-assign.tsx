"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { assignCourier } from "@/lib/actions/courier";
import { useRouter } from "@/i18n/navigation";

export type CourierOpt = { id: string; name: string };

export function DispatchAssign({
  shipmentId,
  driverId,
  couriers,
}: {
  shipmentId: string;
  driverId: string | null;
  couriers: CourierOpt[];
}) {
  const t = useTranslations("Dispatch");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(driverId ?? "");
  const [err, setErr] = useState(false);

  const onChange = (next: string) => {
    setValue(next);
    setErr(false);
    start(async () => {
      const res = await assignCourier(shipmentId, next);
      if (res.error) {
        setErr(true);
        setValue(driverId ?? "");
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        disabled={pending || couriers.length === 0}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border bg-transparent px-3 text-sm disabled:opacity-50"
        aria-label={t("assignTo")}
      >
        <option value="">{t("unassigned")}</option>
        {couriers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {pending ? (
        <span className="text-muted-foreground text-xs">{t("saving")}</span>
      ) : err ? (
        <span className="text-destructive text-xs">{t("assignError")}</span>
      ) : null}
    </div>
  );
}
