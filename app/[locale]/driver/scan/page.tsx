import { getTranslations } from "next-intl/server";

import { requireCourierId } from "@/lib/authz";
import { QrScanner } from "@/components/driver/qr-scanner";

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
    </div>
  );
}
