import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { setStoreStatus } from "@/lib/actions/seller";
import { getCommissionRate } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SellerCommission } from "@/components/admin/seller-commission";

export const dynamic = "force-dynamic";

const payoutBadge: Record<string, string> = {
  REQUESTED: "bg-amber-500/15 text-amber-600",
  APPROVED: "bg-sky-500/15 text-sky-600",
  PAID: "bg-emerald-500/15 text-emerald-600",
  REJECTED: "bg-destructive/10 text-destructive",
};

export default async function AdminSellerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("AdminSellers");
  const format = await getFormatter();

  const seller = await prisma.sellerProfile.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, email: true } },
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          _count: { select: { products: true } },
        },
      },
      balance: true,
      payouts: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!seller) notFound();

  const platformRate = await getCommissionRate();
  const store = seller.store;
  const ordersCount = store
    ? await prisma.subOrder.count({ where: { storeId: store.id } })
    : 0;
  const suspended = store?.status === "SUSPENDED";

  const money = (n: unknown) =>
    format.number(Number(n), { style: "currency", currency: "USD" });

  return (
    <div className="space-y-6">
      <Link
        href="/admin/sellers"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {store?.name ?? seller.user.name ?? "—"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {seller.user.name} · {seller.user.email}
          </p>
          {store ? (
            <Link
              href={`/store/${store.slug}`}
              className="text-muted-foreground hover:text-foreground text-xs hover:underline"
            >
              /{store.slug}
            </Link>
          ) : null}
        </div>
        {store ? (
          <span
            className={cn(
              "rounded px-2 py-1 text-xs font-medium",
              suspended
                ? "bg-destructive/10 text-destructive"
                : "bg-emerald-500/15 text-emerald-600",
            )}
          >
            {t(`status_${store.status}`)}
          </span>
        ) : null}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={t("products")}
          value={String(store?._count.products ?? 0)}
        />
        <Stat label={t("ordersCol")} value={String(ordersCount)} />
        <Stat
          label={t("available")}
          value={money(seller.balance?.availableUsd ?? 0)}
        />
        <Stat
          label={t("pending")}
          value={money(seller.balance?.pendingUsd ?? 0)}
        />
      </div>

      {/* Commission override */}
      <section className="space-y-3 rounded-lg border p-4">
        <div>
          <h2 className="font-medium">{t("commission")}</h2>
          <p className="text-muted-foreground text-sm">{t("commissionDesc")}</p>
        </div>
        <SellerCommission
          sellerId={seller.id}
          override={
            seller.commissionRate != null
              ? Math.round(Number(seller.commissionRate) * 10000) / 100
              : null
          }
          platformPercent={Math.round(platformRate * 10000) / 100}
        />
      </section>

      {/* Suspend / reactivate */}
      {store ? (
        <section className="space-y-3 rounded-lg border p-4">
          <div>
            <h2 className="font-medium">{t("moderation")}</h2>
            <p className="text-muted-foreground text-sm">{t("suspendHint")}</p>
          </div>
          <form action={setStoreStatus} className="flex flex-wrap gap-2">
            <input type="hidden" name="storeId" value={store.id} />
            <input
              type="hidden"
              name="status"
              value={suspended ? "ACTIVE" : "SUSPENDED"}
            />
            {!suspended ? (
              <Input
                name="reason"
                placeholder={t("reasonPlaceholder")}
                className="h-9 w-56 text-sm"
              />
            ) : null}
            <Button
              type="submit"
              size="sm"
              variant={suspended ? "outline" : "destructive"}
            >
              {suspended ? t("reactivate") : t("suspend")}
            </Button>
          </form>
        </section>
      ) : null}

      {/* Payout history */}
      <section className="space-y-3">
        <h2 className="font-medium">{t("payouts")}</h2>
        {seller.payouts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noPayouts")}</p>
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {seller.payouts.map((p) => (
                <li key={p.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-muted-foreground text-xs whitespace-nowrap">
                      {format.dateTime(p.createdAt, { dateStyle: "medium" })}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
                        payoutBadge[p.status] ?? "bg-muted",
                      )}
                    >
                      {p.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="font-medium" dir="ltr">
                      {money(p.amountUsd)}
                    </span>
                    <span className="text-muted-foreground">{p.method}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto rounded-lg border md:block">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-3 py-2 text-start font-medium">
                      {t("date")}
                    </th>
                    <th className="px-3 py-2 text-start font-medium">
                      {t("amount")}
                    </th>
                    <th className="px-3 py-2 text-start font-medium">
                      {t("method")}
                    </th>
                    <th className="px-3 py-2 text-start font-medium">
                      {t("status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {seller.payouts.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {format.dateTime(p.createdAt, { dateStyle: "medium" })}
                      </td>
                      <td className="px-3 py-2" dir="ltr">
                        {money(p.amountUsd)}
                      </td>
                      <td className="px-3 py-2">{p.method}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-xs font-medium",
                            payoutBadge[p.status] ?? "bg-muted",
                          )}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-lg font-semibold" dir="ltr">
        {value}
      </p>
    </div>
  );
}
