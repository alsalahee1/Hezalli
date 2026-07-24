import { getTranslations } from "next-intl/server";

import { requireCourierId } from "@/lib/authz";
import { QrScanner } from "@/components/driver/qr-scanner";
import { QrCode } from "@/components/orders/qr-code";

export default async function DriverScanPage() {
  const courierId = await requireCourierId();
  if (!courierId) return null;
  const t = await getTranslations("Driver");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{t("scanTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("scanSubtitle")}</p>
      </div>
      <QrScanner />

      {/* Collection QR moved here from the jobs dashboard: point staff scan
          this to pull up the driver's manifest at the counter
          (docs/DELIVERY-POINTS.md §3). Collapsed by default. */}
      <details className="rounded-xl border">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          {t("myQr")}
        </summary>
        <div className="flex flex-col items-center gap-2 border-t px-4 py-4">
          <QrCode value={`hezalli:driver:${courierId}`} size={180} />
          <p className="text-muted-foreground text-center text-xs">
            {t("myQrHint")}
          </p>
        </div>
      </details>
    </div>
  );
}
