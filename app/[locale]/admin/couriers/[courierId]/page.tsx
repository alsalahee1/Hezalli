import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { courierCodStatus } from "@/lib/cod-guard";
import { courierCashSummary } from "@/lib/courier-ledger";
import { courierRating } from "@/lib/courier-ratings";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { CourierRemittanceForm } from "@/components/admin/courier-remittance-form";
import { CourierPayoutForm } from "@/components/admin/courier-payout-form";
import { CourierOffsetForm } from "@/components/admin/courier-offset-form";
import { DepositForm } from "@/components/admin/deposit-form";

// Per-courier COD reconciliation: headline cash-on-hand + earnings, a record-a-
// remittance form, and the raw ledger. Cash-on-hand is what the driver still
// owes the office; earnings are what Hezalli owes the driver.
export default async function AdminCourierDetailPage({
  params,
}: {
  params: Promise<{ courierId: string }>;
}) {
  const { courierId } = await params;
  const t = await getTranslations("AdminCouriers");
  const format = await getFormatter();

  const courier = await prisma.user.findFirst({
    where: { id: courierId, roles: { has: "COURIER" } },
    select: {
      id: true,
      name: true,
      email: true,
      fleet: { select: { id: true, name: true } },
    },
  });
  if (!courier) notFound();

  const [summary, rating, cod, entries] = await Promise.all([
    courierCashSummary(courierId),
    courierRating(courierId),
    courierCodStatus(courierId),
    prisma.courierLedgerEntry.findMany({
      where: { courierId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        type: true,
        amountUsd: true,
        note: true,
        subOrderId: true,
        createdAt: true,
      },
    }),
  ]);

  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "USD" });

  const stats: { key: string; value: number; accent?: boolean }[] = [
    { key: "cashOnHand", value: summary.cashOnHand, accent: true },
    { key: "earnings", value: summary.earnings },
    { key: "earningsPaid", value: summary.earningsPaid },
    { key: "totalCollected", value: summary.totalCollected },
    { key: "totalRemitted", value: summary.totalRemitted },
  ];

  const typeLabel: Record<string, string> = {
    COD_COLLECTED: t("type_COD_COLLECTED"),
    REMITTANCE: t("type_REMITTANCE"),
    EARNING: t("type_EARNING"),
    PAYOUT: t("type_PAYOUT"),
    ADJUSTMENT: t("type_ADJUSTMENT"),
  };

  return (
    <div className="space-y-6">
      <Link
        href="/admin/couriers"
        className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("backToCouriers")}
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {courier.name ?? courier.email ?? t("driver")}
        </h1>
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          {courier.email}
          {rating.count > 0 ? (
            <span className="font-medium text-amber-600" dir="ltr">
              ★ {rating.avg.toFixed(1)} ({rating.count})
            </span>
          ) : null}
          {courier.fleet ? (
            <Link
              href={`/admin/fleets/${courier.fleet.id}`}
              className="rounded bg-violet-500/15 px-1.5 py-0.5 text-xs font-medium text-violet-700 hover:underline dark:text-violet-400"
            >
              {courier.fleet.name}
            </Link>
          ) : null}
          {cod.blocked ? (
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-xs font-semibold text-red-600">
              {cod.reason === "overdue"
                ? t("codBadgeOverdue")
                : t("codBadgeOverLimit")}
            </span>
          ) : null}
        </p>
      </div>

      {/* Headline figures */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.key}
            className={cn(
              "rounded-xl border p-4",
              s.accent && s.value > 0 && "border-amber-500/40 bg-amber-500/5",
            )}
          >
            <p className="text-muted-foreground text-xs">{t(s.key)}</p>
            <p className="mt-1 text-xl font-semibold" dir="ltr">
              {money(s.value)}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Record a cash hand-in */}
        <section className="rounded-xl border p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("recordTitle")}</h2>
          <CourierRemittanceForm courierId={courier.id} />
        </section>

        {/* Pay out earnings */}
        <section className="rounded-xl border p-4">
          <h2 className="mb-1 text-sm font-semibold">{t("payoutTitle")}</h2>
          <p className="text-muted-foreground mb-3 text-xs">
            {t("payoutOwed")}:{" "}
            <span className="text-foreground font-medium" dir="ltr">
              {money(summary.earnings)}
            </span>
          </p>
          <CourierPayoutForm courierId={courier.id} owed={summary.earnings} />
          {summary.cashOnHand > 0 ? (
            <div className="mt-4 border-t pt-3">
              <p className="text-muted-foreground mb-2 text-xs">
                {t("offsetHint", {
                  amount: money(Math.min(summary.cashOnHand, summary.earnings)),
                })}
              </p>
              <CourierOffsetForm
                courierId={courier.id}
                offsetable={Math.min(summary.cashOnHand, summary.earnings)}
              />
            </div>
          ) : null}
        </section>

        {/* Security deposit & personal COD credit limit (docs §32) */}
        <section className="rounded-xl border p-4 md:col-span-2">
          <h2 className="mb-1 text-sm font-semibold">{t("depositTitle")}</h2>
          <p className="text-muted-foreground mb-3 text-xs">
            {cod.baseLimit > 0
              ? t("limitBreakdown", {
                  limit: money(cod.cashLimit),
                  base: money(cod.baseLimit),
                  deposit: money(cod.deposit),
                  trust: money(cod.trustBonus),
                  deliveries: cod.deliveries,
                })
              : t("limitOff")}
          </p>
          <div className="max-w-sm">
            <DepositForm
              target="courier"
              targetId={courier.id}
              current={cod.deposit}
            />
          </div>
        </section>
      </div>

      {/* Ledger */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("ledgerTitle")}</h2>
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("ledgerEmpty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  <th className="p-2 text-start font-medium">{t("colDate")}</th>
                  <th className="p-2 text-start font-medium">{t("colType")}</th>
                  <th className="p-2 text-end font-medium">{t("colAmount")}</th>
                  <th className="p-2 text-start font-medium">{t("colNote")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const amt = Number(e.amountUsd);
                  return (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="text-muted-foreground p-2 whitespace-nowrap">
                        {format.dateTime(e.createdAt, { dateStyle: "short" })}
                      </td>
                      <td className="p-2">{typeLabel[e.type] ?? e.type}</td>
                      <td
                        className={cn(
                          "p-2 text-end font-medium whitespace-nowrap",
                          amt < 0 ? "text-emerald-600" : "",
                        )}
                        dir="ltr"
                      >
                        {money(amt)}
                      </td>
                      <td className="text-muted-foreground p-2">
                        {e.note ??
                          (e.subOrderId
                            ? `#${e.subOrderId.slice(-8).toUpperCase()}`
                            : "—")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
