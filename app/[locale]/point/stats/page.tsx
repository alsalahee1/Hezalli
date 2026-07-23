import { getFormatter, getTranslations } from "next-intl/server";
import {
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { requireDeliveryPoint } from "@/lib/authz";
import { monthRange } from "@/lib/point-statement";
import { hubSummary } from "@/lib/point-stats";
import { Link } from "@/i18n/navigation";

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
  const { month } = await searchParams;
  const t = await getTranslations("Point");
  const format = await getFormatter();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const { from, to } = monthRange(month);
  const [stats, allTime] = await Promise.all([
    hubSummary(gate.pointId, from, to),
    hubSummary(gate.pointId, new Date(0), new Date()),
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
    </div>
  );
}
