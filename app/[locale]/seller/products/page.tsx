import { Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { categoryOptions, localizedName } from "@/lib/categories";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { ProductFilters } from "@/components/seller/product-filters";
import {
  ProductTable,
  type ProductRow,
} from "@/components/seller/product-table";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 20;

export default async function SellerProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    category?: string;
    page?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: session.user.id },
    select: { store: { select: { id: true } } },
  });
  const storeId = profile?.store?.id;
  if (!storeId) return null;

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const statusFilter = ["ACTIVE", "DRAFT", "HIDDEN"].includes(sp.status ?? "")
    ? (sp.status as "ACTIVE" | "DRAFT" | "HIDDEN")
    : "";
  const categoryFilter = sp.category ?? "";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const where: Prisma.ProductWhereInput = { storeId };
  where.status = statusFilter ? statusFilter : { not: "REMOVED" };
  if (categoryFilter) where.categoryId = categoryFilter;
  if (q) {
    where.OR = [
      { title: { path: ["en"], string_contains: q } },
      { title: { path: ["ar"], string_contains: q } },
    ];
  }

  const [total, products, catRows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        images: { orderBy: { position: "asc" }, take: 1 },
        variants: { select: { id: true, price: true, stock: true } },
      },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, parentId: true, name: true, position: true },
    }),
  ]);

  // Units sold per product (from order items).
  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
  const sales = variantIds.length
    ? await prisma.orderItem.groupBy({
        by: ["variantId"],
        where: { variantId: { in: variantIds } },
        _sum: { quantity: true },
      })
    : [];
  const soldByVariant = new Map(
    sales.map((s) => [s.variantId, s._sum.quantity ?? 0]),
  );

  const locale = await getLocale();
  const t = await getTranslations("SellerProducts");

  const rows: ProductRow[] = products.map((p) => {
    const prices = p.variants.map((v) => Number(v.price));
    const title = (p.title ?? {}) as Record<string, string>;
    return {
      id: p.id,
      title: localizedName(title, locale),
      coverUrl: p.images[0]?.url ?? null,
      status: p.status as ProductRow["status"],
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
      totalStock: p.variants.reduce((s, v) => s + v.stock, 0),
      variantCount: p.variants.length,
      singleVariantId: p.variants.length === 1 ? p.variants[0].id : null,
      lowStockThreshold: p.lowStockThreshold,
      salesCount: p.variants.reduce(
        (s, v) => s + (soldByVariant.get(v.id) ?? 0),
        0,
      ),
    };
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (n: number) => ({
    pathname: "/seller/products" as const,
    query: {
      ...(q ? { q } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(categoryFilter ? { category: categoryFilter } : {}),
      ...(n > 1 ? { page: String(n) } : {}),
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("listDesc")}</p>
        </div>
        <Button asChild>
          <Link href="/seller/products/new">
            <Plus className="size-4" />
            {t("newProduct")}
          </Link>
        </Button>
      </div>

      <ProductFilters categories={categoryOptions(catRows, locale)} />

      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {q || statusFilter || categoryFilter ? t("noMatches") : t("empty")}
        </div>
      ) : (
        <>
          <ProductTable rows={rows} />
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
                  <Link href={pageHref(page - 1)} aria-disabled={page <= 1}>
                    {t("prev")}
                  </Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                >
                  <Link
                    href={pageHref(page + 1)}
                    aria-disabled={page >= totalPages}
                  >
                    {t("next")}
                  </Link>
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
