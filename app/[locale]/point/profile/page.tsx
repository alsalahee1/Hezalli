import { getFormatter, getTranslations } from "next-intl/server";
import { Landmark, MapPin, Phone, Store } from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { canManagePoint, canViewMoney } from "@/lib/point-access";
import { pointLedgerSummary } from "@/lib/point-ledger";
import {
  hasAnyHours,
  isPointOpenNow,
  parseWeeklyHours,
} from "@/lib/point-hours";
import { getPlatformSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { PointPauseToggle } from "@/components/point/point-pause-toggle";
import { PointHoursEditor } from "@/components/point/point-hours-editor";
import { PointSlotCapacityEditor } from "@/components/point/point-slot-capacity-editor";

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
        slotCapacity: true,
        depositUsd: true,
        pausedAt: true,
        openingHours: true,
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

  // Published opening hours (docs §42g) drive an open/closed chip; the editor
  // is shown to owner/manager only.
  const hours = parseWeeklyHours(point.openingHours);
  const openNow = hours && hasAnyHours(hours) ? isPointOpenNow(hours) : null;
  const canManage = canManagePoint(gate.access);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{t("profileTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("profileSubtitle")}</p>
      </div>

      {/* Vacation mode: stop new routing while the shop is closed; the
          counter keeps working for parcels already announced or held.
          Owner/manager only — a cashier can't close the hub. */}
      {canManage ? <PointPauseToggle paused={point.pausedAt != null} /> : null}

      {/* Per-hub arrival-queue slot cap (docs §45): owner/manager tune how
          many bookings a single slot accepts here, overriding the platform
          default. Only while the queue feature is on. */}
      {canManage && settings.queue_enabled ? (
        <PointSlotCapacityEditor
          initial={point.slotCapacity}
          platformDefault={settings.queue_slot_capacity}
        />
      ) : null}

      {/* Weekly opening hours: an editor for owner/manager, a read-only
          open/closed line for everyone else. */}
      {canManage ? (
        <PointHoursEditor initial={hours} />
      ) : openNow !== null ? (
        <p className="text-sm">
          {openNow ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              {t("hoursOpenNow")}
            </span>
          ) : (
            <span className="text-muted-foreground font-medium">
              {t("hoursClosedNow")}
            </span>
          )}
        </p>
      ) : null}

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
        {canViewMoney(gate.access) ? (
          <div className="rounded-xl border p-3">
            <p className="text-muted-foreground text-xs font-medium">
              {t("profileDeposit")}
            </p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {money(deposit)}
            </p>
          </div>
        ) : null}
      </div>

      {cashLimit > 0 && canViewMoney(gate.access) ? (
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
