import { getFormatter, getTranslations } from "next-intl/server";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  PackageCheck,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  UserX,
  Users,
  Wallet,
} from "lucide-react";

import { getLocale } from "next-intl/server";

import { requireDeliveryPoint } from "@/lib/authz";
import { canViewMoney } from "@/lib/point-access";
import { monthRange } from "@/lib/point-statement";
import { hubSummary, queueStats } from "@/lib/point-stats";
import { getPlatformSettings } from "@/lib/settings";
import { Link, redirect } from "@/i18n/navigation";

// The hub's own scoreboard: the per-hub numbers admins already see on the
// Reports page (lib/point-stats.ts), month by month, plus all-time totals —
// so the operator can watch their volume, success rate, and fees grow.
export default async function PointStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const gate = await requireDeliveryPoint();
  if (!gate) return null;
  // Fees/earnings on this page → money view only (docs §42d).
  if (!canViewMoney(gate.access)) {
    redirect({ href: "/point", locale: await getLocale() });
  }
  const { month } = await searchParams;
  const t = await getTranslations("Point");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const { from, to } = monthRange(month);
  const [stats, allTime, settings, queue] = await Promise.all([
    hubSummary(gate.pointId, from, to),
    hubSummary(gate.pointId, new Date(0), new Date()),
    getPlatformSettings(),
    queueStats(gate.pointId, from, to),
  ]);

  const shift = (delta: number) => {
    const d = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + delta, 1),
    );
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const monthLabel = format.dateTime(from, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const tiles = [
    {
      key: "delivered",
      label: t("statDelivered"),
      icon: PackageCheck,
      value: String(stats.delivered),
      tone: "text-emerald-700 dark:text-emerald-500",
    },
    {
      key: "pickups",
      label: t("statPickups"),
      icon: ShoppingBag,
      value: String(stats.pickups),
      tone: "text-sky-700 dark:text-sky-500",
    },
    {
      key: "rts",
      label: t("statRts"),
      icon: RotateCcw,
      value: String(stats.rts),
      tone: "text-red-700 dark:text-red-500",
    },
    {
      key: "fees",
      label: t("statFees"),
      icon: Wallet,
      value: money(stats.feesUsd),
      tone: "text-emerald-700 dark:text-emerald-500",
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{t("statsTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("statsSubtitle")}</p>
      </div>

      {/* Month navigation — same control as the statement page. */}
      <div className="flex items-center justify-between rounded-xl border p-2">
        <Link
          href={`/point/stats?month=${shift(-1)}`}
          className="hover:bg-muted rounded-md p-2"
          aria-label={t("stmtPrev")}
        >
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </Link>
        <span className="text-sm font-semibold">{monthLabel}</span>
        <Link
          href={`/point/stats?month=${shift(1)}`}
          className="hover:bg-muted rounded-md p-2"
          aria-label={t("stmtNext")}
        >
          <ChevronRight className="size-4 rtl:rotate-180" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => (
          <div key={tile.key} className="rounded-xl border p-3">
            <p
              className={`flex items-center gap-1.5 text-xs font-medium ${tile.tone}`}
            >
              <tile.icon className="size-3.5" /> {tile.label}
            </p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      {stats.successRatePct != null || stats.pickupSharePct != null ? (
        <div className="grid grid-cols-2 gap-3">
          {stats.successRatePct != null ? (
            <div className="rounded-xl border p-3">
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <TrendingUp className="size-3.5" /> {t("statSuccessRate")}
              </p>
              <p className="mt-1 text-lg font-semibold" dir="ltr">
                {stats.successRatePct}%
              </p>
            </div>
          ) : null}
          {stats.pickupSharePct != null ? (
            <div className="rounded-xl border p-3">
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <ShoppingBag className="size-3.5" /> {t("statPickupShare")}
              </p>
              <p className="mt-1 text-lg font-semibold" dir="ltr">
                {stats.pickupSharePct}%
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="space-y-2 rounded-xl border p-4">
        <h2 className="text-sm font-semibold">{t("statsAllTime")}</h2>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">
              {t("statDelivered")}
            </dt>
            <dd className="font-semibold" dir="ltr">
              {allTime.delivered}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">{t("statRts")}</dt>
            <dd className="font-semibold" dir="ltr">
              {allTime.rts}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">{t("statFees")}</dt>
            <dd className="font-semibold" dir="ltr">
              {money(allTime.feesUsd)}
            </dd>
          </div>
        </dl>
      </section>

      {/* Arrival queue scoreboard (docs §46): throughput, no-shows, and how
          long people waited this month — only when the queue feature is on and
          there was activity. */}
      {settings.queue_enabled && queue.total > 0 ? (
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Users className="size-4" /> {t("queueStatsTitle")}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border p-3">
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <Users className="size-3.5" /> {t("queueStatServed")}
              </p>
              <p className="mt-1 text-lg font-semibold" dir="ltr">
                {queue.served}
              </p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-500">
                <UserX className="size-3.5" /> {t("queueStatNoShowRate")}
              </p>
              <p className="mt-1 text-lg font-semibold" dir="ltr">
                {queue.noShowRatePct == null ? "—" : `${queue.noShowRatePct}%`}
              </p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                <Clock className="size-3.5" /> {t("queueStatAvgWait")}
              </p>
              <p className="mt-1 text-lg font-semibold" dir="ltr">
                {queue.avgWaitMin == null
                  ? "—"
                  : t("queueStatMinutes", { min: queue.avgWaitMin })}
              </p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-muted-foreground text-xs font-medium">
                {t("queueStatWalkIns")}
              </p>
              <p className="mt-1 text-lg font-semibold" dir="ltr">
                {queue.walkIns}
                <span className="text-muted-foreground text-xs font-normal">
                  {" "}
                  / {queue.booked} {t("queueStatBooked")}
                </span>
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
