"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { slugifyWithFallback } from "@/lib/slug";
import { isOwnStorageUrl } from "@/lib/storage";
import {
  productScalarsSchema,
  SKU_RE,
  type ProductInput,
} from "@/lib/validations/product";
import { fieldErrors } from "@/lib/validations/auth";

export type SaveResult = {
  ok?: boolean;
  productId?: string;
  status?: "DRAFT" | "ACTIVE";
  errors?: Record<string, string>; // scalar field → message key
  variantErrors?: Record<number, Record<string, string>>; // index → field → key
  formError?: string;
};

async function uniqueSlug(base: string): Promise<string> {
  const root = slugifyWithFallback(base, "product");
  let candidate = root;
  for (let n = 2; ; n++) {
    const taken = await prisma.product.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
    candidate = `${root}-${n}`;
  }
}

export async function saveProduct(input: ProductInput): Promise<SaveResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { formError: "notSignedIn" };

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId },
    select: { store: { select: { id: true } } },
  });
  const storeId = profile?.store?.id;
  if (!storeId) return { formError: "notSeller" };

  const publish = input.intent === "publish";

  // --- scalar fields ---
  const parsed = productScalarsSchema.safeParse(input);
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const s = parsed.data;
  const errors: Record<string, string> = {};
  if (publish && s.titleAr.length < 2) errors.titleAr = "titleArRequired";

  // --- category must exist ---
  const category = await prisma.category.findUnique({
    where: { id: s.categoryId },
    select: { id: true },
  });
  if (!category) errors.categoryId = "categoryRequired";

  // --- images: accept our own storage URLs, plus any already on this product
  // (so editing a product with pre-existing/seed images doesn't drop them).
  // publish requires a cover. ---
  let existingUrls = new Set<string>();
  if (input.id) {
    const imgs = await prisma.productImage.findMany({
      where: { productId: input.id, product: { storeId } },
      select: { url: true },
    });
    existingUrls = new Set(imgs.map((i) => i.url));
  }
  const images = input.images.filter(
    (i) => isOwnStorageUrl(i.url) || existingUrls.has(i.url),
  );
  if (publish && images.length === 0) errors.images = "imageRequired";

  // --- variants ---
  const variantErrors: Record<number, Record<string, string>> = {};
  const seenSkus = new Set<string>();
  if (!Array.isArray(input.variants) || input.variants.length === 0) {
    errors.variants = "variantsRequired";
  } else {
    input.variants.forEach((v, i) => {
      const ve: Record<string, string> = {};
      const sku = String(v.sku ?? "").trim();
      if (!sku || !SKU_RE.test(sku)) ve.sku = "skuInvalid";
      else if (seenSkus.has(sku)) ve.sku = "skuDuplicate";
      else seenSkus.add(sku);

      const price = Number(v.price);
      if (!Number.isFinite(price) || price < 0) ve.price = "priceInvalid";
      else if (publish && price <= 0) ve.price = "pricePublish";

      const stock = Number(v.stock);
      if (!Number.isInteger(stock) || stock < 0) ve.stock = "stockInvalid";

      const cmp = v.compareAtPrice == null ? null : Number(v.compareAtPrice);
      if (cmp != null && (!Number.isFinite(cmp) || cmp <= price))
        ve.compareAtPrice = "compareInvalid";

      if (Object.keys(ve).length) variantErrors[i] = ve;
    });
  }

  if (
    Object.keys(errors).length ||
    Object.keys(variantErrors).length ||
    (publish && errors.images)
  ) {
    return {
      errors: Object.keys(errors).length ? errors : undefined,
      variantErrors: Object.keys(variantErrors).length
        ? variantErrors
        : undefined,
      formError: "fixErrors",
    };
  }

  // --- SKU global uniqueness (schema @unique), excluding this product ---
  const skus = [...seenSkus];
  const clash = await prisma.productVariant.findFirst({
    where: {
      sku: { in: skus },
      ...(input.id ? { productId: { not: input.id } } : {}),
    },
    select: { sku: true },
  });
  if (clash) {
    const idx = input.variants.findIndex((v) => v.sku.trim() === clash.sku);
    return {
      variantErrors: { [idx >= 0 ? idx : 0]: { sku: "skuTaken" } },
      formError: "skuTaken",
    };
  }

  const status: "DRAFT" | "ACTIVE" = publish ? "ACTIVE" : "DRAFT";
  const basePrice = Math.min(...input.variants.map((v) => Number(v.price)));
  const brandId = s.brandId || null;

  const productData = {
    storeId,
    categoryId: s.categoryId,
    brandId,
    title: { en: s.titleEn, ar: s.titleAr },
    description: { en: s.descEn, ar: s.descAr },
    condition: s.condition,
    status,
    basePrice,
    lowStockThreshold: s.lowStockThreshold,
    weightGrams: s.weightGrams ?? null,
  };

  const productId = await prisma.$transaction(async (tx) => {
    let id = input.id;

    if (id) {
      const existing = await tx.product.findFirst({
        where: { id, storeId },
        select: { id: true },
      });
      if (!existing) throw new Error("not_owner");
      await tx.product.update({ where: { id }, data: productData });
    } else {
      const created = await tx.product.create({
        data: { ...productData, slug: await uniqueSlug(s.titleEn) },
      });
      id = created.id;
    }

    // Reconcile variants by SKU so unchanged ones keep their id (carts survive).
    const existingVariants = await tx.productVariant.findMany({
      where: { productId: id },
      select: { id: true, sku: true },
    });
    const incoming = new Set(input.variants.map((v) => v.sku.trim()));
    for (const ev of existingVariants) {
      if (!incoming.has(ev.sku)) {
        await tx.productVariant.delete({ where: { id: ev.id } });
      }
    }
    for (const v of input.variants) {
      const sku = v.sku.trim();
      const match = existingVariants.find((e) => e.sku === sku);
      const vdata = {
        name: v.name.trim() || sku,
        attributes: v.attributes ?? {},
        price: Number(v.price),
        compareAtPrice:
          v.compareAtPrice == null ? null : Number(v.compareAtPrice),
        stock: Number(v.stock),
      };
      if (match) {
        await tx.productVariant.update({
          where: { id: match.id },
          data: vdata,
        });
      } else {
        await tx.productVariant.create({
          data: { productId: id!, sku, ...vdata },
        });
      }
    }

    // Replace images with the ordered set ([0] = cover).
    await tx.productImage.deleteMany({ where: { productId: id } });
    if (images.length) {
      await tx.productImage.createMany({
        data: images.map((img, i) => ({
          productId: id!,
          url: img.url,
          alt: img.alt?.trim() || null,
          position: i,
        })),
      });
    }

    return id!;
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/seller/products`);
  return { ok: true, productId, status };
}
