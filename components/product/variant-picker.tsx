"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, ShoppingCart, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { formatUsd } from "@/lib/products";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type PickerVariant = {
  id: string;
  name: string;
  attributes: Record<string, string>;
  price: number;
  compareAtPrice: number | null;
  stock: number;
};

const OPTION_LABELS: Record<string, { en: string; ar: string }> = {
  color: { en: "Color", ar: "اللون" },
  size: { en: "Size", ar: "المقاس" },
  storage: { en: "Storage", ar: "السعة" },
};

export function VariantPicker({ variants }: { variants: PickerVariant[] }) {
  const t = useTranslations("Product");
  const locale = useLocale();
  const optLabel = (key: string) => {
    const m = OPTION_LABELS[key];
    return m ? (locale === "ar" ? m.ar : m.en) : key;
  };

  // Derive option axes (stable order of first appearance).
  const { keys, values } = useMemo(() => {
    const keys: string[] = [];
    const values: Record<string, string[]> = {};
    for (const v of variants) {
      for (const [k, val] of Object.entries(v.attributes ?? {})) {
        if (!keys.includes(k)) {
          keys.push(k);
          values[k] = [];
        }
        if (!values[k].includes(val)) values[k].push(val);
      }
    }
    return { keys, values };
  }, [variants]);
  const hasOptions = keys.length > 0;

  // Default to the first in-stock variant (or the first if all are out).
  const initial = useMemo(() => {
    const base = variants.find((v) => v.stock > 0) ?? variants[0];
    const sel: Record<string, string> = {};
    for (const k of keys) sel[k] = base?.attributes?.[k] ?? "";
    return sel;
  }, [variants, keys]);

  const [selected, setSelected] = useState<Record<string, string>>(initial);
  const [qty, setQty] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  const current = hasOptions
    ? variants.find((v) => keys.every((k) => v.attributes?.[k] === selected[k]))
    : variants[0];

  const valueInStock = (key: string, value: string) =>
    variants.some(
      (v) =>
        v.stock > 0 &&
        v.attributes?.[key] === value &&
        keys
          .filter((k) => k !== key)
          .every((k) => !selected[k] || v.attributes?.[k] === selected[k]),
    );

  const stock = current?.stock ?? 0;
  const price = current?.price ?? Math.min(...variants.map((v) => v.price));
  const compareAt =
    current?.compareAtPrice && current.compareAtPrice > price
      ? current.compareAtPrice
      : null;
  const pctOff = compareAt ? Math.round((1 - price / compareAt) * 100) : null;
  const clampedQty = Math.min(qty, Math.max(1, stock));

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Price */}
      <div className="flex flex-wrap items-baseline gap-3" dir="ltr">
        <span className="text-3xl font-bold">{formatUsd(price, locale)}</span>
        {compareAt ? (
          <>
            <span className="text-muted-foreground text-lg line-through">
              {formatUsd(compareAt, locale)}
            </span>
            <span className="bg-destructive rounded px-1.5 py-0.5 text-sm font-semibold text-white">
              -{pctOff}%
            </span>
          </>
        ) : null}
      </div>

      {/* Option pickers */}
      {hasOptions
        ? keys.map((key) => (
            <div key={key} className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                {optLabel(key)}
                {selected[key] ? (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    · {selected[key]}
                  </span>
                ) : null}
              </span>
              <div className="flex flex-wrap gap-2">
                {values[key].map((val) => {
                  const isSel = selected[key] === val;
                  const avail = valueInStock(key, val);
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setSelected((s) => ({ ...s, [key]: val }));
                        setQty(1);
                      }}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm transition-colors",
                        isSel
                          ? "border-primary bg-primary/10 font-medium"
                          : "hover:border-muted-foreground/50",
                        !avail &&
                          !isSel &&
                          "text-muted-foreground/50 line-through",
                      )}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        : null}

      {/* Stock status */}
      <p className="text-sm">
        {stock <= 0 ? (
          <span className="text-destructive font-medium">
            {t("outOfStock")}
          </span>
        ) : stock <= 5 ? (
          <span className="font-medium text-amber-600">
            {t("onlyLeft", { count: stock })}
          </span>
        ) : (
          <span className="font-medium text-emerald-600">{t("inStock")}</span>
        )}
      </p>

      {/* Quantity */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{t("quantity")}</span>
        <div className="flex items-center rounded-md border">
          <button
            type="button"
            className="hover:bg-muted flex size-9 items-center justify-center disabled:opacity-40"
            disabled={clampedQty <= 1}
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label={t("decrease")}
          >
            <Minus className="size-4" />
          </button>
          <span className="w-10 text-center text-sm tabular-nums">
            {clampedQty}
          </span>
          <button
            type="button"
            className="hover:bg-muted flex size-9 items-center justify-center disabled:opacity-40"
            disabled={clampedQty >= stock}
            onClick={() => setQty((q) => Math.min(stock, q + 1))}
            aria-label={t("increase")}
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      {/* Actions (cart lands in Phase 7) */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          size="lg"
          className="flex-1"
          disabled={stock <= 0}
          onClick={() => flash(t("cartComingSoon"))}
        >
          <ShoppingCart className="size-4" />
          {t("addToCart")}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="flex-1"
          disabled={stock <= 0}
          onClick={() => flash(t("cartComingSoon"))}
        >
          <Zap className="size-4" />
          {t("buyNow")}
        </Button>
      </div>
      {toast ? (
        <p className="bg-muted rounded-md px-3 py-2 text-center text-sm">
          {toast}
        </p>
      ) : null}
    </div>
  );
}
