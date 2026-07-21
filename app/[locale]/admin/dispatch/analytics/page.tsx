import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { courierLeaderboard, deliveryOverview } from "@/lib/delivery-analytics";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";

// Fleet performance dashboard: headline delivery metrics + a per-courier
// leaderboard. Windowed by ?days= (7 / 30 / all). Read-only.
export default async function DeliveryAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: daysRaw } = await searchParams;
  const days =
    daysRaw === "7" ? 7 : daysRaw === "30" ? 30 : daysRaw === "all" ? 0 : 30;

  const t = await getTranslations("DeliveryAnalytics");
  const format = await getFormatter();
  const [overview, leaders] = await Promise.all([
    deliveryOverview(days || undefined),
    courierLeaderboard(),
  ]);

  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });
  const pct = (n: number | null) => (n == null ? "—" : `${n}%`);
  const hrs = (n: number | null) =>
    n == null ? "—" : n >= 24 ? `${(n / 24).toFixed(1)}d` : `${n}h`;

  const stats = [
    { key: "delivered", value: String(overview.delivered) },
    { key: "onTime", value: pct(overview.onTimePct), good: true },
    { key: "avgTime", value: hrs(overview.avgHours) },
    { key: "returned", value: String(overview.returned), warn: true },
    {
      key: "failedAttempts",
      value: String(overview.failedAttempts),
      warn: true,
    },
    { key: "avgAttempts", value: overview.avgAttempts?.toString() ?? "—" },
    {
      key: "codOutstanding",
      value: money(overview.codOutstanding),
      accent: true,
    },
  ];

  const windows: { k: string; label: string }[] = [
    { k: "7", label: t("win7") },
    { k: "30", label: t("win30") },
    { k: "all", label: t("winAll") },
  ];
  const current = days === 7 ? "7" : days === 0 ? "all" : "30";

  return (
    <div className="space-y-6">
      <Link
        href="/admin/dispatch"
        className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("backToDispatch")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("desc")}</p>
        </div>
        <div className="flex gap-1 rounded-lg border p-1 text-sm">
          {windows.map((w) => (
            <Link
              key={w.k}
              href={`/admin/dispatch/analytics?days=${w.k}`}
              className={cn(
                "rounded-md px-3 py-1 font-medium",
                current === w.k
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {w.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.key}
            className={cn(
              "rounded-xl border p-4",
              s.accent && "border-amber-500/40 bg-amber-500/5",
            )}
          >
            <p className="text-muted-foreground text-xs">{t(s.key)}</p>
            <p
              className={cn(
                "mt-1 text-xl font-semibold",
                s.good && "text-emerald-600",
                s.warn && "text-orange-600",
              )}
              dir="ltr"
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Courier leaderboard */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("leaderboard")}</h2>
        {leaders.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noCouriers")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  <th className="p-2 text-start font-medium">
                    {t("colDriver")}
                  </th>
                  <th className="p-2 text-end font-medium">
                    {t("colDeliveries")}
                  </th>
                  <th className="p-2 text-end font-medium">{t("colRating")}</th>
                  <th className="p-2 text-end font-medium">{t("colCash")}</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((c) => (
                  <tr key={c.courierId} className="border-b last:border-0">
                    <td className="p-2">
                      <Link
                        href={`/admin/couriers/${c.courierId}`}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="p-2 text-end tabular-nums" dir="ltr">
                      {c.deliveries}
                    </td>
                    <td className="p-2 text-end" dir="ltr">
                      {c.rating != null ? (
                        <span className="font-medium text-amber-600">
                          ★ {c.rating.toFixed(1)}{" "}
                          <span className="text-muted-foreground text-xs">
                            ({c.ratingCount})
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2 text-end tabular-nums" dir="ltr">
                      {c.cashOnHand > 0 ? (
                        <span className="text-amber-600">
                          {money(c.cashOnHand)}
                        </span>
                      ) : (
                        money(c.cashOnHand)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
