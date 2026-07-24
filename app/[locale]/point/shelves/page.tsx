import { getTranslations } from "next-intl/server";
import { Boxes } from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { getPlatformSettings } from "@/lib/settings";
import { pointShelfMonitor } from "@/lib/point-shelves";
import { AutoRefresh } from "@/components/point/auto-refresh";
import { ShelfMonitor } from "@/components/point/shelf-monitor";

// The shelves monitor: a live, wall-mountable board of every registered bay —
// how full each is and how old what's on it is — so the counter sees the whole
// floor at a glance and can clear aging parcels before they turn into returns.
export default async function PointShelvesPage() {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  const t = await getTranslations("Point");

  const settings = await getPlatformSettings();
  const staleDays = settings.stale_parcel_days;
  const bays = await pointShelfMonitor(gate.pointId, staleDays);

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={30} />
      <div>
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <Boxes className="size-5" /> {t("monitorTitle")}
        </h1>
        <p className="text-muted-foreground text-sm">{t("monitorSubtitle")}</p>
      </div>
      <ShelfMonitor bays={bays} staleDays={staleDays} />
    </div>
  );
}
