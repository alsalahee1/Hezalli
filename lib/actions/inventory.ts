"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireActiveSeller } from "@/lib/authz";
import { notifyWishlistWatchers } from "@/lib/alerts";
import { prisma } from "@/lib/prisma";
import { slugifyWithFallback } from "@/lib/slug";

export type ActionResult = { ok?: boolean; error?: string };

async function sellerStoreId(): Promise<string | null> {
  // Rejects suspended/deleted sellers (a bare session lookup would not).
  const gate = await requireActiveSeller();
  return gate?.storeId ?? null;
}

async function revalidate() {
  const locale = await getLocale();
  revalidatePath(`/${locale}/seller/products`);
}

async function refreshBasePrice(productId: string) {
  const agg = await prisma.productVariant.aggregate({
    where: { productId },
    _min: { price: true },
  });
  if (agg._min.price != null) {
    await prisma.product.update({
      where: { id: productId },
      data: { basePrice: agg._min.price },
    });
  }
}

// Inline quick-edit of a single variant's price + stock.
export async function quickUpdateVariant(input: {
  variantId: string;
  price: number;
  stock: number;
}): Promise<ActionResult> {
  const storeId = await sellerStoreId();
  if (!storeId) return { error: "forbidden" };

  const variant = await prisma.productVariant.findFirst({
    where: { id: input.variantId, product: { storeId } },
    select: { id: true, productId: true, price: true, stock: true },
  });
  if (!variant) return { error: "forbidden" };

  const price = Number(input.price);
  const stock = Number(input.stock);
  if (!Number.isFinite(price) || price < 0) return { error: "priceInvalid" };
  if (!Number.isInteger(stock) || stock < 0) return { error: "stockInvalid" };

  const oldPrice = Number(variant.price);
  const oldStock = variant.stock;
  // Other active variants decide whether this is a *product-level* restock or a
  // new lowest price (headline price drop) worth alerting wishlist watchers.
  const others = await prisma.productVariant.findMany({
    where: {
      productId: variant.productId,
      id: { not: variant.id },
      isActive: true,
    },
    select: { price: true, stock: true },
  });
  const otherStock = others.reduce((s, v) => s + v.stock, 0);
  const otherMinPrice = others.length
    ? Math.min(...others.map((v) => Number(v.price)))
    : Infinity;

  await prisma.productVariant.update({
    where: { id: variant.id },
    data: { price, stock },
  });
  await refreshBasePrice(variant.productId);

  // Wishlist re-engagement alerts (best-effort — never block the edit).
  try {
    if (oldStock === 0 && stock > 0 && otherStock === 0) {
      await notifyWishlistWatchers(variant.productId, "restock");
    }
    if (price < oldPrice && price <= otherMinPrice) {
      await notifyWishlistWatchers(variant.productId, "priceDrop");
    }
  } catch {
    // ignore — the price/stock update already succeeded
  }

  await revalidate();
  return { ok: true };
}

async function ownedIds(ids: string[], storeId: string): Promise<string[]> {
  const rows = await prisma.product.findMany({
    where: { id: { in: ids }, storeId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// Bulk publish (ACTIVE), unpublish (HIDDEN), or archive (REMOVED, soft delete).
export async function bulkSetStatus(
  ids: string[],
  status: "ACTIVE" | "HIDDEN" | "REMOVED",
): Promise<ActionResult & { published?: number; skipped?: number }> {
  const storeId = await sellerStoreId();
  if (!storeId) return { error: "forbidden" };
  const owned = await ownedIds(ids, storeId);
  if (owned.length === 0) return { ok: true };

  if (status === "ACTIVE") {
    // Only publish products that would pass the publish rules: a cover image
    // and at least one variant priced > 0.
    const candidates = await prisma.product.findMany({
      where: { id: { in: owned } },
      select: {
        id: true,
        _count: { select: { images: true } },
        variants: { select: { price: true } },
      },
    });
    const eligible = candidates
      .filter(
        (p) =>
          p._count.images > 0 && p.variants.some((v) => Number(v.price) > 0),
      )
      .map((p) => p.id);
    if (eligible.length) {
      await prisma.product.updateMany({
        where: { id: { in: eligible } },
        data: { status: "ACTIVE" },
      });
    }
    await revalidate();
    return {
      ok: true,
      published: eligible.length,
      skipped: owned.length - eligible.length,
    };
  }

  await prisma.product.updateMany({
    where: { id: { in: owned } },
    data: { status },
  });
  await revalidate();
  return { ok: true };
}

// Duplicate a product as a fresh DRAFT (new slug + SKUs; images/variants copied).
export async function duplicateProduct(id: string): Promise<ActionResult> {
  const storeId = await sellerStoreId();
  if (!storeId) return { error: "forbidden" };

  const src = await prisma.product.findFirst({
    where: { id, storeId },
    include: { variants: true, images: { orderBy: { position: "asc" } } },
  });
  if (!src) return { error: "forbidden" };

  const title = (src.title ?? {}) as { en?: string; ar?: string };
  const baseSlug = slugifyWithFallback(
    `${title.en ?? "product"}-copy`,
    "product-copy",
  );
  let slug = baseSlug;
  for (let n = 2; ; n++) {
    if (
      !(await prisma.product.findUnique({
        where: { slug },
        select: { id: true },
      }))
    )
      break;
    slug = `${baseSlug}-${n}`;
  }
  const suffix = randomBytes(3).toString("hex");

  await prisma.product.create({
    data: {
      storeId,
      categoryId: src.categoryId,
      brandId: src.brandId,
      title: {
        en: title.en ? `${title.en} (copy)` : "",
        ar: title.ar ?? "",
      },
      slug,
      description: src.description ?? undefined,
      status: "DRAFT",
      condition: src.condition,
      basePrice: src.basePrice,
      lowStockThreshold: src.lowStockThreshold,
      weightGrams: src.weightGrams,
      dimensions: src.dimensions ?? undefined,
      variants: {
        create: src.variants.map((v) => ({
          sku: `${v.sku}-${suffix}`,
          name: v.name,
          attributes: v.attributes ?? undefined,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          stock: v.stock,
        })),
      },
      images: {
        create: src.images.map((img) => ({
          url: img.url,
          alt: img.alt,
          position: img.position,
        })),
      },
    },
  });

  await revalidate();
  return { ok: true };
}
