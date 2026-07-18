import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import {
  BrandManager,
  type AdminBrand,
} from "@/components/admin/brand-manager";

export default async function AdminBrandsPage() {
  const t = await getTranslations("AdminBrands");

  const rows = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  const brands: AdminBrand[] = rows.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    logo: b.logo,
    productCount: b._count.products,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <BrandManager brands={brands} />
    </div>
  );
}
