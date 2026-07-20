import { getTranslations } from "next-intl/server";

import { requireDeliveryPoint } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { PointScan } from "@/components/point/point-scan";

export default async function PointScanPage() {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  const t = await getTranslations("Point");

  // Active couriers for the handover driver picker (a driver's collection QR
  // selects them faster, but the list keeps camera-less counters working).
  const couriers = await prisma.user.findMany({
    where: { roles: { has: "COURIER" }, isSuspended: false, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  const drivers = couriers.map((c) => ({
    id: c.id,
    name: c.name ?? c.email ?? c.id.slice(-6),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{t("scanTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("scanSubtitle")}</p>
      </div>
      <PointScan drivers={drivers} />
    </div>
  );
}
