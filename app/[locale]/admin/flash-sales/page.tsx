import { getLocale, getTranslations } from "next-intl/server";

import { localizedName } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import {
  FlashSaleManager,
  type FlashSaleRow,
  type ProductOption,
} from "@/components/promotions/flash-sale-manager";

export default async function AdminFlashSalesPage() {
  const t = await getTranslations("AdminFlash");
  const locale = await getLocale();

  const [sales, products] = await Promise.all([
    prisma.flashSale.findMany({
      orderBy: { startsAt: "desc" },
      take: 30,
      select: {
        id: true,
        name: true,
        startsAt: true,
        endsAt: true,
        isActive: true,
        items: {
          select: {
            id: true,
            salePrice: true,
            stockLimit: true,
            soldCount: true,
            variant: {
              select: {
                sku: true,
                price: true,
                product: { select: { title: true } },
              },
            },
          },
        },
      },
    }),
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        title: true,
        variants: {
          where: { isActive: true },
          select: { id: true, sku: true, price: true },
        },
      },
    }),
  ]);

  const saleRows: FlashSaleRow[] = sales.map((s) => ({
    id: s.id,
    name: localizedName(s.name, locale),
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    isActive: s.isActive,
    items: s.items.map((it) => ({
      id: it.id,
      label: `${localizedName(it.variant.product.title, locale)} · ${it.variant.sku}`,
      salePrice: Number(it.salePrice),
      origPrice: Number(it.variant.price),
      stockLimit: it.stockLimit,
      soldCount: it.soldCount,
    })),
  }));

  const productOptions: ProductOption[] = products
    .filter((p) => p.variants.length > 0)
    .map((p) => ({
      title: localizedName(p.title, locale),
      variants: p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        price: Number(v.price),
      })),
    }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <FlashSaleManager sales={saleRows} products={productOptions} />
    </div>
  );
}
