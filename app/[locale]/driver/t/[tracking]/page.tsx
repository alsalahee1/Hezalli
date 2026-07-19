import { getLocale, getTranslations } from "next-intl/server";
import { PackageX } from "lucide-react";

import { requireCourierId } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { Link, redirect } from "@/i18n/navigation";

// Resolves a scanned tracking number to one of the courier's own jobs and
// forwards to it. Guards against scanning a parcel that isn't assigned to them.
export default async function DriverResolvePage({
  params,
}: {
  params: Promise<{ tracking: string }>;
}) {
  const { tracking } = await params;
  const courierId = await requireCourierId();
  if (!courierId) return null;
  const locale = await getLocale();
  const tn = decodeURIComponent(tracking).trim();

  const shipment = tn
    ? await prisma.shipment.findFirst({
        where: { trackingNumber: tn, driverId: courierId },
        select: { id: true },
      })
    : null;

  if (shipment) {
    redirect({ href: `/driver/job/${shipment.id}`, locale });
  }

  const t = await getTranslations("Driver");
  return (
    <div className="space-y-4 py-10 text-center">
      <PackageX className="text-muted-foreground mx-auto size-10" />
      <div>
        <h1 className="font-semibold">{t("notYourJobTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {t("notYourJobBody")}
        </p>
        {tn ? (
          <p className="mt-2 font-mono text-xs" dir="ltr">
            {tn}
          </p>
        ) : null}
      </div>
      <Link
        href="/driver/scan"
        className="text-primary inline-block text-sm font-medium hover:underline"
      >
        {t("scanAgain")}
      </Link>
    </div>
  );
}
