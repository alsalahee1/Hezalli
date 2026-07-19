import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Circle,
  Package,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Link } from "@/i18n/navigation";

export default async function SellerDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null; // layout redirects unauthenticated users

  const profile = await prisma.sellerProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      store: true,
      _count: { select: { payoutMethods: true } },
    },
  });
  const store = profile?.store;
  if (!profile || !store) return null; // layout redirects non-sellers to /sell

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [productCount, ordersToday, pendingShipments, revenueAgg, recent] =
    await Promise.all([
      prisma.product.count({
        where: { storeId: store.id, status: "ACTIVE" },
      }),
      prisma.subOrder.count({
        where: { storeId: store.id, createdAt: { gte: startOfToday } },
      }),
      // Shipments that still need the seller's action (not yet handed off).
      prisma.shipment.count({
        where: {
          subOrder: { storeId: store.id },
          status: { in: ["PENDING", "LABEL_CREATED"] },
        },
      }),
      prisma.subOrder.aggregate({
        where: {
          storeId: store.id,
          status: "COMPLETED",
          completedAt: { gte: startOfMonth },
        },
        _sum: { sellerNet: true },
      }),
      prisma.subOrder.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          status: true,
          itemsTotal: true,
          shippingTotal: true,
          createdAt: true,
        },
      }),
    ]);

  const t = await getTranslations("SellerDashboard");
  const format = await getFormatter();
  const revenue = Number(revenueAgg._sum.sellerNet ?? 0);
  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const stats = [
    { key: "products", icon: Package, value: String(productCount) },
    { key: "ordersToday", icon: ShoppingBag, value: String(ordersToday) },
    { key: "pendingShipments", icon: Truck, value: String(pendingShipments) },
    { key: "revenueMonth", icon: Banknote, value: money(revenue) },
  ] as const;

  const checklist = [
    {
      key: "checkProduct",
      done: productCount > 0,
      href: "/seller/products",
    },
    {
      key: "checkProfile",
      done: Boolean(store.description),
      href: "/seller/settings",
    },
    {
      key: "checkPayout",
      done: profile._count.payoutMethods > 0,
      href: "/seller/settings#payout",
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("welcome", { store: store.name })}
        </p>
      </div>

      {store.status === "SUSPENDED" ? (
        <div className="bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t("suspendedBanner")}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.key}
              className="bg-card text-card-foreground rounded-lg border p-4"
            >
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Icon className="size-4" />
                {t(s.key)}
              </div>
              <p className="mt-1 text-2xl font-semibold" dir="ltr">
                {s.value}
              </p>
            </div>
          );
        })}
      </div>

      <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t("recentOrders")}</h2>
          {recent.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-sm">
              {t("noOrders")}
            </p>
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {recent.map((o) => (
                  <li key={o.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs">
                        #{o.id.slice(-8)}
                      </span>
                      <span className="bg-muted rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap">
                        {t(`status_${o.status}`)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground text-xs whitespace-nowrap">
                        {format.dateTime(o.createdAt, { dateStyle: "medium" })}
                      </span>
                      <span className="font-medium" dir="ltr">
                        {money(Number(o.itemsTotal) + Number(o.shippingTotal))}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-lg border md:block">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="px-3 py-2 text-start font-medium">
                        {t("order")}
                      </th>
                      <th className="px-3 py-2 text-start font-medium">
                        {t("date")}
                      </th>
                      <th className="px-3 py-2 text-start font-medium">
                        {t("total")}
                      </th>
                      <th className="px-3 py-2 text-start font-medium">
                        {t("statusCol")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((o) => (
                      <tr key={o.id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">
                          #{o.id.slice(-8)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {format.dateTime(o.createdAt, {
                            dateStyle: "medium",
                          })}
                        </td>
                        <td className="px-3 py-2" dir="ltr">
                          {money(
                            Number(o.itemsTotal) + Number(o.shippingTotal),
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className="bg-muted rounded px-1.5 py-0.5 text-xs font-medium">
                            {t(`status_${o.status}`)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="text-muted-foreground text-xs">{t("ordersNote")}</p>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{t("setup")}</h2>
          <ul className="space-y-2">
            {checklist.map((c) => (
              <li key={c.key}>
                <Link
                  href={c.href}
                  className="bg-card hover:bg-muted flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors"
                >
                  {c.done ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="text-muted-foreground size-4 shrink-0" />
                  )}
                  <span
                    className={
                      c.done ? "text-muted-foreground line-through" : ""
                    }
                  >
                    {t(c.key)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
