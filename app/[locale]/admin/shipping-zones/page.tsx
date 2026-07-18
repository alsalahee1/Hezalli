import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import {
  ShippingZoneManager,
  type ZoneRow,
} from "@/components/admin/shipping-zone-manager";

export default async function AdminShippingZonesPage() {
  const t = await getTranslations("AdminShippingZones");
  const zones = await prisma.shippingZone.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, governorates: true },
  });
  const rows: ZoneRow[] = zones;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <ShippingZoneManager zones={rows} />
    </div>
  );
}
