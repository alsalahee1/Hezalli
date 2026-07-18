import { getLocale, getTranslations } from "next-intl/server";

import { categoryOptions, localizedName } from "@/lib/categories";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { AdminProductFilters } from "@/components/admin/admin-product-filters";
import {
  AdminProductsTable,
  type AdminProductRow,
} from "@/components/admin/admin-products-table";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 20;
const STATUSES = ["ACTIVE", "DRAFT", "HIDDEN", "REMOVED"] as const;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    seller?: string;
    category?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as (typeof STATUSES)[number])
    : "";
  const seller = sp.seller ?? "";
  const category = sp.category ?? "";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const where: Prisma.ProductWhereInput = {};
  if (status) where.status = status;
  if (seller) where.storeId = seller;
  if (category) where.categoryId = category;
  if (q) {
    where.OR = [
      { title: { path: ["en"], string_contains: q } },
      { title: { path: ["ar"], string_contains: q } },
    ];
  }

  const [total, products, stores, catRows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        images: { orderBy: { position: "asc" }, take: 1 },
        variants: { select: { price: true } },
        store: { select: { name: true, slug: true } },
        category: { select: { name: true } },
      },
    }),
    prisma.store.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, parentId: true, name: true, position: true },
    }),
  ]);

  const locale = await getLocale();
  const t = await getTranslations("AdminProducts");

  const rows: AdminProductRow[] = products.map((p) => {
    const prices = p.variants.map((v) => Number(v.price));
    return {
      id: p.id,
      title: localizedName((p.title ?? {}) as Record<string, string>, locale),
      storeName: p.store.name,
      storeSlug: p.store.slug,
      categoryLabel: localizedName(p.category.name, locale),
      coverUrl: p.images[0]?.url ?? null,
      price: prices.length ? Math.min(...prices) : 0,
      status: p.status as AdminProductRow["status"],
      moderationReason: p.moderationReason,
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (n: number) => ({
    pathname: "/admin/products" as const,
    query: {
      ...(q ? { q } : {}),
      ...(status ? { status } : {}),
      ...(seller ? { seller } : {}),
      ...(category ? { category } : {}),
      ...(n > 1 ? { page: String(n) } : {}),
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>

      <AdminProductFilters
        sellers={stores}
        categories={categoryOptions(catRows, locale)}
      />

      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <>
          <AdminProductsTable rows={rows} />
          {totalPages > 1 ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("pageOf", { page, totalPages })}
              </span>
              <div className="flex gap-2">
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                >
                  <Link href={pageHref(page - 1)}>{t("prev")}</Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                >
                  <Link href={pageHref(page + 1)}>{t("next")}</Link>
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
