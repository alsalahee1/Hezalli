"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";

// Counter search: jump to a parcel's detail page by tracking number (or a
// pasted shipment id). Pure navigation — the detail route resolves the code
// and guards that the parcel actually involves this hub.
export function ParcelSearch() {
  const t = useTranslations("Point");
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const code = q.trim();
        if (code) router.push(`/point/parcel/${encodeURIComponent(code)}`);
      }}
      className="flex gap-2"
      role="search"
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
        dir="ltr"
        className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-1 focus-visible:outline-none"
      />
      <button
        type="submit"
        aria-label={t("searchGo")}
        className="bg-primary text-primary-foreground inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium disabled:opacity-50"
        disabled={!q.trim()}
      >
        <Search className="size-4" /> {t("searchGo")}
      </button>
    </form>
  );
}
