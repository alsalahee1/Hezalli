import { getTranslations } from "next-intl/server";

import { ScanConsole } from "@/components/delivery-manager/scan-console";

export const dynamic = "force-dynamic";

// Hub scan station for delivery staff: pick a status, then scan waybill
// barcodes (or the buyer QR) to apply it — the fast, type-nothing flow J&T
// hubs run on.
export default async function DeliveryManagerScanPage() {
  const t = await getTranslations("DeliveryManager");
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("scan")}</h1>
        <p className="text-muted-foreground text-sm">{t("scanDesc")}</p>
      </div>
      <ScanConsole />
    </div>
  );
}
