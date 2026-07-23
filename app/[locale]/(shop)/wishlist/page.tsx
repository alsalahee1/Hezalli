import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { localizedName } from "@/lib/categories";
import { formatUsd } from "@/lib/products";
import { prisma } from "@/lib/prisma";
import {
  WishlistGrid,
  type WishlistCardData,
} from "@/components/wishlist/wishlist-grid";

export default async function WishlistPage() {
  const session = await auth();
  const locale = await getLocale();
  if (!session?.user?.id) {
    redirect(`/${locale}/login?callbackUrl=/${locale}/wishlist`);
  }
  const t = await getTranslations("Wishlist");

  const rows = await prisma.wishlistItem.findMany({
    where: {
      wishlist: { userId: session.user.id },
      product: { status: "ACTIVE" },
    },
    orderBy: { createdAt: "desc" },
    select: {
      product: {
        select: {
          id: true,
          slug: true,
          title: true,
          sizeClass: true,
          category: { select: { defaultSizeClass: true } },
          images: {
            orderBy: { position: "asc" },
            take: 1,
            select: { url: true },
          },
          variants: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              price: true,
              compareAtPrice: true,
              stock: true,
            },
          },
          store: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  const items: WishlistCardData[] = rows.map(({ product: p }) => {
    const active = p.variants;
    const cheapest = [...active].sort(
      (a, b) => Number(a.price) - Number(b.price),
    )[0];
    const cheapestInStock =
      [...active]
        .filter((v) => v.stock > 0)
        .sort((a, b) => Number(a.price) - Number(b.price))[0] ?? null;
    const inStock = Boolean(cheapestInStock);
    const priceValue = cheapest ? Number(cheapest.price) : 0;
    const compareAt =
      cheapest?.compareAtPrice != null ? Number(cheapest.compareAtPrice) : null;

    const addLine = cheapestInStock
      ? {
          variantId: cheapestInStock.id,
          storeId: p.store.id,
          storeName: p.store.name,
          storeSlug: p.store.slug,
          productSlug: p.slug,
          title: localizedName(p.title, locale),
          variantName: cheapestInStock.name,
          image: p.images[0]?.url ?? null,
          price: Number(cheapestInStock.price),
          compareAtPrice:
            cheapestInStock.compareAtPrice != null
              ? Number(cheapestInStock.compareAtPrice)
              : null,
          stock: cheapestInStock.stock,
          quantity: 1,
          sizeClass: p.sizeClass ?? p.category.defaultSizeClass,
        }
      : null;

    return {
      productId: p.id,
      slug: p.slug,
      title: localizedName(p.title, locale),
      image: p.images[0]?.url ?? null,
      priceLabel: formatUsd(priceValue, locale),
      compareAtLabel:
        compareAt != null && compareAt > priceValue
          ? formatUsd(compareAt, locale)
          : null,
      inStock,
      addLine,
    };
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <WishlistGrid initial={items} />
    </main>
  );
}
