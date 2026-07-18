"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { slugify } from "@/lib/slug";
import type { OptionGroup, VariantInput } from "@/lib/validations/product";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function cartesian(groups: OptionGroup[]): Record<string, string>[] {
  return groups.reduce<Record<string, string>[]>(
    (acc, g) => {
      const name = g.name.trim();
      const values = g.values.map((v) => v.trim()).filter(Boolean);
      if (!name || values.length === 0) return acc;
      const next: Record<string, string>[] = [];
      for (const combo of acc)
        for (const val of values) next.push({ ...combo, [name]: val });
      return next;
    },
    [{}],
  );
}

const sig = (attrs: Record<string, string>) =>
  Object.entries(attrs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");

const nameFrom = (attrs: Record<string, string>) =>
  Object.values(attrs).join(" / ") || "Default";

function regen(
  groups: OptionGroup[],
  prev: VariantInput[],
  skuBase: string,
): VariantInput[] {
  const combos = cartesian(groups);
  return combos.map((attrs) => {
    const existing = prev.find((v) => sig(v.attributes) === sig(attrs));
    if (existing)
      return { ...existing, name: nameFrom(attrs), attributes: attrs };
    const suffix = Object.values(attrs)
      .map((v) => slugify(v))
      .join("-");
    return {
      name: nameFrom(attrs),
      attributes: attrs,
      sku: slugify(`${skuBase}-${suffix || "default"}`) || "sku",
      price: prev[0]?.price ?? 0,
      compareAtPrice: null,
      stock: 0,
    };
  });
}

export function VariantEditor({
  skuBase,
  initialGroups,
  initialVariants,
  errors,
  onChange,
}: {
  skuBase: string;
  initialGroups: OptionGroup[];
  initialVariants: VariantInput[];
  errors?: Record<number, Record<string, string>>;
  onChange: (variants: VariantInput[]) => void;
}) {
  const t = useTranslations("SellerProducts");
  const [hasOptions, setHasOptions] = useState(initialGroups.length > 0);
  const [groups, setGroups] = useState<OptionGroup[]>(initialGroups);
  const [variants, setVariants] = useState<VariantInput[]>(
    initialVariants.length
      ? initialVariants
      : [
          {
            name: "Default",
            attributes: {},
            sku: slugify(skuBase) || "sku",
            price: 0,
            compareAtPrice: null,
            stock: 0,
          },
        ],
  );

  useEffect(() => {
    onChange(variants);
  }, [variants, onChange]);

  const applyGroups = (next: OptionGroup[]) => {
    setGroups(next);
    setVariants((prev) => regen(next, prev, skuBase));
  };

  const toggleOptions = (on: boolean) => {
    setHasOptions(on);
    if (on && groups.length === 0) {
      applyGroups([{ name: "", values: [""] }]);
    } else if (!on) {
      applyGroups([]); // collapses back to a single default variant
    }
  };

  const patch = (i: number, p: Partial<VariantInput>) =>
    setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...p } : v)));

  const err = (i: number, f: string) => errors?.[i]?.[f];

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={hasOptions}
          onChange={(e) => toggleOptions(e.target.checked)}
          className="size-4"
        />
        {t("hasOptions")}
      </label>

      {hasOptions ? (
        <div className="space-y-3 rounded-lg border p-3">
          {groups.map((g, gi) => (
            <div key={gi} className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("optionName")}</Label>
                <Input
                  value={g.name}
                  placeholder={t("optionNamePlaceholder")}
                  className="w-40"
                  onChange={(e) => {
                    const next = groups.map((x, i) =>
                      i === gi ? { ...x, name: e.target.value } : x,
                    );
                    applyGroups(next);
                  }}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">{t("optionValues")}</Label>
                <Input
                  defaultValue={g.values.join(", ")}
                  placeholder={t("optionValuesPlaceholder")}
                  onBlur={(e) => {
                    const values = e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean);
                    const next = groups.map((x, i) =>
                      i === gi ? { ...x, values } : x,
                    );
                    applyGroups(next);
                  }}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("removeOption")}
                onClick={() => applyGroups(groups.filter((_, i) => i !== gi))}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          {groups.length < 3 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                applyGroups([...groups, { name: "", values: [""] }])
              }
            >
              <Plus className="size-4" />
              {t("addOption")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Variant rows */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="bg-muted/50">
              {hasOptions ? (
                <th className="px-3 py-2 text-start font-medium">
                  {t("variant")}
                </th>
              ) : null}
              <th className="px-3 py-2 text-start font-medium">{t("sku")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("price")}</th>
              <th className="px-3 py-2 text-start font-medium">
                {t("compareAt")}
              </th>
              <th className="px-3 py-2 text-start font-medium">{t("stock")}</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v, i) => (
              <tr key={sig(v.attributes) || i} className="border-t align-top">
                {hasOptions ? (
                  <td className="px-3 py-2 font-medium whitespace-nowrap">
                    {nameFrom(v.attributes)}
                  </td>
                ) : null}
                <td className="px-3 py-2">
                  <Input
                    value={v.sku}
                    dir="ltr"
                    className="w-40 font-mono"
                    aria-invalid={Boolean(err(i, "sku"))}
                    onChange={(e) => patch(i, { sku: e.target.value })}
                  />
                  {err(i, "sku") ? (
                    <p className="text-destructive text-xs">
                      {t(err(i, "sku")!)}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    dir="ltr"
                    className="w-24"
                    value={v.price}
                    aria-invalid={Boolean(err(i, "price"))}
                    onChange={(e) =>
                      patch(i, { price: Number(e.target.value) })
                    }
                  />
                  {err(i, "price") ? (
                    <p className="text-destructive text-xs">
                      {t(err(i, "price")!)}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    dir="ltr"
                    className="w-24"
                    value={v.compareAtPrice ?? ""}
                    aria-invalid={Boolean(err(i, "compareAtPrice"))}
                    onChange={(e) =>
                      patch(i, {
                        compareAtPrice:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                  {err(i, "compareAtPrice") ? (
                    <p className="text-destructive text-xs">
                      {t(err(i, "compareAtPrice")!)}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    min={0}
                    dir="ltr"
                    className="w-20"
                    value={v.stock}
                    aria-invalid={Boolean(err(i, "stock"))}
                    onChange={(e) =>
                      patch(i, { stock: Number(e.target.value) })
                    }
                  />
                  {err(i, "stock") ? (
                    <p className="text-destructive text-xs">
                      {t(err(i, "stock")!)}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
