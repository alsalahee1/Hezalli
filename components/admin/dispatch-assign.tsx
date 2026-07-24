"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { assignCourier } from "@/lib/actions/courier";
import { useRouter } from "@/i18n/navigation";
import { Select } from "@/components/ui/select";

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
      <Select
        value={value}
        disabled={pending || couriers.length === 0}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("assignTo")}
      >
        <option value="">{t("unassigned")}</option>
        {couriers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      {pending ? (
        <span className="text-muted-foreground text-xs">{t("saving")}</span>
      ) : err ? (
        <span className="text-destructive text-xs">{t("assignError")}</span>
      ) : null}
    </div>
  );
}
