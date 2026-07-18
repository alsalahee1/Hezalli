import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { categoryOptions } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import {
  ProductForm,
  type EditProduct,
} from "@/components/seller/product-form";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return null;

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: session.user.id },
    select: { store: { select: { id: true } } },
  });
  const storeId = profile?.store?.id;
  if (!storeId) return null;

  const product = await prisma.product.findFirst({
    where: { id, storeId },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: { orderBy: { sku: "asc" } },
    },
  });
  if (!product) notFound();

  const [catRows, brands] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, parentId: true, name: true, position: true },
    }),
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const locale = await getLocale();
  const t = await getTranslations("SellerProducts");

  const title = (product.title ?? {}) as { en?: string; ar?: string };
  const desc = (product.description ?? {}) as { en?: string; ar?: string };
  const edit: EditProduct = {
    id: product.id,
    titleEn: title.en ?? "",
    titleAr: title.ar ?? "",
    descEn: desc.en ?? "",
    descAr: desc.ar ?? "",
    categoryId: product.categoryId,
    brandId: product.brandId ?? "",
    condition: product.condition,
    lowStockThreshold: product.lowStockThreshold,
    weightGrams: product.weightGrams,
    status: product.status,
    images: product.images.map((i) => ({ url: i.url })),
    variants: product.variants.map((v) => ({
      name: v.name,
      attributes: (v.attributes ?? {}) as Record<string, string>,
      sku: v.sku,
      price: Number(v.price),
      compareAtPrice:
        v.compareAtPrice == null ? null : Number(v.compareAtPrice),
      stock: v.stock,
    })),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/seller/products"
          className="text-muted-foreground hover:text-foreground text-sm hover:underline"
        >
          ← {t("backToProducts")}
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          {t("editProduct")}
          <span className="bg-muted rounded px-2 py-0.5 text-xs font-medium">
            {t(`status_${product.status}`)}
          </span>
        </h1>
      </div>
      <ProductForm
        product={edit}
        categories={categoryOptions(catRows, locale)}
        brands={brands}
      />
    </div>
  );
}
