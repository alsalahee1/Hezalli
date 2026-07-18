import { getLocale, getTranslations } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { localizedName } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import {
  VoucherManager,
  type VoucherRow,
} from "@/components/promotions/voucher-manager";
import {
  DiscountScheduler,
  type SchedulerProduct,
} from "@/components/promotions/discount-scheduler";

export default async function SellerPromotionsPage() {
  const gate = await requireSellerStore();
  if (!gate) return null;
  const t = await getTranslations("Vouchers");
  const locale = await getLocale();
  const [coupons, products] = await Promise.all([
    prisma.coupon.findMany({
      where: { storeId: gate.storeId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      where: { storeId: gate.storeId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        variants: { select: { compareAtPrice: true }, take: 1 },
      },
    }),
  ]);
  const schedulerProducts: SchedulerProduct[] = products.map((p) => ({
    id: p.id,
    title: localizedName(p.title, locale),
    onSale: p.variants.some((v) => v.compareAtPrice != null),
  }));
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
          {t("storeTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("storeDesc")}</p>
      </div>
      <VoucherManager rows={rows} variant="seller" />

      <DiscountScheduler products={schedulerProducts} />
    </div>
  );
}
