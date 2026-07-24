"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { useListingNav } from "./listing-nav";

export function ListingPagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  const t = useTranslations("Search");
  const nav = useListingNav();
  if (totalPages <= 1) return null;

  const go = (n: number) => nav({ page: n <= 1 ? null : n }, false);
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1,
  );

  return (
    <nav className="mt-8 flex items-center justify-center gap-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => go(page - 1)}
        className="hover:bg-muted flex size-10 items-center justify-center rounded-md border disabled:opacity-40"
        aria-label={t("prev")}
      >
        <ChevronLeft className="size-4 rtl:rotate-180" />
      </button>
      {pages.map((n, i) => {
        const gap = i > 0 && n - pages[i - 1] > 1;
        return (
          <span key={n} className="flex items-center gap-1">
            {gap ? <span className="text-muted-foreground px-1">…</span> : null}
            <button
              type="button"
              onClick={() => go(n)}
              className={cn(
                "flex size-10 items-center justify-center rounded-md border text-sm",
                n === page
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted",
              )}
            >
              {n}
            </button>
          </span>
        );
      })}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => go(page + 1)}
        className="hover:bg-muted flex size-10 items-center justify-center rounded-md border disabled:opacity-40"
        aria-label={t("next")}
      >
        <ChevronRight className="size-4 rtl:rotate-180" />
      </button>
    </nav>
  );
}
