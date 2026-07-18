import { getLocale, getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { toCardItem } from "@/lib/products";
import { ProductCard } from "@/components/product/product-card";

export default async function DealsPage() {
  const t = await getTranslations("Deals");
  const locale = await getLocale();
  const now = new Date();

  const activeDiscount = {
    isActive: true,
    compareAtPrice: { not: null },
    AND: [
      { OR: [{ saleStartsAt: null }, { saleStartsAt: { lte: now } }] },
      { OR: [{ saleEndsAt: null }, { saleEndsAt: { gt: now } }] },
    ],
  };

  const rows = await prisma.product.findMany({
    where: { status: "ACTIVE", variants: { some: activeDiscount } },
    orderBy: { updatedAt: "desc" },
    take: 48,
    select: {
      id: true,
      slug: true,
      title: true,
      condition: true,
      ratingAvg: true,
      ratingCount: true,
      images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
      variants: {
        where: { isActive: true },
        select: { price: true, compareAtPrice: true, stock: true },
      },
      store: { select: { name: true } },
    },
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <p className="text-muted-foreground mb-5 text-sm">{t("desc")}</p>
      {rows.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-16 text-center text-sm">
          {t("empty")}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {rows.map((p) => (
            <ProductCard key={p.id} item={toCardItem(p, locale)} />
          ))}
        </div>
      )}
    </main>
  );
}
