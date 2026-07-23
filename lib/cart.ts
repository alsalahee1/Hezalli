// Server-side cart resolution: turn stored {variantId, quantity} rows into
// fully-priced CartLines with fresh price/stock. Used by both the logged-in
// cart (DB) and the guest cart (localStorage, resolved via an API route).
import { localizedName } from "@/lib/categories";
import type { CartLine, CartStub } from "@/lib/cart-types";
import { prisma } from "@/lib/prisma";

export async function resolveCartLines(
  items: CartStub[],
  locale: string,
): Promise<CartLine[]> {
  if (items.length === 0) return [];
  const ids = [...new Set(items.map((i) => i.variantId))];
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: ids }, isActive: true, product: { status: "ACTIVE" } },
    select: {
      id: true,
      name: true,
      price: true,
      compareAtPrice: true,
      stock: true,
      product: {
        select: {
          slug: true,
          title: true,
          sizeClass: true,
          category: { select: { defaultSizeClass: true } },
          images: {
            orderBy: { position: "asc" },
            take: 1,
            select: { url: true },
          },
          store: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const lines: CartLine[] = [];
  for (const it of items) {
    const v = byId.get(it.variantId);
    if (!v) continue; // variant removed or product no longer active → drop
    lines.push({
      variantId: v.id,
      storeId: v.product.store.id,
      storeName: v.product.store.name,
      storeSlug: v.product.store.slug,
      productSlug: v.product.slug,
      title: localizedName(v.product.title, locale),
      variantName: v.name,
      image: v.product.images[0]?.url ?? null,
      price: Number(v.price),
      compareAtPrice:
        v.compareAtPrice == null ? null : Number(v.compareAtPrice),
      stock: v.stock,
      quantity: Math.max(1, it.quantity),
      sizeClass: v.product.sizeClass ?? v.product.category.defaultSizeClass,
    });
  }
  return lines;
}

export type CartData = { cart: CartLine[]; saved: CartLine[] };

/** Active cart lines (excludes saved-for-later). */
export async function getServerCart(
  userId: string,
  locale: string,
): Promise<CartLine[]> {
  return (await getServerCartData(userId, locale)).cart;
}

/** Both the active cart and the saved-for-later list. */
export async function getServerCartData(
  userId: string,
  locale: string,
): Promise<CartData> {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    select: {
      items: {
        select: {
          variantId: true,
          storeId: true,
          quantity: true,
          savedForLater: true,
        },
      },
    },
  });
  if (!cart) return { cart: [], saved: [] };
  const active = cart.items.filter((i) => !i.savedForLater);
  const saved = cart.items.filter((i) => i.savedForLater);
  const [cartLines, savedLines] = await Promise.all([
    resolveCartLines(active, locale),
    resolveCartLines(saved, locale),
  ]);
  return { cart: cartLines, saved: savedLines };
}
