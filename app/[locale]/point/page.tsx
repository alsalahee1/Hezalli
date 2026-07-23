import { getFormatter, getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  CalendarClock,
  Inbox,
  PackageCheck,
  RotateCcw,
  ShoppingBag,
  Truck,
} from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { getPlatformSettings } from "@/lib/settings";
import { maxDeliveryAttempts } from "@/lib/point-core";
import { pointLedgerSummary } from "@/lib/point-ledger";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ParcelSearch } from "@/components/point/parcel-search";
import { RtsButton } from "@/components/point/rts-button";

// The point operator's dashboard: every routed parcel of an in-flight
// sub-order, grouped by where it is in the custody chain.
export default async function PointDashboardPage() {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  const t = await getTranslations("Point");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const [parcels, maxAttempts, me, settings, cash] = await Promise.all([
    prisma.shipment.findMany({
      where: {
        OR: [
          { deliveryPointId: gate.pointId },
          { originPointId: gate.pointId },
        ],
        subOrder: { status: "SHIPPED" },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        trackingNumber: true,
        updatedAt: true,
        originPointId: true,
        deliveryPointId: true,
        atPointId: true,
        shelfCode: true,
        attemptCount: true,
        redeliverAt: true,
        redeliverNote: true,
        driver: { select: { name: true, email: true } },
        subOrder: {
          select: {
            shippingMethod: true,
            store: { select: { name: true } },
            order: {
              select: {
                id: true,
                address: {
                  select: { fullName: true, city: true, governorate: true },
                },
              },
            },
          },
        },
      },
    }),
    maxDeliveryAttempts(),
    prisma.deliveryPoint.findUnique({
      where: { id: gate.pointId },
      select: { capacity: true, depositUsd: true },
    }),
    getPlatformSettings(),
    pointLedgerSummary(gate.pointId),
  ]);
  const staleDays = settings.stale_parcel_days;

  // Load vs capacity (held + inbound), same definition as lib/point-select.ts.
  const load = parcels.filter(
    (p) =>
      p.atPointId === gate.pointId ||
      (p.status === "LABEL_CREATED" &&
        (p.originPointId
          ? p.originPointId === gate.pointId
          : p.deliveryPointId === gate.pointId)),
  ).length;
  const capacity = me?.capacity ?? null;
  // Days since a parcel last moved; past the threshold it gets an aged badge.
  const ageDays = (d: Date) =>
    Math.floor((Date.now() - d.getTime()) / 86_400_000);

  // COD credit control (lib/cod-guard.ts): the personal cash limit is the
  // base setting + the hub's deposit. Over it, the hub silently stops
  // receiving new routing and driver cash-ins — so say it out loud here,
  // the same way the driver home does.
  const cashLimit =
    settings.point_cash_limit > 0
      ? settings.point_cash_limit + Number(me?.depositUsd ?? 0)
      : 0;
  const cashBlocked = cashLimit > 0 && cash.cashOnHand > cashLimit;
  const cashNearLimit =
    !cashBlocked && cashLimit > 0 && cash.cashOnHand > 0.8 * cashLimit;

  // Counter pickups waiting for the buyer get their own group with a
  // days-left countdown against the pickup window (docs §20), so the
  // operator can nudge or RTS before the expiry notification fires.
  const isPickupWait = (p: (typeof parcels)[number]) =>
    p.status === "AT_POINT" &&
    p.atPointId === gate.pointId &&
    p.subOrder.shippingMethod === "PICKUP";

  const groups = [
    {
      key: "LABEL_CREATED",
      title: t("awaitingDrop"),
      icon: Inbox,
      items: parcels.filter((p) => p.status === "LABEL_CREATED"),
    },
    {
      key: "PICKUP_WAIT",
      title: t("awaitingPickup"),
      icon: ShoppingBag,
      items: parcels.filter(isPickupWait),
    },
    {
      key: "AT_POINT",
      title: t("atPoint"),
      icon: PackageCheck,
      items: parcels.filter(
        (p) =>
          p.status === "AT_POINT" &&
          p.atPointId === gate.pointId &&
          !isPickupWait(p),
      ),
    },
    {
      key: "OUT",
      title: t("outWithDrivers"),
      icon: Truck,
      items: parcels.filter(
        (p) =>
          p.status === "OUT_FOR_DELIVERY" ||
          p.status === "FAILED" ||
          (p.status === "IN_TRANSIT" && p.originPointId === gate.pointId),
      ),
    },
    {
      key: "RETURNED_TO_POINT",
      title: t("returnedToPoint"),
      icon: RotateCcw,
      items: parcels.filter((p) => p.status === "RETURNED_TO_POINT"),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{t("parcelsTitle")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("parcelsCount", { count: parcels.length })}
          </p>
        </div>
        {capacity != null ? (
          <span
            className={
              load >= capacity
                ? "rounded bg-red-500/15 px-2 py-1 text-xs font-semibold text-red-600"
                : "bg-muted rounded px-2 py-1 text-xs font-medium"
            }
            title={t("capacityTitle")}
            dir="ltr"
          >
            {load}/{capacity}
          </span>
        ) : null}
      </div>

      {cashBlocked ? (
        <Link
          href="/point/ledger"
          className="block rounded-xl border border-red-500/50 bg-red-500/10 p-4"
        >
          <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-400">
            <AlertTriangle className="size-4" /> {t("cashBlockedTitle")}
          </p>
          <p className="mt-1 text-sm">
            {t("cashBlockedBody", {
              amount: money(cash.cashOnHand),
              limit: money(cashLimit),
            })}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("cashBlockedHow")}
          </p>
        </Link>
      ) : cashNearLimit ? (
        <Link
          href="/point/ledger"
          className="block rounded-xl border border-amber-500/50 bg-amber-500/10 p-4"
        >
          <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-500">
            <AlertTriangle className="size-4" />{" "}
            {t("cashNearLimit", {
              amount: money(cash.cashOnHand),
              limit: money(cashLimit),
            })}
          </p>
        </Link>
      ) : null}

      <ParcelSearch />

      {parcels.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
          <PackageCheck className="mx-auto mb-2 size-8 opacity-50" />
          {t("noParcels")}
        </div>
      ) : (
        groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section key={g.key} className="space-y-2">
              <h2 className="text-muted-foreground flex items-center gap-1.5 text-sm font-semibold">
                <g.icon className="size-4" /> {g.title}
                <span className="bg-muted rounded px-1.5 text-xs">
                  {g.items.length}
                </span>
              </h2>
              <ul className="space-y-2">
                {g.items.map((p) => {
                  const pickupDaysLeft =
                    g.key === "PICKUP_WAIT"
                      ? settings.pickup_window_days - ageDays(p.updatedAt)
                      : null;
                  return (
                    <li key={p.id} className="rounded-xl border p-3">
                      <Link href={`/point/parcel/${p.id}`} className="block">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium" dir="ltr">
                            {p.trackingNumber}
                          </span>
                          {p.shelfCode && p.atPointId === gate.pointId ? (
                            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-sky-600">
                              {t("shelfBadge", { code: p.shelfCode })}
                            </span>
                          ) : null}
                          {p.originPointId &&
                          p.originPointId !== p.deliveryPointId ? (
                            <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-violet-600">
                              {t("transferBadge")}
                            </span>
                          ) : null}
                          {p.subOrder.shippingMethod === "PICKUP" &&
                          g.key !== "PICKUP_WAIT" ? (
                            <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-sky-600">
                              {t("pickupBadge")}
                            </span>
                          ) : null}
                          {pickupDaysLeft != null ? (
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[11px] font-semibold",
                                pickupDaysLeft <= 0
                                  ? "bg-red-500/15 text-red-600"
                                  : pickupDaysLeft <= 2
                                    ? "bg-amber-500/15 text-amber-600"
                                    : "bg-muted",
                              )}
                            >
                              {pickupDaysLeft <= 0
                                ? t("pickupExpired")
                                : t("pickupDaysLeft", {
                                    days: pickupDaysLeft,
                                  })}
                            </span>
                          ) : null}
                          {ageDays(p.updatedAt) >= staleDays &&
                          g.key !== "PICKUP_WAIT" ? (
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-600">
                              {t("staleBadge", { days: ageDays(p.updatedAt) })}
                            </span>
                          ) : null}
                          {p.status === "FAILED" ? (
                            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-600">
                              {t("failedBadge")}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-sm">
                          {p.subOrder.store.name} →{" "}
                          {p.subOrder.order.address.fullName} ·{" "}
                          {p.subOrder.order.address.city}
                        </p>
                        {p.driver ? (
                          <p className="text-muted-foreground text-xs">
                            {t("driver")}: {p.driver.name ?? p.driver.email}
                          </p>
                        ) : null}
                        {p.attemptCount > 0 ? (
                          <p className="text-muted-foreground text-xs">
                            {t("attempts", {
                              count: p.attemptCount,
                              max: maxAttempts,
                            })}
                          </p>
                        ) : null}
                        {p.redeliverAt ? (
                          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-500">
                            <CalendarClock className="size-3.5" />
                            {t("redeliverOn", {
                              date: format.dateTime(p.redeliverAt, {
                                dateStyle: "medium",
                              }),
                            })}
                            {p.redeliverNote ? ` — ${p.redeliverNote}` : null}
                          </p>
                        ) : null}
                      </Link>
                      {/* Attempt limit reached → offer the terminal RTS scan-less action. */}
                      {p.status === "RETURNED_TO_POINT" &&
                      p.attemptCount >= maxAttempts &&
                      p.trackingNumber ? (
                        <div className="mt-2">
                          <RtsButton tracking={p.trackingNumber} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}
