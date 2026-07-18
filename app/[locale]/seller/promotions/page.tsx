import { getTranslations } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  VoucherManager,
  type VoucherRow,
} from "@/components/promotions/voucher-manager";

export default async function SellerPromotionsPage() {
  const gate = await requireSellerStore();
  if (!gate) return null;
  const t = await getTranslations("Vouchers");
  const coupons = await prisma.coupon.findMany({
    where: { storeId: gate.storeId },
    orderBy: { createdAt: "desc" },
  });
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
    </div>
  );
}
