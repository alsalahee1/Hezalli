import { getLocale, getTranslations } from "next-intl/server";

import { localizedName } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import {
  VoucherManager,
  type VoucherRow,
} from "@/components/promotions/voucher-manager";
import { FeatureToggle } from "@/components/promotions/feature-toggle";

export default async function AdminPromotionsPage() {
  const t = await getTranslations("Vouchers");
  const tm = await getTranslations("Merch");
  const locale = await getLocale();
  const [coupons, featuredCandidates] = await Promise.all([
    prisma.coupon.findMany({
      where: { scope: "PLATFORM" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ isFeatured: "desc" }, { ratingAvg: "desc" }],
      take: 24,
      select: { id: true, title: true, isFeatured: true },
    }),
  ]);
  const rows: VoucherRow[] = coupons.map((c) => ({
    id: c.id,
    code: c.code,
    discountType: c.discountType,
    value: Number(c.value),
    maxDiscountUsd: c.maxDiscountUsd == null ? null : Number(c.maxDiscountUsd),
    minSpendUsd: c.minSpendUsd == null ? null : Number(c.minSpendUsd),
    maxUses: c.maxUses,
    usedCount: c.usedCount,
    perUserLimit: c.perUserLimit,
    startsAt: c.startsAt?.toISOString() ?? null,
    endsAt: c.endsAt?.toISOString() ?? null,
    isActive: c.isActive,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("platformTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("platformDesc")}</p>
      </div>
      <VoucherManager rows={rows} variant="admin" />

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{tm("featuredTitle")}</h2>
          <p className="text-muted-foreground text-sm">{tm("featuredDesc")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {featuredCandidates.map((p) => (
            <FeatureToggle
              key={p.id}
              id={p.id}
              kind="product"
              initial={p.isFeatured}
              label={localizedName(p.title, locale)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
