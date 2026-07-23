"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { setVehicleCapacity } from "@/lib/actions/courier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// One vehicle class on the capacity page: max weight (kg), volume (L),
// parcels, and longest item (cm), prefilled with the live values. Save stores
// an override; Reset returns the vehicle to the shipped defaults.
export function VehicleCapacityRow({
  vehicleType,
  maxWeightKg,
  maxVolumeLiters,
  maxParcels,
  maxItemLongestSideCm,
  overridden,
}: {
  vehicleType: string;
  maxWeightKg: number;
  maxVolumeLiters: number;
  maxParcels: number;
  maxItemLongestSideCm: number;
  overridden: boolean;
}) {
  const t = useTranslations("AdminCouriers");
  const [pending, start] = useTransition();
  const [kg, setKg] = useState(String(maxWeightKg));
  const [liters, setLiters] = useState(String(maxVolumeLiters));
  const [parcels, setParcels] = useState(String(maxParcels));
  const [longest, setLongest] = useState(String(maxItemLongestSideCm));
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");

  const run = (
    capacity: Parameters<typeof setVehicleCapacity>[1],
    after?: () => void,
  ) => {
    setState("idle");
    start(async () => {
      const res = await setVehicleCapacity(vehicleType, capacity);
      setState(res.ok ? "saved" : "error");
      if (res.ok) after?.();
    });
  };

  const save = () =>
    run({
      maxWeightKg: Number(kg),
      maxVolumeLiters: Number(liters),
      maxParcels: Number(parcels),
      maxItemLongestSideCm: Number(longest),
    });

  const field = (
    value: string,
    onChange: (v: string) => void,
    label: string,
    width = "w-28",
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <Input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={width}
      />
    </label>
  );

  return (
    <div className="flex flex-wrap items-end gap-2" dir="ltr">
      {field(kg, setKg, t("capMaxKg"))}
      {field(liters, setLiters, t("capMaxLiters"))}
      {field(parcels, setParcels, t("capMaxParcels"), "w-24")}
      {field(longest, setLongest, t("capMaxItemCm"))}
      <Button type="button" size="sm" onClick={save} disabled={pending}>
        {pending ? t("saving") : t("capSave")}
      </Button>
      {overridden ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(null)}
        >
          {t("capReset")}
        </Button>
      ) : null}
      {state === "saved" ? (
        <span className="pb-2 text-xs text-emerald-600">{t("capSaved")}</span>
      ) : state === "error" ? (
        <span className="text-destructive pb-2 text-xs">{t("saveError")}</span>
      ) : null}
    </div>
  );
}
