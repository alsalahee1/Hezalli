import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { localizedName } from "@/lib/categories";
import { prisma } from "@/lib/prisma";
import { sellerAnalytics } from "@/lib/seller-metrics";
import { Link } from "@/i18n/navigation";
import { SalesChart } from "@/components/seller/sales-chart";

export const dynamic = "force-dynamic";

const PERIODS = [7, 30, 90];

export default async function SellerAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null; // layout guards auth

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: session.user.id },
    include: { store: true },
  });
  const store = profile?.store;
  if (!store) return null;

  const sp = await searchParams;
  const days = PERIODS.includes(Number(sp.days)) ? Number(sp.days) : 30;

  const a = await sellerAnalytics(store.id, days);
  const t = await getTranslations("SellerAnalytics");
  const format = await getFormatter();
  const locale = await getLocale();
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const kpis = [
    { key: "revenue", value: money(a.revenue), change: a.revenueChange },
    { key: "netEarnings", value: money(a.netEarnings), change: null },
    { key: "orders", value: String(a.orders), change: a.ordersChange },
    { key: "units", value: String(a.units), change: null },
    { key: "aov", value: money(a.aov), change: null },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("desc", { days })}</p>
        </div>
        <div className="flex gap-1 rounded-md border p-1">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`/seller/analytics?days=${p}`}
              className={
                p === days
                  ? "bg-primary text-primary-foreground rounded px-3 py-1 text-sm font-medium"
                  : "text-muted-foreground hover:text-foreground rounded px-3 py-1 text-sm"
              }
            >
              {t("periodDays", { days: p })}
            </Link>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.key} className="bg-card rounded-lg border p-4">
            <p className="text-muted-foreground text-sm">{t(k.key)}</p>
            <p className="mt-1 text-xl font-semibold" dir="ltr">
              {k.value}
            </p>
            {k.change != null ? (
              <p
                className={`mt-1 flex items-center gap-0.5 text-xs ${
                  k.change >= 0 ? "text-emerald-600" : "text-destructive"
                }`}
              >
                {k.change >= 0 ? (
                  <ArrowUpRight className="size-3" />
                ) : (
                  <ArrowDownRight className="size-3" />
                )}
                {Math.abs(k.change)}% {t("vsPrev")}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {/* Sales over time */}
      <div>
        <h2 className="mb-2 text-sm font-medium">{t("salesOverTime")}</h2>
        <SalesChart data={a.salesByDay} money={money} />
      </div>

      {/* Top products */}
      <div className="rounded-lg border">
        <div className="border-b p-4">
          <h2 className="font-medium">{t("topProducts")}</h2>
          <p className="text-muted-foreground text-sm">
            {t("topProductsDesc")}
          </p>
        </div>
        {a.topProducts.length === 0 ? (
          <p className="text-muted-foreground p-8 text-center text-sm">
            {t("noSales")}
          </p>
        ) : (
          <>
            <ul className="space-y-2 p-3 md:hidden">
              {a.topProducts.map((p) => (
                <li key={p.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/product/${p.slug}`}
                      className="font-medium hover:underline"
                    >
                      {localizedName(p.title, locale)}
                    </Link>
                    <span className="shrink-0 font-medium" dir="ltr">
                      {money(p.revenue)}
                    </span>
                  </div>
                  <dl className="text-muted-foreground mt-2 flex items-center gap-4 text-xs">
                    <div>
                      <dt className="inline">{t("colUnits")}: </dt>
                      <dd className="inline">{p.units}</dd>
                    </div>
                    <div>
                      <dt className="inline">{t("colViews")}: </dt>
                      <dd className="inline">{p.views}</dd>
                    </div>
                    <div>
                      <dt className="inline">{t("colConversion")}: </dt>
                      <dd className="inline">
                        {p.conversion == null ? "—" : `${p.conversion}%`}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b text-xs">
                  <tr>
                    <th className="p-3 text-start font-medium">
                      {t("colProduct")}
                    </th>
                    <th className="p-3 text-end font-medium">
                      {t("colUnits")}
                    </th>
                    <th className="p-3 text-end font-medium">
                      {t("colRevenue")}
                    </th>
                    <th className="p-3 text-end font-medium">
                      {t("colViews")}
                    </th>
                    <th className="p-3 text-end font-medium">
                      {t("colConversion")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {a.topProducts.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="p-3">
                        <Link
                          href={`/product/${p.slug}`}
                          className="hover:underline"
                        >
                          {localizedName(p.title, locale)}
                        </Link>
                      </td>
                      <td className="p-3 text-end tabular-nums">{p.units}</td>
                      <td className="p-3 text-end tabular-nums" dir="ltr">
                        {money(p.revenue)}
                      </td>
                      <td className="p-3 text-end tabular-nums">{p.views}</td>
                      <td className="text-muted-foreground p-3 text-end tabular-nums">
                        {p.conversion == null ? "—" : `${p.conversion}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
