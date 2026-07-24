import { PackageSearch } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { localizedName } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import type { ListingResult } from "@/lib/search";
import { Link } from "@/i18n/navigation";
import { ProductCard } from "@/components/product/product-card";

import { ListingFilters } from "./listing-filters";
import { ListingPagination } from "./listing-pagination";
import { ListingToolbar } from "./listing-toolbar";

export async function ProductListingView({
  result,
  mode,
  locale,
  heading,
  subheading,
}: {
  result: ListingResult;
  mode: "search" | "category";
  locale: string;
  heading: string;
  subheading?: string;
}) {
  const { items, total, page, totalPages, facets, params } = result;

  const names = {
    category: facets.categories.find((c) => c.slug === params.category)?.name,
    brand: facets.brands.find((b) => b.slug === params.brand)?.name,
    seller: facets.sellers.find((s) => s.slug === params.seller)?.name,
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        {subheading ? (
          <p className="text-muted-foreground text-sm">{subheading}</p>
        ) : null}
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)]">
        <ListingFilters facets={facets} params={params} mode={mode} />

        <div className="min-w-0">
          <ListingToolbar
            params={params}
            total={total}
            names={names}
            mode={mode}
          />

          {items.length > 0 ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {items.map((item) => (
                  <ProductCard key={item.slug} item={item} />
                ))}
              </div>
              <ListingPagination page={page} totalPages={totalPages} />
            </>
          ) : (
            <EmptyState locale={locale} query={params.q} />
          )}
        </div>
      </div>
    </main>
  );
}

async function EmptyState({
  locale,
  query,
}: {
  locale: string;
  query: string;
}) {
  const t = await getTranslations("Search");
  const suggestions = await prisma.category.findMany({
    where: { parentId: null, isActive: true },
    orderBy: { position: "asc" },
    take: 6,
    select: { slug: true, name: true, icon: true },
  });

  return (
    <div className="mt-6 flex flex-col items-center gap-4 rounded-lg border border-dashed py-16 text-center">
      <PackageSearch className="text-muted-foreground size-8" />
      <div>
        <p className="font-medium">
          {query ? t("noResultsFor", { query }) : t("noResults")}
        </p>
        <p className="text-muted-foreground text-sm">{t("noResultsHint")}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((c) => (
          <Link
            key={c.slug}
            href={`/c/${c.slug}`}
            className="bg-muted hover:bg-muted/70 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm"
          >
            {c.icon ? <span aria-hidden>{c.icon}</span> : null}
            {localizedName(c.name, locale)}
          </Link>
        ))}
      </div>
    </div>
  );
}
