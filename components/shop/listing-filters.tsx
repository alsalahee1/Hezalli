"use client";

import { useState } from "react";
import { SlidersHorizontal, Star } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ListingParams } from "@/lib/listing";
import type { Facets } from "@/lib/search";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useListingNav } from "./listing-nav";

export function ListingFilters({
  facets,
  params,
  mode,
}: {
  facets: Facets;
  params: ListingParams;
  mode: "search" | "category";
}) {
  const t = useTranslations("Search");
  const nav = useListingNav();
  const [minP, setMinP] = useState(params.minPrice?.toString() ?? "");
  const [maxP, setMaxP] = useState(params.maxPrice?.toString() ?? "");

  const Group = ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div className="border-b py-4 last:border-0">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );

  const rowBtn = (active: boolean) =>
    cn(
      "flex min-h-10 w-full items-center justify-between rounded-md px-2 py-2 text-start text-sm transition-colors",
      active ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
    );

  const body = (
    <div className="flex flex-col">
      {facets.categories.length > 0 ? (
        <Group title={t("categories")}>
          <ul className="flex flex-col gap-0.5">
            {facets.categories.map((c) => {
              const active = params.category === c.slug;
              const content = (
                <>
                  <span className="flex items-center gap-1.5">
                    {c.icon ? <span aria-hidden>{c.icon}</span> : null}
                    {c.name}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {c.count}
                  </span>
                </>
              );
              return (
                <li key={c.slug}>
                  {mode === "category" ? (
                    <Link href={`/c/${c.slug}`} className={rowBtn(active)}>
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={rowBtn(active)}
                      onClick={() => nav({ category: active ? null : c.slug })}
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Group>
      ) : null}

      <Group title={t("price")}>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={minP}
            onChange={(e) => setMinP(e.target.value)}
            placeholder={facets.priceBounds?.min?.toString() ?? t("min")}
            className="h-9"
            dir="ltr"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={maxP}
            onChange={(e) => setMaxP(e.target.value)}
            placeholder={facets.priceBounds?.max?.toString() ?? t("max")}
            className="h-9"
            dir="ltr"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 w-full"
          onClick={() =>
            nav({ minPrice: minP || null, maxPrice: maxP || null })
          }
        >
          {t("apply")}
        </Button>
      </Group>

      <Group title={t("rating")}>
        <div className="flex flex-col gap-0.5">
          {[4, 3, 2, 1].map((r) => {
            const active = params.rating === r;
            return (
              <button
                key={r}
                type="button"
                className={rowBtn(active)}
                onClick={() => nav({ rating: active ? null : r })}
              >
                <span className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        "size-3.5",
                        i < r
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground/30",
                      )}
                    />
                  ))}
                  <span className="ms-1">{t("andUp")}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title={t("condition")}>
        <div className="flex gap-2">
          {(["NEW", "USED"] as const).map((c) => {
            const active = params.condition === c;
            return (
              <button
                key={c}
                type="button"
                className={cn(
                  "min-h-10 flex-1 rounded-md border px-2 py-2 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "hover:border-muted-foreground/50",
                )}
                onClick={() => nav({ condition: active ? null : c })}
              >
                {c === "NEW" ? t("conditionNew") : t("conditionUsed")}
              </button>
            );
          })}
        </div>
      </Group>

      <Group title={t("availability")}>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={params.instock}
            onChange={(e) => nav({ instock: e.target.checked ? "1" : null })}
            className="size-4"
          />
          {t("inStockOnly")}
        </label>
      </Group>

      {facets.brands.length > 0 ? (
        <Group title={t("brand")}>
          <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {facets.brands.map((b) => {
              const active = params.brand === b.slug;
              return (
                <li key={b.slug}>
                  <button
                    type="button"
                    className={rowBtn(active)}
                    onClick={() => nav({ brand: active ? null : b.slug })}
                  >
                    <span>{b.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {b.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Group>
      ) : null}

      {facets.sellers.length > 1 ? (
        <Group title={t("sellers")}>
          <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
            {facets.sellers.map((s) => {
              const active = params.seller === s.slug;
              return (
                <li key={s.slug}>
                  <button
                    type="button"
                    className={rowBtn(active)}
                    onClick={() => nav({ seller: active ? null : s.slug })}
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {s.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Group>
      ) : null}
    </div>
  );

  return (
    <>
      {/* Phone: collapsible */}
      <details className="rounded-lg border px-3 md:hidden">
        <summary className="flex cursor-pointer items-center gap-2 py-3 text-sm font-medium">
          <SlidersHorizontal className="size-4" />
          {t("filters")}
        </summary>
        {body}
      </details>

      {/* Tablet/desktop: sticky sidebar */}
      <aside className="sticky top-24 hidden h-fit rounded-lg border px-4 md:block">
        {body}
      </aside>
    </>
  );
}
