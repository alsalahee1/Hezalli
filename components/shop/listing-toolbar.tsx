"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { SORT_KEYS, type ListingParams } from "@/lib/listing";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

import { useListingNav } from "./listing-nav";

export function ListingToolbar({
  params,
  total,
  names,
  mode,
}: {
  params: ListingParams;
  total: number;
  names: { category?: string; brand?: string; seller?: string };
  mode: "search" | "category";
}) {
  const t = useTranslations("Search");
  const nav = useListingNav();

  type Chip = { key: string; label: string; clear: Record<string, null> };
  const chips: Chip[] = [];
  if (params.q)
    chips.push({ key: "q", label: `"${params.q}"`, clear: { q: null } });
  // On a category page the category is the route itself, not a removable chip.
  if (params.category && names.category && mode === "search")
    chips.push({
      key: "category",
      label: names.category,
      clear: { category: null },
    });
  if (params.brand && names.brand)
    chips.push({ key: "brand", label: names.brand, clear: { brand: null } });
  if (params.seller && names.seller)
    chips.push({ key: "seller", label: names.seller, clear: { seller: null } });
  if (params.minPrice != null || params.maxPrice != null)
    chips.push({
      key: "price",
      label: `${params.minPrice ?? "0"} – ${params.maxPrice ?? "∞"}`,
      clear: { minPrice: null, maxPrice: null },
    });
  if (params.rating != null)
    chips.push({
      key: "rating",
      label: `${params.rating}★ ${t("andUp")}`,
      clear: { rating: null },
    });
  if (params.condition)
    chips.push({
      key: "condition",
      label:
        params.condition === "NEW" ? t("conditionNew") : t("conditionUsed"),
      clear: { condition: null },
    });
  if (params.instock)
    chips.push({
      key: "instock",
      label: t("inStockOnly"),
      clear: { instock: null },
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {t("results", { count: total })}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("sortBy")}</span>
          <Select
            value={params.sort}
            onChange={(e) => nav({ sort: e.target.value })}
            className="w-auto"
          >
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {t(`sort_${k}`)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => nav(chip.clear)}
              className={cn(
                "bg-muted hover:bg-muted/70 inline-flex min-h-9 items-center gap-1.5 rounded-full py-1 ps-3 pe-2 text-xs",
              )}
            >
              {chip.label}
              <span className="flex size-5 items-center justify-center">
                <X className="size-3" />
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              nav({
                category: mode === "search" ? null : params.category,
                brand: null,
                seller: null,
                minPrice: null,
                maxPrice: null,
                rating: null,
                condition: null,
                instock: null,
              })
            }
            className="text-muted-foreground hover:text-foreground flex min-h-9 items-center px-2 text-xs underline"
          >
            {t("clearAll")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
