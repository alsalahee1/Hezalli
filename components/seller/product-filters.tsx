"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { usePathname, useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function ProductFilters({
  categories,
}: {
  categories: { id: string; label: string }[];
}) {
  const t = useTranslations("SellerProducts");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page"); // any filter change resets to page 1
    router.push(`${pathname}?${next.toString()}`);
  };

  // Debounce the search box.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) update({ q });
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="text-muted-foreground pointer-events-none absolute inset-y-0 my-auto ms-3 size-4" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="ps-9"
        />
      </div>
      <Select
        value={params.get("status") ?? ""}
        onChange={(e) => update({ status: e.target.value })}
        className="w-40"
      >
        <option value="">{t("allStatuses")}</option>
        <option value="ACTIVE">{t("status_ACTIVE")}</option>
        <option value="DRAFT">{t("status_DRAFT")}</option>
        <option value="HIDDEN">{t("status_HIDDEN")}</option>
      </Select>
      <Select
        value={params.get("category") ?? ""}
        onChange={(e) => update({ category: e.target.value })}
        className="w-48"
      >
        <option value="">{t("allCategories")}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
