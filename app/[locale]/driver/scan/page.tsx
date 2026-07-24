import { getTranslations } from "next-intl/server";

import { requireCourierId } from "@/lib/authz";
import { DriverScanToggle } from "@/components/driver/driver-scan-toggle";
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
      {/* Segmented toggle mirrors the wallet's scan sheet (docs/DELIVERY-POINTS.md
          §3): swap the whole view between the parcel scanner and the driver's
          own collection QR, instead of stacking both on the page. */}
      <DriverScanToggle
        myQr={<QrCode value={`hezalli:driver:${courierId}`} size={220} />}
      />
    </div>
  );
}
