import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";

import { pointLedgerSummary } from "@/lib/point-ledger";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { PointPayoutForm } from "@/components/admin/point-payout-form";

// Per-point settlement: headline balance + fee/payout totals, a record-a-
// payout form, and the raw ledger. The balance is what Hezalli owes the
// operator for parcels handled through their hub.
export default async function AdminPointDetailPage({
  params,
}: {
  params: Promise<{ pointId: string }>;
}) {
  const { pointId } = await params;
  const t = await getTranslations("AdminPoints");
  const format = await getFormatter();

  const point = await prisma.deliveryPoint.findUnique({
    where: { id: pointId },
    select: {
      id: true,
      name: true,
      governorate: true,
      city: true,
      addressLine: true,
      phone: true,
      status: true,
      owner: { select: { name: true, email: true } },
    },
  });
  if (!point) notFound();

  const [summary, entries] = await Promise.all([
    pointLedgerSummary(pointId),
    prisma.deliveryPointLedgerEntry.findMany({
      where: { pointId },
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
    { key: "balanceOwed", value: summary.balance, accent: true },
    { key: "totalFees", value: summary.totalFees },
    { key: "totalPaidOut", value: summary.totalPaidOut },
    { key: "cashOnHand", value: summary.cashOnHand, accent: true },
    { key: "totalCodCollected", value: summary.totalCodCollected },
    { key: "totalCodRemitted", value: summary.totalCodRemitted },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/admin/points"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" /> {t("backToPoints")}
      </Link>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          {point.name}
          {point.status === "SUSPENDED" ? (
            <span className="bg-destructive/10 text-destructive rounded px-1.5 py-0.5 text-xs font-medium">
              {t("suspended")}
            </span>
          ) : null}
        </h1>
        <p className="text-muted-foreground text-sm">
          {point.addressLine}, {point.city}, {point.governorate} ·{" "}
          <span dir="ltr">{point.phone}</span> · {point.owner.email}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.key}
            className={cn(
              "rounded-lg border p-3",
              s.accent && "border-emerald-500/40 bg-emerald-500/5",
            )}
          >
            <p className="text-muted-foreground text-xs font-medium">
              {t(s.key)}
            </p>
            <p className="mt-1 text-lg font-semibold" dir="ltr">
              {money(s.value)}
            </p>
          </div>
        ))}
      </div>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">{t("recordHeading")}</h2>
        <PointPayoutForm pointId={point.id} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("ledgerHeading")}</h2>
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noEntries")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t(`type_${e.type}`)}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {format.dateTime(e.createdAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {e.note ? ` — ${e.note}` : null}
                  </p>
                </div>
                <span
                  className={cn(
                    "font-semibold",
                    Number(e.amountUsd) >= 0
                      ? "text-emerald-600"
                      : "text-destructive",
                  )}
                  dir="ltr"
                >
                  {money(Number(e.amountUsd))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
