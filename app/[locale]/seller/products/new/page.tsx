import { getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { categoryOptions } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { ProductForm } from "@/components/seller/product-form";

export default async function NewProductPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

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

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/seller/products"
          className="text-muted-foreground hover:text-foreground text-sm hover:underline"
        >
          ← {t("backToProducts")}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {t("newProduct")}
        </h1>
      </div>
      <ProductForm
        categories={categoryOptions(catRows, locale)}
        brands={brands}
      />
    </div>
  );
}
