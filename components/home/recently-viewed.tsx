"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { ProductCardItem } from "@/lib/products";
import { RECENT_KEY } from "@/components/product/record-view";

import { ProductStrip } from "./product-strip";

// Renders the recently-viewed strip. Logged-in users get server-provided items
// (DB); guests fall back to the slugs saved in localStorage.
export function RecentlyViewed({ initial }: { initial: ProductCardItem[] }) {
  const t = useTranslations("Home");
  const locale = useLocale();
  const [items, setItems] = useState<ProductCardItem[]>(initial);

  useEffect(() => {
    if (initial.length > 0) return; // logged-in: server already provided items
    let slugs: string[] = [];
    try {
      slugs = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    } catch {
      slugs = [];
    }
    if (slugs.length === 0) return;
    const ctrl = new AbortController();
    fetch(
      `/api/products/by-slugs?slugs=${encodeURIComponent(slugs.join(","))}&locale=${locale}`,
      { signal: ctrl.signal },
    )
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: ProductCardItem[] }) => setItems(d.items))
      .catch(() => {});
    return () => ctrl.abort();
  }, [initial, locale]);

  if (items.length === 0) return null;
  return <ProductStrip title={t("recentlyViewed")} items={items} />;
}
