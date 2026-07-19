import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { requireSellerStore } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { DEFAULT_FREE_OVER, DEFAULT_SHIPPING_FEE } from "@/lib/shipping";
import { Link } from "@/i18n/navigation";
import {
  ShippingRatesForm,
  type ZoneRate,
} from "@/components/seller/shipping-rates-form";

export default async function SellerShippingSettingsPage() {
  const gate = await requireSellerStore();
  if (!gate) return null;
  const t = await getTranslations("SellerShipping");

  const [zones, rates, defaults] = await Promise.all([
    prisma.shippingZone.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.shippingRate.findMany({
      where: { storeId: gate.storeId },
      select: {
        zoneId: true,
        feeUsd: true,
        freeOver: true,
        expressFeeUsd: true,
      },
    }),
    prisma.platformSetting.findMany({
      where: { key: { in: ["default_shipping_fee", "free_shipping_over"] } },
      select: { key: true, value: true },
    }),
  ]);

  const byZone = new Map(rates.map((r) => [r.zoneId, r]));
  const rows: ZoneRate[] = zones.map((z) => {
    const r = byZone.get(z.id);
    return {
      zoneId: z.id,
      zoneName: z.name,
      fee: r ? String(Number(r.feeUsd)) : "",
      freeOver: r?.freeOver != null ? String(Number(r.freeOver)) : "",
      expressFee:
        r?.expressFeeUsd != null ? String(Number(r.expressFeeUsd)) : "",
    };
  });

  const dmap = new Map(defaults.map((d) => [d.key, Number(d.value)]));
  const defaultFee = dmap.get("default_shipping_fee") ?? DEFAULT_SHIPPING_FEE;
  const defaultFreeOver = dmap.get("free_shipping_over") ?? DEFAULT_FREE_OVER;

  return (
    <div className="space-y-6">
      <Link
        href="/seller/settings"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("backToSettings")}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <ShippingRatesForm
        zones={rows}
        defaultFee={defaultFee}
        defaultFreeOver={defaultFreeOver}
      />
    </div>
  );
}
