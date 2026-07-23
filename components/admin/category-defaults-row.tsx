"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { setCategoryShippingDefaults } from "@/lib/actions/category";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// One category row on the delivery-defaults page: weight + L×W×H inputs and a
// save button. Only the two delivery fields are editable — the rest of the
// category is read-only here by design (the full manager is admin-only).
export function CategoryDefaultsRow({
  categoryId,
  defaultWeightGrams,
  defaultDimensionsCm,
}: {
  categoryId: string;
  defaultWeightGrams: number | null;
  defaultDimensionsCm: { l: number; w: number; h: number } | null;
}) {
  const t = useTranslations("AdminCategories");
  const [pending, start] = useTransition();
  const [weight, setWeight] = useState(
    defaultWeightGrams == null ? "" : String(defaultWeightGrams),
  );
  const [l, setL] = useState(
    defaultDimensionsCm ? String(defaultDimensionsCm.l) : "",
  );
  const [w, setW] = useState(
    defaultDimensionsCm ? String(defaultDimensionsCm.w) : "",
  );
  const [h, setH] = useState(
    defaultDimensionsCm ? String(defaultDimensionsCm.h) : "",
  );
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");

  const save = () => {
    setState("idle");
    start(async () => {
      const wNum = weight.trim() === "" ? null : Number(weight);
      const sides = [l, w, h].map((v) => Number(v) || 0);
      const dims =
        sides[0] > 0 && sides[1] > 0 && sides[2] > 0
          ? { l: sides[0], w: sides[1], h: sides[2] }
          : null;
      const res = await setCategoryShippingDefaults(categoryId, wNum, dims);
      setState(res.ok ? "saved" : "error");
    });
  };

  const side = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
  ) => (
    <Input
      type="number"
      min={1}
      max={1000}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-20"
    />
  );

  return (
    <div className="flex flex-wrap items-center gap-2" dir="ltr">
      <Input
        type="number"
        min={0}
        value={weight}
        placeholder={t("defaultWeight")}
        onChange={(e) => setWeight(e.target.value)}
        className="w-32"
      />
      {side(l, setL, t("dimL"))}
      {side(w, setW, t("dimW"))}
      {side(h, setH, t("dimH"))}
      <Button type="button" size="sm" onClick={save} disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
      {state === "saved" ? (
        <span className="text-xs text-emerald-600">{t("saved")}</span>
      ) : state === "error" ? (
        <span className="text-destructive text-xs">{t("saveError")}</span>
      ) : null}
    </div>
  );
}
