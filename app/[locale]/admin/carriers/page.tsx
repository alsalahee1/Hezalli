import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import {
  CarrierManager,
  type CarrierRow,
} from "@/components/admin/carrier-manager";

export default async function AdminCarriersPage() {
  const t = await getTranslations("AdminCarriers");
  const carriers = await prisma.carrier.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      trackingUrl: true,
      platformManaged: true,
    },
  });
  const rows: CarrierRow[] = carriers;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("desc")}</p>
      </div>
      <CarrierManager carriers={rows} />
    </div>
  );
}
