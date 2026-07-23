import { getFormatter, getTranslations } from "next-intl/server";
import { Landmark, MapPin, Phone, Store } from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { pointLedgerSummary } from "@/lib/point-ledger";
import { getPlatformSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";

// The hub's own record card: the business details published in the public
// /points directory, the capacity admins set, and the cash-limit breakdown
// (base + deposit) that gates routing. Read-only — these fields are managed
// by Hezalli staff, so the page says who to ask instead of pretending to
// offer an edit.
export default async function PointProfilePage() {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  const t = await getTranslations("Point");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const [point, settings, cash] = await Promise.all([
    prisma.deliveryPoint.findUnique({
      where: { id: gate.pointId },
      select: {
        name: true,
        phone: true,
        governorate: true,
        city: true,
        addressLine: true,
        capacity: true,
        depositUsd: true,
        createdAt: true,
      },
    }),
    getPlatformSettings(),
    pointLedgerSummary(gate.pointId),
  ]);
  if (!point) return null;

  const deposit = Number(point.depositUsd);
  const cashLimit =
    settings.point_cash_limit > 0 ? settings.point_cash_limit + deposit : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{t("profileTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("profileSubtitle")}</p>
      </div>

      <div className="space-y-2 rounded-xl border p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          <Store className="text-primary size-4" /> {point.name}
        </p>
        <p className="text-muted-foreground flex items-center gap-2">
          <Phone className="size-4" />
          <span dir="ltr">{point.phone}</span>
        </p>
        <p className="text-muted-foreground flex items-center gap-2">
          <MapPin className="size-4" />
          {point.addressLine}, {point.city}, {point.governorate}
        </p>
        <p className="text-muted-foreground text-xs">
          {t("profileSince", {
            date: format.dateTime(point.createdAt, { dateStyle: "medium" }),
          })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-medium">
            {t("profileCapacity")}
          </p>
          <p className="mt-1 text-lg font-semibold" dir="ltr">
            {point.capacity ?? t("profileUnlimited")}
          </p>
        </div>
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground text-xs font-medium">
            {t("profileDeposit")}
          </p>
          <p className="mt-1 text-lg font-semibold" dir="ltr">
            {money(deposit)}
          </p>
        </div>
      </div>

      {cashLimit > 0 ? (
        <section className="space-y-2 rounded-xl border p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Landmark className="size-4" /> {t("profileLimitTitle")}
          </h2>
          <p className="text-muted-foreground text-xs">
            {t("profileLimitLine", {
              base: money(settings.point_cash_limit),
              deposit: money(deposit),
              limit: money(cashLimit),
            })}
          </p>
          <p className="text-sm">
            {t("profileCashNow", { amount: money(cash.cashOnHand) })}
          </p>
        </section>
      ) : null}

      <p className="text-muted-foreground text-xs">{t("profileEditHint")}</p>
    </div>
  );
}
