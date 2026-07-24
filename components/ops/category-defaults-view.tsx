import { getLocale, getTranslations } from "next-intl/server";
import { Shapes } from "lucide-react";

import { requireDeliveryScope } from "@/lib/authz";
import { localizedName } from "@/lib/categories";
import { parseDimensions } from "@/lib/courier-capacity";
import { prisma } from "@/lib/prisma";
import { Forbidden } from "@/components/auth/forbidden";
import { CategoryDefaultsRow } from "@/components/admin/category-defaults-row";

// Delivery staff's view of category delivery defaults: the typical unit
// weight/size used for courier capacity when a product carries none of its
// own. Only those two fields are editable here — names, slugs, and the tree
// stay in the admin-only category manager.
export async function CategoryDefaultsView() {
  const staffId = await requireDeliveryScope("NETWORK");
  if (!staffId) return <Forbidden />;
  const t = await getTranslations("AdminCategories");
  const locale = await getLocale();

  const categories = await prisma.category.findMany({
    orderBy: { position: "asc" },
    select: {
      id: true,
      name: true,
      icon: true,
      isActive: true,
      defaultSizeClass: true,
      defaultWeightGrams: true,
      defaultDimensions: true,
      _count: { select: { products: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shapes className="size-5" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("shippingDefaults")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("shippingDefaultsHint")}
          </p>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-14 text-center text-sm">
          {t("noCategoriesYet")}
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  {c.icon ? <span className="me-1.5">{c.icon}</span> : null}
                  {localizedName(c.name, locale)}
                  {!c.isActive ? (
                    <span className="text-muted-foreground ms-2 text-xs">
                      ({t("inactive")})
                    </span>
                  ) : null}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t("productCount", { count: c._count.products })}
                </p>
              </div>
              <CategoryDefaultsRow
                categoryId={c.id}
                defaultSizeClass={c.defaultSizeClass}
                defaultWeightGrams={c.defaultWeightGrams}
                defaultDimensionsCm={parseDimensions(c.defaultDimensions)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
