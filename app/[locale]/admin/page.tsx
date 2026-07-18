import {
  AlertTriangle,
  Banknote,
  DollarSign,
  ShoppingBag,
  Store,
  Users,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { dashboardKpis } from "@/lib/admin-metrics";
import { STATUS_BADGE } from "@/lib/order-status";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const t = await getTranslations("AdminDash");
  const format = await getFormatter();
  const k = await dashboardKpis();

  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });
  const maxDay = Math.max(1, ...k.salesByDay.map((d) => d.total));

  const cards = [
    {
      key: "gmvMonth",
      value: money(k.gmvMonth),
      icon: DollarSign,
      hint: money(k.gmvToday) + " " + t("today"),
    },
    { key: "orders", value: String(k.ordersMonth), icon: ShoppingBag },
    { key: "newUsers", value: String(k.newUsersMonth), icon: Users },
    { key: "newSellers", value: String(k.newSellers), icon: Store },
    {
      key: "disputes",
      value: String(k.activeDisputes),
      icon: AlertTriangle,
      href: "/admin/disputes",
    },
    {
      key: "payouts",
      value: String(k.pendingPayouts),
      icon: Banknote,
      href: "/admin/payouts",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        <Link
          href="/admin/reports"
          className="text-primary text-sm font-medium hover:underline"
        >
          {t("viewReports")}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const body = (
            <div className="bg-card rounded-lg border p-4">
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Icon className="size-4" /> {t(c.key)}
              </div>
              <p className="mt-1 text-2xl font-semibold" dir="ltr">
                {c.value}
              </p>
              {c.hint ? (
                <p className="text-muted-foreground mt-0.5 text-xs" dir="ltr">
                  {c.hint}
                </p>
              ) : null}
            </div>
          );
          return c.href ? (
            <Link key={c.key} href={c.href} className="hover:opacity-80">
              {body}
            </Link>
          ) : (
            <div key={c.key}>{body}</div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sales over time */}
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 font-semibold">{t("salesOverTime")}</h2>
          {k.salesByDay.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noData")}</p>
          ) : (
            <div className="flex h-40 items-end gap-1">
              {k.salesByDay.map((d) => (
                <div
                  key={d.day}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${d.day}: ${money(d.total)}`}
                >
                  <div
                    className="bg-primary/70 w-full rounded-t"
                    style={{ height: `${(d.total / maxDay) * 100}%` }}
                  />
                  <span className="text-muted-foreground text-[9px]">
                    {d.day.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Orders by status */}
        <section className="rounded-lg border p-4">
          <h2 className="mb-3 font-semibold">{t("ordersByStatus")}</h2>
          <ul className="space-y-1.5 text-sm">
            {Object.entries(k.ordersByStatus)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => (
                <li key={status} className="flex items-center justify-between">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-medium",
                      STATUS_BADGE[status] ?? "bg-muted",
                    )}
                  >
                    {status}
                  </span>
                  <span className="font-medium">{count}</span>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
