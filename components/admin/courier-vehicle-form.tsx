"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { setCourierVehicle } from "@/lib/actions/courier";
import { VEHICLE_TYPES } from "@/lib/validations/courier";
import { useRouter } from "@/i18n/navigation";

// Ops picks the vehicle a courier drives (saved on change, like the dispatch
// assign select). The vehicle caps how much weight / how many parcels
// auto-assignment gives this driver — see lib/courier-capacity.ts.
export function CourierVehicleForm({
  courierId,
  vehicleType,
}: {
  courierId: string;
  vehicleType: string | null;
}) {
  const t = useTranslations("AdminCouriers");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(vehicleType ?? "");
  const [err, setErr] = useState(false);

  const onChange = (next: string) => {
    setValue(next);
    setErr(false);
    start(async () => {
      const res = await setCourierVehicle(courierId, next);
      if (res.error) {
        setErr(true);
        setValue(vehicleType ?? "");
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border bg-transparent px-3 text-sm disabled:opacity-50"
        aria-label={t("vehicleLabel")}
      >
        <option value="">{t("vehicleNone")}</option>
        {VEHICLE_TYPES.map((v) => (
          <option key={v} value={v}>
            {t(`vehicle_${v}`)}
          </option>
        ))}
      </select>
      {pending ? (
        <span className="text-muted-foreground text-xs">{t("saving")}</span>
      ) : err ? (
        <span className="text-destructive text-xs">{t("saveError")}</span>
      ) : null}
    </div>
  );
}
