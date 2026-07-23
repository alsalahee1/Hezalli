import { getTranslations } from "next-intl/server";

import { parseDimensions } from "@/lib/courier-capacity";
import { prisma } from "@/lib/prisma";
import type { LocalizedName } from "@/lib/categories";
import {
  CategoryManager,
  type AdminCategory,
} from "@/components/admin/category-manager";

export default async function AdminCategoriesPage() {
  const t = await getTranslations("AdminCategories");

  const rows = await prisma.category.findMany({
    orderBy: { position: "asc" },
    include: { _count: { select: { products: true, children: true } } },
  });

  const categories: AdminCategory[] = rows.map((c) => {
    const name = (c.name ?? {}) as LocalizedName;
    return {
      id: c.id,
      nameEn: name.en ?? "",
      nameAr: name.ar ?? "",
      slug: c.slug,
      icon: c.icon,
      position: c.position,
      isActive: c.isActive,
      parentId: c.parentId,
      defaultSizeClass: c.defaultSizeClass,
      defaultWeightGrams: c.defaultWeightGrams,
      defaultDimensionsCm: parseDimensions(c.defaultDimensions),
      productCount: c._count.products,
      childCount: c._count.children,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <CategoryManager categories={categories} />
    </div>
  );
}
